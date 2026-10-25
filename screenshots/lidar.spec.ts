/**
 * Roadmap step 14c's screenshots, desktop (1280 × 800) then phone (375 × 812): Mud Creek with the red-gate line drawn,
 * Lidar terrain as Shaded relief and as Slope, flat and in 3D, with Map layers' controls once. The aerial and USGS's
 * lidar tiles are fetched live, so this runs where USGS can be reached (`.github/workflows/lidar-tiles.yml`).
 * Run by `pnpm screenshots`.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { importParcel, openExplorer } from "../e2e/flow";
import { replayHar } from "../e2e/replay";
import { GRAYSON, withRedGate } from "../e2e/redGate";

const OUT = "test-results/screenshots";

async function live(context: BrowserContext): Promise<void> {
  await context.route(/basemap\.nationalmap\.gov|arcgisonline\.com|elevation\.nationalmap\.gov/, (r) =>
    r.continue(),
  );
}

/** Until the map has drawn every tile in view (or 30 s). */
const tilesIn = (page: Page) =>
  page
    .waitForFunction(
      () => {
        const m = (window as unknown as { __psMap?: { areTilesLoaded(): boolean; isMoving(): boolean } })
          .__psMap;
        return !!m && !m.isMoving() && m.areTilesLoaded();
      },
      undefined,
      { timeout: 30_000 },
    )
    .catch(() => undefined);

for (const phone of [false, true]) {
  const device = phone ? "phone" : "desktop";
  test.describe(device, () => {
    test.use(
      phone
        ? { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }
        : { viewport: { width: 1280, height: 800 } },
    );
    const shot = (page: Page, name: string) =>
      page.screenshot({ path: `${OUT}/${device}-lidar-${name}.png` });

    test("Mud Creek with the red gate: Shaded relief and Slope, flat and in 3D", async ({
      page,
      context,
    }) => {
      test.setTimeout(300_000);
      await replayHar(context, GRAYSON);
      await live(context);
      await openExplorer(page, GRAYSON);
      await importParcel(page, GRAYSON);
      await withRedGate(page);

      const layers = page.getByRole("region", { name: "Map layers" });
      await page.getByRole("button", { name: "Map layers" }).click();
      await layers.getByRole("button", { name: "Lidar terrain" }).click();
      await expect(layers).toContainText("1 m lidar where available");
      await tilesIn(page);
      await shot(page, "1-controls");
      await layers.getByRole("radio", { name: "Slope" }).click();
      await tilesIn(page);
      await shot(page, "2-controls-slope");
      await layers.getByRole("radio", { name: "Shaded relief" }).click();
      await page.getByRole("button", { name: "Close the map panel" }).click();

      await tilesIn(page);
      await shot(page, "3-relief");
      await page.getByRole("button", { name: "Map layers" }).click();
      await layers.getByRole("radio", { name: "Slope" }).click();
      await page.getByRole("button", { name: "Close the map panel" }).click();
      await tilesIn(page);
      await shot(page, "4-slope");

      // 3D: the layer draped over the terrain.
      await page.getByRole("button", { name: "Tilt the map to 3D" }).click();
      await page.waitForTimeout(1500);
      await tilesIn(page);
      await shot(page, "5-slope-3d");
      await page.getByRole("button", { name: "Map layers" }).click();
      await layers.getByRole("radio", { name: "Shaded relief" }).click();
      await page.getByRole("button", { name: "Close the map panel" }).click();
      await tilesIn(page);
      await shot(page, "6-relief-3d");
    });
  });
}
