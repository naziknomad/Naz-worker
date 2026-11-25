import { describe, formatTemp, hpaToMmHg, placeFromHash, placeToHash, type Place } from "./lib.ts";

interface GeoResult {
	name: string;
	latitude: number;
	longitude: number;
	admin1?: string;
	country?: string;
}

interface Forecast {
	timezone: string;
	current: {
		temperature_2m: number;
		apparent_temperature: number;
		relative_humidity_2m: number;
		pressure_msl: number;
		wind_speed_10m: number;
		weather_code: number;
		is_day: number;
	};
	daily: {
		time: string[];
		weather_code: number[];
		temperature_2m_max: number[];
		temperature_2m_min: number[];
	};
}

const DEFAULT_PLACE: Place = { name: "Алматы", lat: 43.25, lon: 76.95, country: "Казахстан" };
const STORAGE_KEY = "weather:last-place";

function $<T extends HTMLElement>(id: string): T {
	const el = document.getElementById(id);
	if (!el) throw new Error(`Element #${id} not found`);
	return el as T;
}

const form = $<HTMLFormElement>("search-form");
const input = $<HTMLInputElement>("search-input");
const geoButton = $<HTMLButtonElement>("geo-button");
const suggestions = $<HTMLUListElement>("suggestions");
const statusEl = $("status");
const currentEl = $("current");
const forecastSection = $("forecast-section");
const forecastEl = $("forecast");

let requestId = 0;

function setStatus(text: string, isError = false): void {
	statusEl.textContent = text;
	statusEl.classList.toggle("error", isError);
}

// ---------- Routing (hash: #/lat,lon/Name) ----------

function loadSavedPlace(): Place | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? (JSON.parse(raw) as Place) : null;
	} catch {
		return null;
	}
}

function savePlace(p: Place): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
	} catch {
		// storage may be unavailable; ignore
	}
}

function navigate(p: Place): void {
	const hash = placeToHash(p);
	if (location.hash === hash) {
		void render(p);
	} else {
		location.hash = hash; // triggers hashchange -> render
	}
}

// ---------- API ----------

async function fetchJson<T>(url: string): Promise<T> {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	return (await res.json()) as T;
}

async function searchPlaces(query: string): Promise<Place[]> {
	const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
	url.searchParams.set("name", query);
	url.searchParams.set("count", "6");
	url.searchParams.set("language", "ru");
	const data = await fetchJson<{ results?: GeoResult[] }>(url.toString());
	return (data.results ?? []).map((r) => ({
		name: r.name,
		lat: r.latitude,
		lon: r.longitude,
		admin: r.admin1,
		country: r.country,
	}));
}

async function fetchForecast(p: Place): Promise<Forecast> {
	const url = new URL("https://api.open-meteo.com/v1/forecast");
	url.searchParams.set("latitude", String(p.lat));
	url.searchParams.set("longitude", String(p.lon));
	url.searchParams.set(
		"current",
		"temperature_2m,apparent_temperature,relative_humidity_2m,pressure_msl,wind_speed_10m,weather_code,is_day",
	);
	url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min");
	url.searchParams.set("wind_speed_unit", "ms");
	url.searchParams.set("timezone", "auto");
	url.searchParams.set("forecast_days", "7");
	return fetchJson<Forecast>(url.toString());
}

// ---------- Rendering ----------

function setText(id: string, text: string): void {
	$(id).textContent = text;
}

function renderCurrent(p: Place, f: Forecast): void {
	const c = f.current;
	const [icon, desc] = describe(c.weather_code);
	setText("place-name", p.name);
	setText("place-meta", [p.admin, p.country].filter(Boolean).join(", ") || f.timezone);
	setText("now-icon", c.is_day === 0 && c.weather_code <= 1 ? "🌙" : icon);
	setText("now-temp", formatTemp(c.temperature_2m));
	setText("now-desc", desc);
	setText("now-feels", formatTemp(c.apparent_temperature));
	setText("now-wind", `${c.wind_speed_10m.toFixed(1)} м/с`);
	setText("now-humidity", `${c.relative_humidity_2m}%`);
	setText("now-pressure", `${hpaToMmHg(c.pressure_msl)} мм рт. ст.`);
	currentEl.hidden = false;
}

function renderForecast(f: Forecast): void {
	forecastEl.replaceChildren();
	const fmtDay = new Intl.DateTimeFormat("ru-RU", { weekday: "short" });
	const fmtDate = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });

	f.daily.time.forEach((iso, i) => {
		const date = new Date(`${iso}T12:00:00`);
		const [icon, desc] = describe(f.daily.weather_code[i] ?? 0);

		const li = document.createElement("li");

		const day = document.createElement("div");
		day.className = "day";
		day.textContent = i === 0 ? "Сегодня" : fmtDay.format(date);
		const small = document.createElement("small");
		small.textContent = fmtDate.format(date);
		day.append(small);

		const ic = document.createElement("span");
		ic.className = "f-icon";
		ic.textContent = icon;

		const d = document.createElement("span");
		d.className = "f-desc";
		d.textContent = desc;

		const range = document.createElement("span");
		range.className = "range";
		range.textContent = formatTemp(f.daily.temperature_2m_max[i] ?? 0);
		const min = document.createElement("span");
		min.textContent = ` / ${formatTemp(f.daily.temperature_2m_min[i] ?? 0)}`;
		range.append(min);

		li.append(day, ic, d, range);
		forecastEl.append(li);
	});
	forecastSection.hidden = false;
}

async function render(p: Place): Promise<void> {
	const id = ++requestId;
	setStatus("Загрузка…");
	document.title = `Погода — ${p.name}`;
	try {
		const f = await fetchForecast(p);
		if (id !== requestId) return; // a newer request superseded this one
		renderCurrent(p, f);
		renderForecast(f);
		savePlace(p);
		setStatus("");
	} catch {
		if (id !== requestId) return;
		setStatus("Не удалось загрузить погоду. Проверьте соединение и попробуйте ещё раз.", true);
	}
}

// ---------- Suggestions ----------

function hideSuggestions(): void {
	suggestions.hidden = true;
	suggestions.replaceChildren();
}

function showSuggestions(places: Place[]): void {
	suggestions.replaceChildren();
	for (const p of places) {
		const li = document.createElement("li");
		const btn = document.createElement("button");
		btn.type = "button";
		btn.append(p.name);
		const extra = [p.admin, p.country].filter(Boolean).join(", ");
		if (extra) {
			const small = document.createElement("small");
			small.textContent = ` — ${extra}`;
			btn.append(small);
		}
		btn.addEventListener("click", () => {
			hideSuggestions();
			input.value = "";
			navigate(p);
		});
		li.append(btn);
		suggestions.append(li);
	}
	suggestions.hidden = places.length === 0;
}

form.addEventListener("submit", async (e) => {
	e.preventDefault();
	const query = input.value.trim();
	if (!query) return;
	setStatus("Поиск…");
	hideSuggestions();
	try {
		const places = await searchPlaces(query);
		if (places.length === 0) {
			setStatus(`Город «${query}» не найден.`, true);
			return;
		}
		setStatus("");
		if (places.length === 1) {
			input.value = "";
			navigate(places[0]!);
		} else {
			showSuggestions(places);
		}
	} catch {
		setStatus("Ошибка поиска. Попробуйте ещё раз.", true);
	}
});

document.addEventListener("click", (e) => {
	if (!(e.target instanceof Node) || !form.contains(e.target)) hideSuggestions();
});

geoButton.addEventListener("click", () => {
	if (!("geolocation" in navigator)) {
		setStatus("Геолокация недоступна в этом браузере.", true);
		return;
	}
	setStatus("Определяем местоположение…");
	navigator.geolocation.getCurrentPosition(
		(pos) => {
			navigate({
				name: "Моё местоположение",
				lat: pos.coords.latitude,
				lon: pos.coords.longitude,
			});
		},
		() => setStatus("Не удалось получить местоположение. Проверьте разрешения.", true),
		{ timeout: 10_000 },
	);
});

// ---------- Boot ----------

window.addEventListener("hashchange", () => {
	const p = placeFromHash(location.hash);
	if (p) void render(p);
});

const initial = placeFromHash(location.hash) ?? loadSavedPlace() ?? DEFAULT_PLACE;
if (placeFromHash(location.hash)) {
	void render(initial);
} else {
	navigate(initial);
}
