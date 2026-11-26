import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "my-bot",
		compatibilityDate: "2026-11-23",
		entrypoint,
		env: {
			// Токен от BotFather. Значение НЕ хранится в коде: его добавляют секретом в dash.cloudflare.com
			BOT_TOKEN: bindings.secret(),
			// Любая случайная строка (a-z, A-Z, 0-9, _ и -). Telegram присылает её в заголовке каждого
			// запроса, так мы отличаем настоящий webhook от чужих запросов. Тоже секрет.
			WEBHOOK_SECRET: bindings.secret(),
		},
	},
});
