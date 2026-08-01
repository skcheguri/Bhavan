import { defineConfig, devices } from "@playwright/test";

// E2E tests run against a real running instance of the app (dev server
// by default) -- they exercise real routing, real Supabase calls, and
// real RLS, unlike the Vitest suite which mocks the Supabase client.
// See e2e/README.md for how to point this at a seeded test project
// instead of whatever VITE_PUBLIC_SUPABASE_* your local .env has.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    // Generous in CI: a cold runner cannot start Vite as fast as a warm
    // dev box, and this gate blocks deploys -- a timeout here would read
    // as a failing test suite rather than a slow machine.
    timeout: process.env.CI ? 120_000 : 30_000,
  },
});
