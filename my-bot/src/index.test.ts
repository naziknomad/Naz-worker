import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import worker from "./index.ts";

const TOKEN = "123:TEST_TOKEN";
const SECRET = "s3cret_value";
const env = { BOT_TOKEN: TOKEN, WEBHOOK_SECRET: SECRET } as Env;

/** Фейковый ExecutionContext: собираем фоновые задачи, чтобы дождаться их в тесте. */
function makeCtx() {
	const tasks: Promise<unknown>[] = [];
	const ctx = { waitUntil: (p: Promise<unknown>) => void tasks.push(p) } as ExecutionContext;
	return { ctx, done: () => Promise.all(tasks) };
}

/** Подменяем fetch и запоминаем вызовы к Telegram: [метод, тело]. */
function stubTelegram() {
	const calls: { method: string; body: Record<string, unknown>; url: string }[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, init?: RequestInit) => {
			if (url.startsWith("https://api.telegram.org/")) {
				const method = url.split("/").pop() ?? "";
				const raw = typeof init?.body === "string" ? init.body : "{}";
				calls.push({ method, body: JSON.parse(raw) as Record<string, unknown>, url });
				return Response.json({
					ok: true,
					result: method === "getMe" ? { username: "my_bot" } : true,
				});
			}
			if (url.includes("open-meteo")) {
				return Response.json({
					current: { time: "t", temperature_2m: 5, wind_speed_10m: 3 },
				});
			}
			return new Response("unexpected", { status: 404 });
		}),
	);
	return calls;
}

const WEBHOOK_URL = "https://my-bot.example.workers.dev/webhook";

const webhook = (body: unknown, secret: string | null = SECRET) =>
	new Request(WEBHOOK_URL, {
		method: "POST",
		headers: secret === null ? {} : { "X-Telegram-Bot-Api-Secret-Token": secret },
		body: typeof body === "string" ? body : JSON.stringify(body),
	});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("GET /", () => {
	it("answers that the bot is alive", async () => {
		const { ctx } = makeCtx();
		const res = await worker.fetch(new Request("https://example.com/"), env, ctx);
		expect(res.status).toBe(200);
		expect(await res.text()).toContain("my-bot работает");
	});
});

describe("/webhook security", () => {
	it("rejects non-POST requests", async () => {
		const { ctx } = makeCtx();
		const res = await worker.fetch(new Request(WEBHOOK_URL), env, ctx);
		expect(res.status).toBe(405);
	});

	it("rejects a request without the secret header", async () => {
		const calls = stubTelegram();
		const { ctx, done } = makeCtx();
		const res = await worker.fetch(webhook({ update_id: 1 }, null), env, ctx);
		expect(res.status).toBe(403);
		await done();
		expect(calls).toHaveLength(0);
	});

	it("rejects a wrong secret", async () => {
		const calls = stubTelegram();
		const { ctx, done } = makeCtx();
		const res = await worker.fetch(webhook({ update_id: 1 }, "wrong"), env, ctx);
		expect(res.status).toBe(403);
		await done();
		expect(calls).toHaveLength(0);
	});

	it("never accepts an empty header when secrets are not configured", async () => {
		const { ctx } = makeCtx();
		const res = await worker.fetch(webhook({ update_id: 1 }, ""), {} as Env, ctx);
		expect(res.status).toBe(500);
	});

	it("rejects broken JSON", async () => {
		const { ctx } = makeCtx();
		const res = await worker.fetch(webhook("{not json"), env, ctx);
		expect(res.status).toBe(400);
	});
});

describe("/webhook handling", () => {
	it("answers 200 at once and replies in the background", async () => {
		const calls = stubTelegram();
		const { ctx, done } = makeCtx();
		const res = await worker.fetch(
			webhook({ update_id: 1, message: { chat: { id: 42 }, text: "/weather" } }),
			env,
			ctx,
		);
		expect(res.status).toBe(200);
		await done();

		expect(calls).toHaveLength(1);
		expect(calls[0]?.method).toBe("sendMessage");
		expect(calls[0]?.url).toContain(`/bot${TOKEN}/`);
		expect(calls[0]?.body).toMatchObject({
			chat_id: 42,
			text: "В Алматы сейчас 5 °C\nВетер 3 км/ч",
		});
	});

	it("shows the greeting with buttons for unknown text", async () => {
		const calls = stubTelegram();
		const { ctx, done } = makeCtx();
		await worker.fetch(
			webhook({ update_id: 2, message: { chat: { id: 7 }, text: "привет" } }),
			env,
			ctx,
		);
		await done();
		expect(calls[0]?.body).toHaveProperty("reply_markup.inline_keyboard");
	});

	it("handles a button press: answers the callback, then sends the reply", async () => {
		const calls = stubTelegram();
		const { ctx, done } = makeCtx();
		await worker.fetch(
			webhook({
				update_id: 3,
				callback_query: { id: "cb1", data: "/weather", message: { chat: { id: 9 } } },
			}),
			env,
			ctx,
		);
		await done();
		expect(calls.map((c) => c.method)).toEqual(["answerCallbackQuery", "sendMessage"]);
		expect(calls[0]?.body).toEqual({ callback_query_id: "cb1" });
		expect(calls[1]?.body).toMatchObject({ chat_id: 9 });
	});

	it("ignores updates without text", async () => {
		const calls = stubTelegram();
		const { ctx, done } = makeCtx();
		const res = await worker.fetch(
			webhook({ update_id: 4, message: { chat: { id: 1 } } }),
			env,
			ctx,
		);
		expect(res.status).toBe(200);
		await done();
		expect(calls).toHaveLength(0);
	});

	it("still answers 200 to Telegram when sending the reply fails", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => Response.json({ ok: false, description: "boom" })),
		);
		const errors = vi.spyOn(console, "error").mockImplementation(() => {});
		const { ctx, done } = makeCtx();
		const res = await worker.fetch(
			webhook({ update_id: 5, message: { chat: { id: 1 }, text: "привет" } }),
			env,
			ctx,
		);
		expect(res.status).toBe(200);
		await done();
		expect(errors).toHaveBeenCalled();
		//в лог не должен попасть токен
		expect(JSON.stringify(errors.mock.calls)).not.toContain(TOKEN);
		errors.mockRestore();
	});
});

describe("/register", () => {
	const register = (key?: string) =>
		new Request(
			`https://my-bot.example.workers.dev/register${key === undefined ? "" : `?key=${key}`}`,
		);

	it("rejects a missing or wrong key", async () => {
		const calls = stubTelegram();
		const { ctx } = makeCtx();
		expect((await worker.fetch(register(), env, ctx)).status).toBe(403);
		expect((await worker.fetch(register("nope"), env, ctx)).status).toBe(403);
		expect(calls).toHaveLength(0);
	});

	it("sets the webhook with the secret_token and the command menu", async () => {
		const calls = stubTelegram();
		const { ctx } = makeCtx();
		const res = await worker.fetch(register(SECRET), env, ctx);
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain("https://my-bot.example.workers.dev/webhook");
		expect(body).toContain("@my_bot");
		//ответ не должен раскрывать токен
		expect(body).not.toContain(TOKEN);

		expect(calls.map((c) => c.method)).toEqual(["setWebhook", "setMyCommands", "getMe"]);
		expect(calls[0]?.body).toMatchObject({
			url: "https://my-bot.example.workers.dev/webhook",
			secret_token: SECRET,
		});
	});

	it("passes Telegram errors on as 502", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => Response.json({ ok: false, description: "Unauthorized" })),
		);
		const { ctx } = makeCtx();
		const res = await worker.fetch(register(SECRET), env, ctx);
		expect(res.status).toBe(502);
		expect(await res.text()).toContain("Unauthorized");
	});
});
