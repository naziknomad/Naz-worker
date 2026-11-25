import { defineConfig } from "vite-plus";

// The app is a static SPA with no Worker code, so tests run in plain Node.
export default defineConfig({
	test: {
		include: ["src/**/*.test.ts"],
	},
});
