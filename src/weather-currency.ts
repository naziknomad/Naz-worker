//ДЗ 18.11 - отображать погоду и курс валют одновременно

export interface Weather {
	current: {
		time: string;
		temperature_2m: number;
		wind_speed_10m: number;
	};
}

export interface Rates {
	base_code: string;
	rates: Record<string, number>;
}

export async function getWeather(): Promise<Weather> {
	const url =
		"https://api.open-meteo.com/v1/forecast?latitude=43.24&longitude=76.89&current=temperature_2m,wind_speed_10m";
	const response = await fetch(url);
	if (!response.ok) throw new Error(`Погода: HTTP ${response.status}`);
	//console.log(response);
	const data: Weather = await response.json();
	//console.log(data);
	return data;
}

//отправляем запрос на получение курса валют (придет не сразу)
export async function getRates(base: string = "USD"): Promise<Rates> {
	//адрес куда отрправлен запрос (base - валюта, относительно которой даны курсы)
	const url = `https://open.er-api.com/v6/latest/${base}`;
	//ожидаем пока ответят
	const response = await fetch(url);
	if (!response.ok) throw new Error(`Курс валют: HTTP ${response.status}`);
	//мы получили данные, но его нужно распаковать в json
	const data: Rates = await response.json();
	//console.log(data);
	return data;
	// возращает обещание
}
//просим курсы относительно USD и относительно EUR одновременно
//здесь нужен именно Promise.all: без обоих курсов кросс-курс не посчитать
export async function getUsdEurRates(): Promise<{ usd: Rates; eur: Rates }> {
	const [usd, eur] = await Promise.all([getRates("USD"), getRates("EUR")]);
	return { usd, eur };
}
