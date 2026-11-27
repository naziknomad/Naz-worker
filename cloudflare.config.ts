import { defineConfig } from "cf/config";
import * as entrypoint from "./src/worker.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "naz-worker",
		compatibilityDate: "2026-11-23",
		entrypoint,
		assets: {
			// Unknown paths fall back to index.html (SPA)
			notFoundHandling: "single-page-application",
			// Only /api/* goes to the Worker; everything else is served as static assets
			runWorkerFirst: ["/api/*"],
		},
		// Логи запросов и ошибок: Cloudflare → Workers & Pages → naz-worker → Observability
		observability: {
			logs: {
				enabled: true,
				headSamplingRate: 1, // сохранять 100% запросов
				invocationLogs: true,
				persist: true,
			},
			traces: {
				enabled: false,
				headSamplingRate: 1,
				persist: true,
			},
			issues: { enabled: false },
		},
	},
});
