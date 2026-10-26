/**
 * Roadmap step 14e's screenshots (docs/plans/step-14e-offline.md §10), desktop (1280 × 800) then phone (375 × 812):
 * Save offline's sheet with its size, its progress and its end; Settings › Offline with the parcel saved; Map layers'
 * basemaps with Esri's "not kept offline"; and the saved parcel opened with no connection. The service worker is
 * allowed; the tile hosts are answered with grey tiles, a little slowly, so the progress shows (this session reaches
 * none of them). Run by `pnpm screenshots`.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page, type Route } from "@playwright/test";
import { loadFixture, type FixtureSlug } from "../test/support/fixtures";
import {
  booted,
  importParcels,
  openExplorer,
  openFromList,
  openYourData,
  reload,
  seedScreens,
  settled,
  visit,
} from "../e2e/flow";
import { greyPng } from "../e2e/png";
import { replayHar } from "../e2e/replay";

const OUT = "test-results/screenshots";
const FERNEY = "ferney-creek-52-47A" satisfies FixtureSlug;
const NAME = loadFixture(FERNEY).input.name;
const TILES =
  /basemap\.nationalmap\.gov\/arcgis\/rest\/services\/USGS\w+\/MapServer\/tile\/|vginmaps\.vdem\.virginia\.gov\/arcgis\/rest\/services\/VBMP_Imagery\/|djlorenz\.github\.io\/astronomy\/image_tiles\/|exportImage\?.*renderingRule/;

test.use({ serviceWorkers: "allow" });

async function slowTiles(page: Page, ms: number): Promise<{ offline: boolean }> {
  const t = { offline: false };
  const png = greyPng(256);
  await page.context().route(TILES, async (route: Route) => {
    if (t.offline) return route.abort("internetdisconnected");
    await new Promise((r) => setTimeout(r, ms));
    return route.fulfill({
      body: png,
      contentType: "image/png",
      headers: { "access-control-allow-origin": "*" },
    });
  });
  return t;
}

for (const phone of [false, true]) {
  const device = phone ? "phone" : "desktop";
  test.describe(device, () => {
    test.use(
      phone
        ? { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }
        : { viewport: { width: 1280, height: 800 } },
    );

    test("Save offline, Settings › Offline, Esri not kept, and the parcel offline", async ({
      page,
      context,
    }) => {
      test.setTimeout(300_000);
      await replayHar(context, FERNEY);
      // The baked places as the app serves them: the fixtures' frozen copies hold only the cells their grades read.
      await context.route(/\/places\/v1\//, (route: Route) => {
        const file = join(process.cwd(), "public", new URL(route.request().url()).pathname);
        return existsSync(file)
          ? route.fulfill({ body: readFileSync(file), contentType: "application/json" })
          : route.fulfill({ status: 404, body: "not found" });
      });
      const tiles = await slowTiles(page, 120);
      await openExplorer(page, FERNEY);
      await expect
        .poll(() =>
          page.evaluate(
            async () => (await navigator.serviceWorker.getRegistration("/"))?.active?.state ?? "none",
          ),
        )
        .toBe("activated");
      await reload(page);
      await importParcels(page, [FERNEY]);
      await seedScreens(page, [FERNEY], { current: true });
      await settled(page);
      await visit(page, "/library");
      await openFromList(page, NAME);

      // The sheet: its size first.
      await page.getByRole("button", { name: "More for this parcel" }).click();
      await expect(page.getByRole("menuitem", { name: "Save offline" })).toBeVisible();
      await page.screenshot({ path: `${OUT}/${device}-save-offline-menu.png` });
      await page.getByRole("menuitem", { name: "Save offline" }).click();
      const sheet = page.getByRole("dialog", { name: /^Sav(e|ing|ed) offline/ });
      await expect(sheet.getByText(/^About \d+ MB$/)).toBeVisible();
      await page.screenshot({ path: `${OUT}/${device}-save-offline-size.png` });

      // Its progress, then its end.
      await sheet.getByRole("button", { name: "Save offline" }).click();
      await expect(sheet.getByText(/^Saving offline… [1-9]\d?%$/)).toBeVisible({ timeout: 60_000 });
      await page.screenshot({ path: `${OUT}/${device}-save-offline-progress.png` });
      await expect(sheet.getByRole("status")).toHaveText(/^Saved offline/, { timeout: 180_000 });
      await page.screenshot({ path: `${OUT}/${device}-save-offline-done.png` });
      await sheet.getByRole("button", { name: "Done" }).click();

      // Settings › Offline, with the parcel saved.
      await openYourData(page);
      const section = page.locator(".offline-settings");
      await section.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await section.screenshot({ path: `${OUT}/${device}-settings-offline.png` });
      await page.keyboard.press("Escape");

      // Map layers: Esri's basemaps aren't kept.
      await page.getByRole("button", { name: "Map layers" }).click();
      const basemaps = page.getByRole("radiogroup", { name: "Basemap" });
      await basemaps.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/${device}-map-layers-offline.png` });
      await page.getByRole("button", { name: "Close the map panel" }).click();

      // No connection: the app opened again, the saved parcel from Your list.
      await settled(page);
      tiles.offline = true;
      await context.setOffline(true);
      const fresh = await context.newPage();
      await page.close();
      await fresh.goto("/library");
      await booted(fresh);
      await openFromList(fresh, NAME);
      await expect(fresh.locator(".card-verdict")).toBeVisible();
      await fresh.waitForTimeout(2000);
      await fresh.screenshot({ path: `${OUT}/${device}-offline-parcel.png` });
      await context.setOffline(false);
    });
  });
}
