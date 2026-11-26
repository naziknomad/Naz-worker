export interface TgResponse<T> {
	ok: boolean;
	result: T;
	description?: string;
}

export interface Update {
	update_id: number;
	//обычное сообщение
	message?: { chat: { id: number }; text?: string };
	//нажатие на кнопку под сообщением
	callback_query?: { id: string; data?: string; message?: { chat: { id: number } } };
}

/** Вызов метода Telegram Bot API. Токен подставляется в адрес, поэтому его нельзя писать в логи. */
export async function tg<T>(token: string, method: string, body: object): Promise<T> {
	const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	const data = (await response.json()) as TgResponse<T>;
	if (!data.ok) {
		throw new Error(`Telegram ${method}: ${data.description}`);
	}
	return data.result;
}
