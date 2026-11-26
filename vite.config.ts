import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite-plus";

export default defineConfig({
	plugins: [cloudflare()],
	// my-bot/ — отдельный Worker со своим package.json и своими проверками (cd my-bot && npm run check)
	fmt: { useTabs: true, ignorePatterns: ["my-bot/**"] },
	lint: {
		ignorePatterns: ["my-bot/**"],
		options: { typeAware: true, typeCheck: true },
	},
});
