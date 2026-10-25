/**
 * Roadmap step 14c's screenshot (owner, 2026-10-25: one confirming shot): Mud Creek with the red-gate line drawn, Lidar
 * terrain on as Shaded relief (Mapterhorn's elevation, shaded by MapLibre) at zoom 17 over the line, desktop width. The
 * aerial and the lidar tiles are fetched live, so this runs where they can be reached
 * (`.github/workflows/lidar-tiles.yml`).
 */
import { test, type BrowserContext, type Page } from "@playwright/test";
import { importParcel, openExplorer } from "../e2e/flow";
import { replayHar } from "../e2e/replay";
import { GRAYSON, withRedGate } from "../e2e/redGate";

const OUT = "test-results/screenshots";
/** On Mud Creek's red-gate line. */
const RED_GATE: [number, number] = [36.5836, -81.5615];

async function live(context: BrowserContext): Promise<void> {
  await context.route(/basemap\.nationalmap\.gov|arcgisonline\.com|tiles\.mapterhorn\.com/, (r) =>
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

test.use({ viewport: { width: 1280, height: 800 } });

test("Mud Creek's red-gate line at zoom 17, Shaded relief", async ({ page, context }) => {
  test.setTimeout(180_000);
  await replayHar(context, GRAYSON);
  await live(context);
  await openExplorer(page, GRAYSON);
  await importParcel(page, GRAYSON);
  await withRedGate(page);

  const layers = page.getByRole("region", { name: "Map layers" });
  await page.getByRole("button", { name: "Map layers" }).click();
  await layers.getByRole("button", { name: "Lidar terrain" }).click();
  await page.getByRole("button", { name: "Close the map panel" }).click();
  await page.evaluate(
    ([lat, lon]) =>
      (window as unknown as { __psMap: { jumpTo(o: object): void } }).__psMap.jumpTo({
        center: [lon, lat],
        zoom: 17,
      }),
    RED_GATE,
  );
  await tilesIn(page);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/desktop-lidar-relief-z17.png` });
});
