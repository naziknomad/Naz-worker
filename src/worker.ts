import { buildInfo } from "./info.ts";
import { getUsdEurRates, getWeather } from "./weather-currency.ts";

export default {
	// Запускается только для /api/* (см. assets.runWorkerFirst в cloudflare.config.ts),
	// всё остальное отдаёт страница из ассетов.
	async fetch(request: Request): Promise<Response> {
		const { pathname } = new URL(request.url);

		if (pathname !== "/api/info") {
			return Response.json({ error: "Not found" }, { status: 404 });
		}

		try {
			//погода и курсы запрашиваются одновременно; если упал любой из запросов - упадёт весь Promise.all
			const [weather, rates] = await Promise.all([getWeather(), getUsdEurRates()]);
			return Response.json(buildInfo(weather, rates));
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return Response.json(
				{ error: "Не удалось получить данные", details: message },
				{ status: 502 },
			);
		}
	},
};
