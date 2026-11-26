import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { GREETING, reply, resolveCommand } from "./bot.ts";

const weatherBody = { current: { time: "2026-11-26T10:00", temperature_2m: 5, wind_speed_10m: 3 } };
const usdBody = { base_code: "USD", rates: { KZT: 500, CNY: 7.25 } };
const eurBody = { base_code: "EUR", rates: { KZT: 580 } };

/** Подменяем fetch: какой сервис отвечает, какой падает. */
function stubServices(opts: { weather?: boolean; rates?: boolean; backup?: boolean } = {}) {
	const { weather = true, rates = true, backup = true } = opts;
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string) => {
			if (url.includes("open-meteo")) {
				return weather ? Response.json(weatherBody) : new Response("x", { status: 500 });
			}
			if (url.includes("open.er-api.com")) {
				if (!rates) return new Response("x", { status: 500 });
				return Response.json(url.endsWith("/USD") ? usdBody : eurBody);
			}
			if (url.includes("currency-api")) {
				if (!backup) return new Response("x", { status: 500 });
				const base = url.includes("/usd.json") ? "usd" : "eur";
				const table = base === "usd" ? { kzt: 500, cny: 7.25 } : { kzt: 580 };
				return Response.json({ [base]: table });
			}
			return new Response("unexpected", { status: 404 });
		}),
	);
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("resolveCommand", () => {
	it("keeps slash commands and strips the bot name", () => {
		expect(resolveCommand("/weather")).toBe("/weather");
		expect(resolveCommand("/weather@my_bot")).toBe("/weather");
		expect(resolveCommand("  /RATES  ")).toBe("/rates");
	});

	it("understands plain words", () => {
		expect(resolveCommand("Погода")).toBe("/weather");
		expect(resolveCommand("какой курс доллара?")).toBe("/rates");
		expect(resolveCommand("всё сразу")).toBe("/all");
		expect(resolveCommand("все сразу")).toBe("/all");
	});

	it("returns an empty string for unknown text", () => {
		expect(resolveCommand("привет")).toBe("");
	});
});

describe("reply", () => {
	it("greets with buttons on unknown input", async () => {
		expect(await reply("привет")).toEqual({ text: GREETING, withButtons: true });
	});

	it("/weather shows the temperature", async () => {
		stubServices();
		const { text } = await reply("/weather");
		expect(text).toBe("В Алматы сейчас 5 °C\nВетер 3 км/ч");
	});

	it("/weather reports a failure in plain words", async () => {
		stubServices({ weather: false });
		expect((await reply("/weather")).text).toBe("Не удалось получить погоду");
	});

	it("/rates shows rates and the cross rate", async () => {
		stubServices();
		const { text } = await reply("/rates");
		expect(text).toContain("Курс USD к KZT: 500.00");
		expect(text).toContain("Курс EUR к KZT: 580.00");
		expect(text).toContain("Курс CNY к KZT: 68.97");
		expect(text).toContain("Кросс-курс EUR/USD через KZT: 1.1600");
	});

	it("/all (Promise.all) succeeds when both requests succeed", async () => {
		stubServices();
		const { text } = await reply("/all");
		expect(text).toContain("В Алматы сейчас 5 °C");
		expect(text).toContain("Курс USD к KZT");
		expect(text).toContain("Promise.all: оба запроса выполнены");
	});

	it("/all (Promise.all) gives nothing if one request fails", async () => {
		stubServices({ weather: false });
		const { text } = await reply("/all");
		expect(text).toContain("Promise.all отклонен");
		expect(text).not.toContain("Курс USD");
	});

	it("/settled (allSettled) still shows rates when weather fails", async () => {
		stubServices({ weather: false });
		const { text } = await reply("/settled");
		expect(text).toContain("Не удалось получить погоду");
		expect(text).toContain("Курс USD к KZT: 500.00");
		expect(text).toContain("погода - rejected, курсы - fulfilled");
	});

	it("/any (Promise.any) falls back to the second source", async () => {
		stubServices({ rates: false });
		const { text } = await reply("/any");
		expect(text).toContain("Курс USD к KZT: 500.00");
		expect(text).toContain("currency-api");
	});

	it("/any (Promise.any) reports when both sources are down", async () => {
		stubServices({ rates: false, backup: false });
		expect((await reply("/any")).text).toBe("Promise.any: оба источника курсов недоступны");
	});

	it("/chain lists then and finally steps on success", async () => {
		stubServices();
		const { text } = await reply("/chain");
		expect(text).toContain("then: данные получены");
		expect(text).toContain("finally: запрос завершен");
		expect(text).not.toContain("catch:");
	});

	it("/chain lists catch and finally steps on failure", async () => {
		stubServices({ weather: false });
		const { text } = await reply("/chain");
		expect(text).toContain("catch: запрос завершился ошибкой");
		expect(text).toContain("finally: запрос завершен");
	});
});
