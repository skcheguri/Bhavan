import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

// Merges the project's real vite.config.ts (the "@/" alias, the React
// plugin, and the unplugin-auto-import plugin some components rely on
// for un-imported useState/useEffect/etc.) so tests see exactly the same
// module resolution and transforms as the actual app build.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      globals: true,
      css: true,
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/**/*.{test,spec}.{ts,tsx}"],
      exclude: ["node_modules", "dist", "out", "e2e", "android", "ios"],
      coverage: {
        provider: "v8",
        reporter: ["text", "html", "lcov"],
        reportsDirectory: "./coverage",
        include: ["src/**/*.{ts,tsx}"],
        exclude: [
          "src/**/*.{test,spec}.{ts,tsx}",
          "src/**/*.d.ts",
          "src/test/**",
          "src/main.tsx",
          "src/vite-env.d.ts",
          "src/router/**",
        ],
      },
    },
  })
);
