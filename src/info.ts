import type { Rates, Weather } from "./weather-currency.ts";

export interface Info {
	city: string;
	weather: {
		temperature: number;
		windSpeed: number;
		time: string;
	};
	rates: {
		/** Сколько тенге стоит 1 доллар */
		usdKzt: number;
		/** Сколько тенге стоит 1 евро */
		eurKzt: number;
		/** Сколько тенге стоит 1 юань */
		cnyKzt: number;
		/** Кросс-курс: сколько долларов стоит 1 евро (через тенге) */
		eurUsd: number;
	};
}

const round = (n: number, digits: number): number => {
	const k = 10 ** digits;
	return Math.round(n * k) / k;
};

/** Собирает компактный ответ из сырых данных погоды и курсов (как в main() из ДЗ 8). */
export function buildInfo(weather: Weather, { usd, eur }: { usd: Rates; eur: Rates }): Info {
	const usdKzt = usd.rates["KZT"];
	const eurKzt = eur.rates["KZT"];
	const usdCny = usd.rates["CNY"];

	//курса может не оказаться в ответе - тогда считать нельзя
	const ok = (v: number | undefined): v is number => v !== undefined && Number.isFinite(v) && v > 0;
	if (!ok(usdKzt) || !ok(eurKzt) || !ok(usdCny)) {
		throw new Error("В ответе нет нужных валют");
	}

	return {
		city: "Алматы",
		weather: {
			temperature: weather.current.temperature_2m,
			windSpeed: weather.current.wind_speed_10m,
			time: weather.current.time,
		},
		rates: {
			usdKzt: round(usdKzt, 2),
			eurKzt: round(eurKzt, 2),
			cnyKzt: round(usdKzt / usdCny, 2),
			eurUsd: round(eurKzt / usdKzt, 4),
		},
	};
}
