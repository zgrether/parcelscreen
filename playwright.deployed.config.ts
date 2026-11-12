/**
 * A screenshot spec against a deployment (the existing-house mission's deployed check, docs/plans/existing-house.md §7):
 * the screenshots config with no local server, its base URL the deployment's (DEPLOYED_URL, from the workflow's
 * deployment_status event). The specs' `test` is still screenshots/fixtures.ts, so the owner-field guard holds.
 */
import { defineConfig } from "@playwright/test";
import base from "./playwright.screenshots.config";

const url = process.env.DEPLOYED_URL;
if (!url) throw new Error("DEPLOYED_URL is required: the deployment to check");

export default defineConfig({
  ...base,
  webServer: undefined,
  // Live services, so the grade can take minutes.
  timeout: 900_000,
  use: { ...base.use, baseURL: url },
});
