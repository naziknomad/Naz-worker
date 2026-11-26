import { COMMANDS, KEYBOARD, reply, type Reply } from "./bot.ts";
import { tg, type Update } from "./telegram.ts";

const text = (body: string, status = 200): Response =>
	new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

/** Сравнение строк за одинаковое время (чтобы по скорости ответа нельзя было подбирать секрет). */
function safeEqual(a: string, b: string): boolean {
	const enc = new TextEncoder();
	const x = enc.encode(a);
	const y = enc.encode(b);
	return x.byteLength === y.byteLength && crypto.subtle.timingSafeEqual(x, y);
}

/** Обрабатываем одно обновление от Telegram: сообщение или нажатие на кнопку. */
export async function handleUpdate(update: Update, token: string): Promise<void> {
	//запрос приходит либо как сообщение, либо как нажатие на кнопку
	const query = update.callback_query;
	const incoming = update.message?.text ?? query?.data;
	const chatId = update.message?.chat.id ?? query?.message?.chat.id;

	//сообщаем Телеграму, что нажатие получено (иначе на кнопке крутятся "часики")
	//если кнопку нажали давно, Телеграм вернет ошибку - это не страшно
	if (query) {
		await tg(token, "answerCallbackQuery", { callback_query_id: query.id }).catch(() => {});
	}
	if (!incoming || chatId === undefined) return;

	//Promise.try: любая ошибка в обработчике (даже синхронная) станет отклоненным промисом,
	//и вместо падения бот ответит, что что-то пошло не так
	const answer = await Promise.try(() => reply(incoming)).catch((): Reply => ({
		text: "Что-то пошло не так, попробуйте еще раз",
	}));
	await tg(token, "sendMessage", {
		chat_id: chatId,
		text: answer.text,
		...(answer.withButtons ? { reply_markup: KEYBOARD } : {}),
	});
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		//Telegram сам присылает сюда каждое сообщение пользователя (webhook)
		if (url.pathname === "/webhook") {
			if (request.method !== "POST") return text("Method Not Allowed", 405);
			if (!env.WEBHOOK_SECRET || !env.BOT_TOKEN) return text("Секреты не настроены", 500);

			//Telegram кладет секрет в заголовок: чужие запросы без него отбрасываем
			const sent = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
			if (!safeEqual(sent, env.WEBHOOK_SECRET)) return text("Forbidden", 403);

			let update: Update;
			try {
				update = (await request.json()) as Update;
			} catch {
				return text("Bad Request", 400);
			}

			//сразу отвечаем Телеграму "принято", а сам ответ пользователю досчитываем в фоне:
			//запросы к погоде и курсам могут идти несколько секунд, а Telegram не любит ждать
			ctx.waitUntil(
				handleUpdate(update, env.BOT_TOKEN).catch((error: unknown) => {
					console.error("Ошибка обработки:", error instanceof Error ? error.message : error);
				}),
			);
			return text("ok");
		}

		//одноразовая настройка: открыть в браузере /register?key=<WEBHOOK_SECRET>
		//Worker сам скажет Телеграму свой адрес, поэтому токен не нужно вводить в терминале
		if (url.pathname === "/register") {
			if (!env.WEBHOOK_SECRET || !env.BOT_TOKEN) return text("Секреты не настроены", 500);
			if (!safeEqual(url.searchParams.get("key") ?? "", env.WEBHOOK_SECRET)) {
				return text("Forbidden", 403);
			}
			try {
				const webhookUrl = `${url.origin}/webhook`;
				await tg(env.BOT_TOKEN, "setWebhook", {
					url: webhookUrl,
					secret_token: env.WEBHOOK_SECRET,
					allowed_updates: ["message", "callback_query"],
				});
				//меню команд (кнопка "Меню" слева от поля ввода)
				await tg(env.BOT_TOKEN, "setMyCommands", { commands: COMMANDS });
				const me = await tg<{ username: string }>(env.BOT_TOKEN, "getMe", {});
				return text(`Готово. Webhook: ${webhookUrl}\nБот: @${me.username}`);
			} catch (error) {
				return text(error instanceof Error ? error.message : "Ошибка", 502);
			}
		}

		return text("my-bot работает. Напишите боту в Telegram.");
	},
} satisfies ExportedHandler<Env>;
