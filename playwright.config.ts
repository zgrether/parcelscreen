/**
 * The browser e2e (step 18a; plan phase-0-18-acceptance.md §1): a production build, Chromium, the reference
 * parcels' recorded traffic replayed (e2e/replay.ts). The service worker is blocked here, as the 17c plan
 * says; e2e/pwa-screen.spec.ts allows it for its one test.
 */
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
// A normal Chrome user agent: some services reject headless ones (the replay doesn't care, the app might).
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

export default defineConfig({
  testDir: "e2e",
  // A screen with the volunteer services' 1 request/second throttle takes about a minute.
  timeout: 240_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://localhost:${PORT}`,
    userAgent: UA,
    viewport: { width: 1280, height: 800 },
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
  webServer: {
    // CI builds in its own step first (E2E_SKIP_BUILD=1), so a build failure reads as one.
    command: process.env.E2E_SKIP_BUILD
      ? `pnpm exec next start -p ${PORT}`
      : `pnpm build && pnpm exec next start -p ${PORT}`,
    url: `http://localhost:${PORT}/explore`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
