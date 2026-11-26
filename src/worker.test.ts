import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { buildInfo } from "./info.ts";
import type { Rates, Weather } from "./weather-currency.ts";
import worker from "./worker.ts";

const weather: Weather = {
	current: { time: "2026-11-26T10:00", temperature_2m: 6.2, wind_speed_10m: 1.5 },
};
const usd: Rates = { base_code: "USD", rates: { KZT: 500, CNY: 7.25, EUR: 0.86 } };
const eur: Rates = { base_code: "EUR", rates: { KZT: 580, USD: 1.16 } };

describe("buildInfo", () => {
	it("builds weather and rounded rates", () => {
		expect(buildInfo(weather, { usd, eur })).toEqual({
			city: "Алматы",
			weather: { temperature: 6.2, windSpeed: 1.5, time: "2026-11-26T10:00" },
			rates: { usdKzt: 500, eurKzt: 580, cnyKzt: 68.97, eurUsd: 1.16 },
		});
	});

	it("throws when a needed currency is missing", () => {
		const noCny: Rates = { base_code: "USD", rates: { KZT: 500 } };
		expect(() => buildInfo(weather, { usd: noCny, eur })).toThrow("нет нужных валют");
	});

	it("throws on a zero rate instead of dividing by zero", () => {
		const zero: Rates = { base_code: "USD", rates: { KZT: 500, CNY: 0 } };
		expect(() => buildInfo(weather, { usd: zero, eur })).toThrow();
	});
});

describe("worker /api/info", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const stubFetch = (failOn?: string) =>
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				if (failOn && url.includes(failOn)) return new Response("boom", { status: 500 });
				if (url.includes("open-meteo")) return Response.json(weather);
				if (url.endsWith("/USD")) return Response.json(usd);
				if (url.endsWith("/EUR")) return Response.json(eur);
				return new Response("unexpected", { status: 404 });
			}),
		);

	it("returns weather and rates together", async () => {
		stubFetch();
		const res = await worker.fetch(new Request("https://example.com/api/info"));
		expect(res.status).toBe(200);
		const body = (await res.json()) as ReturnType<typeof buildInfo>;
		expect(body.weather.temperature).toBe(6.2);
		expect(body.rates.usdKzt).toBe(500);
	});

	it("requests weather and both rate tables (3 upstream calls)", async () => {
		stubFetch();
		await worker.fetch(new Request("https://example.com/api/info"));
		expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
	});

	it("answers 502 with a readable message when one upstream fails", async () => {
		stubFetch("open-meteo");
		const res = await worker.fetch(new Request("https://example.com/api/info"));
		expect(res.status).toBe(502);
		const body = (await res.json()) as { error: string; details: string };
		expect(body.error).toBe("Не удалось получить данные");
		expect(body.details).toContain("Погода");
	});

	it("answers 404 for other API paths", async () => {
		const res = await worker.fetch(new Request("https://example.com/api/other"));
		expect(res.status).toBe(404);
	});
});
