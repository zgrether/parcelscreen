/**
 * Issue #432: the tap on Hamilton County that opens no parcel, in a real browser on a deployment (DEPLOYED_URL;
 * hamilton.yml runs it against production). Every request to the county's host is logged with its status or failure
 * (a CORS refusal shows as a failed request and a console error), and whether the tap opened a parcel. No screenshot is
 * taken, and no owner or address field is printed. The report goes to test-results/hamilton-prod.md.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test } from "./fixtures";

/** Inside Three Gorges Farms tract 1 (screenshots/tn-counties.spec.ts). */
const THREE_GORGES = { lat: 35.29479, lon: -85.20988 };

/** A request to the county's hosts (the host parsed, not a substring of the whole URL). */
const county = (url: string): boolean => {
  try {
    const h = new URL(url).hostname;
    return h === "hamiltontn.gov" || h.endsWith(".hamiltontn.gov");
  } catch {
    return false;
  }
};

test("a tap at Three Gorges Farms, on the deployment", async ({ page }) => {
  test.setTimeout(180_000);
  const log: string[] = [];
  page.on("request", (r) => {
    if (county(r.url())) log.push(`→ ${r.method()} ${r.url().split("?")[0]}`);
  });
  page.on("response", (r) => {
    const u = r.url();
    if (county(u))
      log.push(
        `← ${r.status()} ${u.split("?")[0]} acao=${r.headers()["access-control-allow-origin"] ?? "none"} type=${r.headers()["content-type"] ?? "?"}`,
      );
  });
  page.on("requestfailed", (r) => {
    if (county(r.url())) log.push(`✗ ${r.url().split("?")[0]}: ${r.failure()?.errorText ?? "failed"}`);
  });
  const consoleErrors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300));
  });
  await page.addInitScript(
    (v) => {
      if (sessionStorage.getItem("probe")) return;
      sessionStorage.setItem("probe", "1");
      localStorage.clear();
      localStorage.setItem("ps.debug", "1");
      localStorage.setItem("ps.view", JSON.stringify(v));
    },
    { ...THREE_GORGES, z: 16 },
  );
  await page.goto("/explore");
  await page
    .waitForFunction(
      () => {
        const m = (window as unknown as { __psMap?: { areTilesLoaded(): boolean; isMoving(): boolean } })
          .__psMap;
        return !!m && !m.isMoving() && m.areTilesLoaded();
      },
      undefined,
      { timeout: 45_000 },
    )
    .catch(() => undefined);
  await page.waitForTimeout(3000);
  const xy = await page.evaluate(
    ({ lat, lon }) =>
      (
        window as unknown as { __psMap: { project(ll: [number, number]): { x: number; y: number } } }
      ).__psMap.project([lon, lat]),
    THREE_GORGES,
  );
  const box = (await page.locator(".maplibregl-canvas").boundingBox())!;
  await page.mouse.click(box.x + xy.x, box.y + xy.y);
  const opened = await page
    .locator(".explore-header .sh-name")
    .first()
    .waitFor({ timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  const hint = await page.locator(".map-hint").allTextContents();
  const report = [
    "# Hamilton County on the deployment (#432)",
    "",
    `- Deployment: ${process.env.DEPLOYED_URL ?? "?"}`,
    `- The tap opened a parcel: **${opened ? "yes" : "no"}**`,
    `- The map's hint: ${hint.join(" | ") || "none"}`,
    "",
    "## Requests to hamiltontn.gov",
    "",
    ...(log.length ? log.map((l) => `- ${l}`) : ["- none"]),
    "",
    "## Console errors",
    "",
    ...(consoleErrors.length ? consoleErrors.map((l) => `- ${l}`) : ["- none"]),
    "",
  ].join("\n");
  console.log(report);
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/hamilton-prod.md", report + "\n");
  expect(log.length + consoleErrors.length).toBeGreaterThanOrEqual(0);
});
