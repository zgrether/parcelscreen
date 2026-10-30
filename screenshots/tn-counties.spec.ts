/**
 * The Tennessee counties mission's screenshots (docs/plans/tn-counties.md), desktop (1280 × 800) then phone (375 × 812),
 * everything live: Hamilton County's own parcel lines at Three Gorges Farms (Soddy-Daisy), tract 1 tapped and its
 * facts, then graded; and Knox County's hint, which names the county and offers Draw. Hamilton's service and the grade's
 * services are reached live, so this runs on CI's runners (`.github/workflows/tn-counties.yml`).
 */
import { expect, test, type Page } from "@playwright/test";
import { ownRecordsHint } from "../lib/geo/ownRecords";
import { screenIt } from "../e2e/flow";

const OUT = "test-results/screenshots/tn-counties";
/** Inside Three Gorges Farms tract 1, 048 045.24 (the recorder's point on its record). */
const THREE_GORGES = { lat: 35.29479, lon: -85.20988 };
/** Downtown Knoxville, Knox County. */
const KNOXVILLE = { lat: 35.9606, lon: -83.9207 };

async function openAt(page: Page, view: { lat: number; lon: number; z: number }): Promise<void> {
  await page.addInitScript((v) => {
    if (sessionStorage.getItem("shots")) return;
    sessionStorage.setItem("shots", "1");
    localStorage.clear();
    // The test handle on the map (window.__psMap), which the taps and the tile wait read.
    localStorage.setItem("ps.debug", "1");
    localStorage.setItem("ps.view", JSON.stringify(v));
  }, view);
  await page.goto("/explore");
}

/** Until the map has drawn every tile in view (or 45 s), and the parcel lines have had time to land. */
async function drawn(page: Page): Promise<void> {
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
  await page.waitForTimeout(2500);
}

async function tapAt(page: Page, ll: { lat: number; lon: number }): Promise<void> {
  const xy = await page.evaluate(
    ({ lat, lon }) =>
      (
        window as unknown as { __psMap: { project(ll: [number, number]): { x: number; y: number } } }
      ).__psMap.project([lon, lat]),
    ll,
  );
  const box = (await page.locator(".maplibregl-canvas").boundingBox())!;
  await page.mouse.click(box.x + xy.x, box.y + xy.y);
}

for (const phone of [false, true]) {
  const device = phone ? "phone" : "desktop";
  test.describe(device, () => {
    test.use(
      phone
        ? { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }
        : { viewport: { width: 1280, height: 800 } },
    );
    // The owner and site address are read live, so they're masked: a real person's name never goes into the repo
    // (scrubHar.ts keeps them out of recordings for the same reason).
    const shot = (page: Page, name: string) =>
      page.screenshot({
        path: `${OUT}/${device}-${name}.png`,
        mask: [
          page.locator("table.facts tr", { hasText: "Owner of record" }).locator("td"),
          page.locator("table.facts tr", { hasText: "Site address" }).locator("td"),
        ],
      });

    test("Hamilton County: Three Gorges Farms' lines, tract 1's facts, its grade", async ({ page }) => {
      test.setTimeout(600_000);
      await openAt(page, { ...THREE_GORGES, z: 16 });
      await drawn(page);
      await shot(page, "hamilton-lines");

      await tapAt(page, THREE_GORGES);
      const info = page.getByRole("button", { name: /acres: parcel details$/ });
      await expect(info).toBeVisible({ timeout: 30_000 });
      await info.click();
      await expect(page.locator("table.facts").first()).toContainText("048 045.24");
      await page.waitForTimeout(500);
      await shot(page, "hamilton-facts");

      await page.getByRole("tab", { name: "Grade" }).click();
      const steps = await screenIt(page);
      console.log(`Three Gorges tract 1, graded: ${JSON.stringify(steps)}`);
      await page.waitForTimeout(1000);
      await shot(page, "hamilton-graded");
    });

    test("Knox County: the hint names the county and offers Draw", async ({ page }) => {
      test.setTimeout(180_000);
      await openAt(page, { ...KNOXVILLE, z: 15 });
      await expect(page.locator(".map-hint")).toContainText(ownRecordsHint("Knox"), { timeout: 60_000 });
      await drawn(page);
      await shot(page, "knox-hint");
    });
  });
}
