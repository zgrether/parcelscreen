/**
 * `pnpm screenshots` (step 2 plan §10, PR 6): the hand-back's screenshots, at 1280 × 800 and 375 × 812, written to
 * test-results/screenshots/. The e2e config, pointed at screenshots/ (never part of `pnpm e2e` or CI): the fixtures'
 * recordings replayed as in the e2e, and the state aerial's tiles fetched live so the map looks as it does.
 */
import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testDir: "screenshots",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
});
