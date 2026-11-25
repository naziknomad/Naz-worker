import { describe as suite, expect, it } from "vite-plus/test";
import {
	WEATHER_CODES,
	describe,
	formatTemp,
	hpaToMmHg,
	placeFromHash,
	placeToHash,
} from "./lib.ts";

suite("describe", () => {
	it("returns icon and Russian text for a known code", () => {
		expect(describe(0)).toEqual(["☀️", "Ясно"]);
		expect(describe(95)).toEqual(["⛈️", "Гроза"]);
	});

	it("falls back for an unknown code", () => {
		expect(describe(1234)).toEqual(["🌡️", "Нет данных"]);
	});

	it("has a non-empty icon and text for every code", () => {
		for (const [icon, text] of Object.values(WEATHER_CODES)) {
			expect(icon).not.toBe("");
			expect(text).not.toBe("");
		}
	});
});

suite("formatTemp", () => {
	it("adds a plus sign for positive temperatures", () => {
		expect(formatTemp(5.6)).toBe("+6°");
	});

	it("keeps the minus sign for negative temperatures", () => {
		expect(formatTemp(-3.2)).toBe("-3°");
	});

	it("shows zero without a sign, including values that round to zero", () => {
		expect(formatTemp(0)).toBe("0°");
		expect(formatTemp(-0.4)).toBe("0°");
		expect(formatTemp(0.4)).toBe("0°");
	});
});

suite("hpaToMmHg", () => {
	it("converts hPa to mmHg", () => {
		expect(hpaToMmHg(1013.25)).toBe(760);
		expect(hpaToMmHg(1020)).toBe(765);
	});
});

suite("place hash", () => {
	it("serialises a place into a hash", () => {
		expect(placeToHash({ name: "Алматы", lat: 43.25, lon: 76.95 })).toBe(
			`#/43.2500,76.9500/${encodeURIComponent("Алматы")}`,
		);
	});

	it("round-trips name and coordinates", () => {
		const place = { name: "Нур-Султан / Астана", lat: 51.1801, lon: 71.446 };
		expect(placeFromHash(placeToHash(place))).toEqual(place);
	});

	it("parses negative coordinates", () => {
		expect(placeFromHash("#/-33.8688,151.2093/Sydney")).toEqual({
			name: "Sydney",
			lat: -33.8688,
			lon: 151.2093,
		});
	});

	it("rejects malformed hashes", () => {
		expect(placeFromHash("")).toBeNull();
		expect(placeFromHash("#/")).toBeNull();
		expect(placeFromHash("#/abc,def/Name")).toBeNull();
		expect(placeFromHash("#/43.25,76.95")).toBeNull();
	});

	it("rejects out-of-range coordinates", () => {
		expect(placeFromHash("#/91,10/X")).toBeNull();
		expect(placeFromHash("#/10,181/X")).toBeNull();
	});

	it("rejects an invalid percent-encoded name", () => {
		expect(placeFromHash("#/10,10/%E0%A4%A")).toBeNull();
	});
});
