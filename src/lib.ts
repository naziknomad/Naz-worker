export interface Place {
	name: string;
	lat: number;
	lon: number;
	admin?: string;
	country?: string;
}

export const WEATHER_CODES: Record<number, [string, string]> = {
	0: ["☀️", "Ясно"],
	1: ["🌤️", "Преимущественно ясно"],
	2: ["⛅", "Переменная облачность"],
	3: ["☁️", "Пасмурно"],
	45: ["🌫️", "Туман"],
	48: ["🌫️", "Изморозь"],
	51: ["🌦️", "Лёгкая морось"],
	53: ["🌦️", "Морось"],
	55: ["🌧️", "Сильная морось"],
	56: ["🌧️", "Ледяная морось"],
	57: ["🌧️", "Сильная ледяная морось"],
	61: ["🌧️", "Небольшой дождь"],
	63: ["🌧️", "Дождь"],
	65: ["🌧️", "Сильный дождь"],
	66: ["🌧️", "Ледяной дождь"],
	67: ["🌧️", "Сильный ледяной дождь"],
	71: ["🌨️", "Небольшой снег"],
	73: ["🌨️", "Снег"],
	75: ["❄️", "Сильный снег"],
	77: ["❄️", "Снежные зёрна"],
	80: ["🌦️", "Небольшой ливень"],
	81: ["🌧️", "Ливень"],
	82: ["⛈️", "Сильный ливень"],
	85: ["🌨️", "Снегопад"],
	86: ["❄️", "Сильный снегопад"],
	95: ["⛈️", "Гроза"],
	96: ["⛈️", "Гроза с градом"],
	99: ["⛈️", "Сильная гроза с градом"],
};

/** Icon and Russian description for an Open-Meteo WMO weather code. */
export function describe(code: number): [string, string] {
	return WEATHER_CODES[code] ?? ["🌡️", "Нет данных"];
}

/** Temperature rounded to whole degrees with an explicit "+" for positive values. */
export function formatTemp(n: number): string {
	const r = Math.round(n);
	return `${r > 0 ? "+" : ""}${r}°`;
}

/** Sea-level pressure in hPa converted to mmHg. */
export function hpaToMmHg(hpa: number): number {
	return Math.round(hpa * 0.750062);
}

/** Курс с фиксированным числом знаков и запятой, как принято в русской локали: 460,04 */
export function formatRate(n: number, digits = 2): string {
	return new Intl.NumberFormat("ru-RU", {
		minimumFractionDigits: digits,
		maximumFractionDigits: digits,
	}).format(n);
}

export function placeToHash(p: Place): string {
	return `#/${p.lat.toFixed(4)},${p.lon.toFixed(4)}/${encodeURIComponent(p.name)}`;
}

export function placeFromHash(hash: string): Place | null {
	const m = /^#\/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\/(.+)$/.exec(hash);
	if (!m) return null;
	const lat = Number(m[1]);
	const lon = Number(m[2]);
	if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
	try {
		return { lat, lon, name: decodeURIComponent(m[3]!) };
	} catch {
		return null;
	}
}
