import { defineConfig } from "cf/config";

export default defineConfig({
	worker: {
		name: "naz-worker",
		compatibilityDate: "2026-11-23",
		// Static SPA: unknown paths fall back to index.html
		assets: {
			notFoundHandling: "single-page-application",
		},
	},
});
