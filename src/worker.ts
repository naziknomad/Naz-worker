import { buildInfo } from "./info.ts";
import { getUsdEurRates, getWeather } from "./weather-currency.ts";

// Response.json() отдаёт "application/json" без charset, и Safari при открытии ответа
// прямо в адресной строке читает кириллицу не как UTF-8. Указываем кодировку явно.
function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json; charset=utf-8" },
	});
}

export default {
	// Запускается только для /api/* (см. assets.runWorkerFirst в cloudflare.config.ts),
	// всё остальное отдаёт страница из ассетов.
	async fetch(request: Request): Promise<Response> {
		const { pathname } = new URL(request.url);

		if (pathname !== "/api/info") {
			return json({ error: "Not found" }, 404);
		}

		try {
			//погода и курсы запрашиваются одновременно; если упал любой из запросов - упадёт весь Promise.all
			const [weather, rates] = await Promise.all([getWeather(), getUsdEurRates()]);
			return json(buildInfo(weather, rates));
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return json({ error: "Не удалось получить данные", details: message }, 502);
		}
	},
};
