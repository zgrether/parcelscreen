/**
 * Step 2's screenshots (plan §11), desktop then phone: Roan Mountain's lines on the Tennessee aerial, its facts card,
 * the parcel-number search, its report's Trails row, the basemap menu, the no-lines hint over Knox County and the
 * Tennessee-down hint. Run by `pnpm screenshots`; the owner fields are scrubbed in the recording, so none shows.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { loadFixture, ROAN_SEARCH } from "../test/support/fixtures";
import { openExplorer, openSearch, screenIt } from "../e2e/flow";
import { replayHar } from "../e2e/replay";

const ROAN = "roan-hwy-143-099-046-02" as const;
const OUT = "test-results/screenshots";
const KNOXVILLE = { lat: 35.9606, lon: -83.9207, z: 15 };

/** The state aerial, the USGS fallback and the terrain tiles, live (the replay aborts tiles). Registered last. */
async function liveImagery(context: BrowserContext): Promise<void> {
  await context.route(
    /tnmap\.tn\.gov|VBMP_Imagery|Orthoimagery_Latest|basemap\.nationalmap\.gov|elevation-tiles-prod/,
    (r) => r.continue(),
  );
}

const linesDrawn = (page: Page) =>
  page.evaluate(
    () =>
      (
        (window as unknown as { __psMap?: { queryRenderedFeatures(): { layer: { id: string } }[] } }).__psMap
          ?.queryRenderedFeatures()
          .filter((f) => f.layer.id === "parcel-lines") ?? []
      ).length,
  );

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

async function openAt(page: Page, view: typeof KNOXVILLE): Promise<void> {
  await page.addInitScript((v) => {
    if (sessionStorage.getItem("e2e")) return;
    sessionStorage.setItem("e2e", "1");
    localStorage.clear();
    localStorage.setItem("ps.debug", "1");
    localStorage.setItem("ps.roads", "0");
    localStorage.setItem("ps.view", JSON.stringify(v));
  }, view);
  await page.goto("/explore");
}

for (const phone of [false, true]) {
  const device = phone ? "phone" : "desktop";
  test.describe(device, () => {
    if (phone) test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${device}-${name}.png` });

    test("Roan: lines on the aerial, the facts card, the report's Trails row", async ({ page, context }) => {
      await replayHar(context, ROAN);
      await liveImagery(context);
      await openExplorer(page, ROAN);
      await expect.poll(() => linesDrawn(page), { timeout: 30_000 }).toBeGreaterThan(0);
      // The aerial's tiles, all of them.
      await expect
        .poll(
          () =>
            page.evaluate(() =>
              (window as unknown as { __psMap: { areTilesLoaded(): boolean } }).__psMap.areTilesLoaded(),
            ),
          {
            timeout: 30_000,
          },
        )
        .toBe(true);
      await page.waitForTimeout(1000);
      await shot(page, "1-roan-lines");
      await tapAt(page, loadFixture(ROAN).input.point);
      const info = page.getByRole("button", { name: /acres: parcel details$/ });
      await info.click();
      await expect(page.locator("table.facts").first()).toContainText("099 046.02");
      await shot(page, "2-roan-facts");
      await page.getByRole("tab", { name: "Grade" }).click(); // step 8b: Esc would close the parcel
      await screenIt(page);
      await page.waitForTimeout(1500);
      await shot(page, "6-roan-report");
    });

    test("Roan: found by its parcel number", async ({ page, context }) => {
      await replayHar(context, ROAN);
      await liveImagery(context);
      await openExplorer(page, ROAN);
      await expect.poll(() => linesDrawn(page), { timeout: 30_000 }).toBeGreaterThan(0);
      await openSearch(page);
      await page.keyboard.type(ROAN_SEARCH);
      await expect(page.getByText("099 046.02", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
      await shot(page, "3-roan-search");
    });

    test("the basemap menu", async ({ page, context }) => {
      await replayHar(context, ROAN);
      await liveImagery(context);
      await openExplorer(page, ROAN);
      await page
        .getByRole("button", { name: /map|layers/i })
        .first()
        .click();
      await expect(page.getByText("Aerial (state ortho: VA, NC, TN)").first()).toBeVisible();
      await shot(page, "7-basemap-menu");
    });

    test("Knox County: the no-lines hint", async ({ page, context }) => {
      await replayHar(context, ROAN);
      await liveImagery(context);
      await openAt(page, KNOXVILLE);
      await expect(page.locator(".map-hint")).toContainText("No Tennessee parcel lines here", {
        timeout: 30_000,
      });
      await page.waitForTimeout(3000);
      await shot(page, "4-knox-hint");
    });

    test("Tennessee's parcel service down", async ({ page, context }) => {
      await replayHar(context, ROAN);
      await context.route(/Tennessee_Property_Boundaries_Public_Use\/FeatureServer\/0\/query/, (route) =>
        route.fulfill({ status: 500, body: "down", headers: { "access-control-allow-origin": "*" } }),
      );
      await liveImagery(context);
      await openExplorer(page, ROAN);
      await expect(page.locator(".map-hint")).toContainText("Tennessee parcel service isn't responding", {
        timeout: 60_000,
      });
      await page.waitForTimeout(3000);
      await shot(page, "5-tn-down");
    });
  });
}
