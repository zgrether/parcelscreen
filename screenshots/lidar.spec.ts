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

/**
 * The plan's §3 comparison, desktop only: the same view of Mud Creek at view zoom 16 with Shaded relief drawn from each
 * candidate. The layer's exportImage requests are answered from the cached services' tiles (the bbox read back to the
 * tile), and for Mapterhorn the terrain preview's Terrarium tiles are answered from its lidar elevation tiles, shaded
 * by MapLibre's own hillshade. A shot whose requests never reached its source says so in its name ("-unrouted").
 */
const ORIGIN = 20037508.342789244;
const zxy = (bbox: string): [number, number, number] => {
  const [minX, , maxX, maxY] = bbox.split(",").map(Number) as [number, number, number, number];
  const z = Math.round(Math.log2((2 * ORIGIN) / (maxX - minX)));
  const size = (2 * ORIGIN) / 2 ** z;
  return [z, Math.round((minX + ORIGIN) / size), Math.round((ORIGIN - maxY) / size)];
};
const CACHED: Record<string, (z: number, x: number, y: number) => string> = {
  "usgs-shaded": (z, x, y) =>
    `https://basemap.nationalmap.gov/arcgis/rest/services/USGSShadedReliefOnly/MapServer/tile/${Math.min(z, 16)}/${
      Math.min(z, 16) < z ? y >> (z - 16) : y
    }/${Math.min(z, 16) < z ? x >> (z - 16) : x}`,
  "esri-hillshade": (z, x, y) =>
    `https://services.arcgisonline.com/arcgis/rest/services/Elevation/World_Hillshade/MapServer/tile/${Math.min(
      z,
      16,
    )}/${Math.min(z, 16) < z ? y >> (z - 16) : y}/${Math.min(z, 16) < z ? x >> (z - 16) : x}`,
};

test.describe("compare", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  /** Routes added after the replay's, which wins otherwise (Playwright tries the newest route first). */
  async function mudCreekAt16(
    page: Page,
    context: BrowserContext,
    routes: () => Promise<unknown> = async () => {},
  ): Promise<void> {
    await replayHar(context, GRAYSON);
    await live(context);
    await routes();
    await openExplorer(page, GRAYSON);
    await importParcel(page, GRAYSON);
    await withRedGate(page);
    await tilesIn(page);
    await page.evaluate(() => {
      const m = (window as unknown as { __psMap: { getCenter(): unknown; jumpTo(o: object): void } }).__psMap;
      m.jumpTo({ center: m.getCenter(), zoom: 16, pitch: 0, bearing: 0 });
    });
  }

  for (const id of ["3dep", "usgs-shaded", "esri-hillshade"] as const) {
    test(`Shaded relief at zoom 16 from ${id}`, async ({ page, context }) => {
      test.setTimeout(300_000);
      let routed = 0;
      await mudCreekAt16(page, context, async () => {
        if (id === "3dep") return;
        await context.route(/elevation\.nationalmap\.gov\/.*exportImage/, async (r) => {
          const bbox = new URL(r.request().url()).searchParams.get("bbox")!;
          const [z, x, y] = zxy(bbox);
          // A tile cached at 16 stands in for its quarter at 17 and 18: drawn whole here, so the comparison is
          // exact only at a tile zoom of 16 and under (the view at 15).
          const res = await r.fetch({ url: CACHED[id]!(z, x, y) });
          routed++;
          await r.fulfill({ response: res });
        });
      });
      const layers = page.getByRole("region", { name: "Map layers" });
      await page.getByRole("button", { name: "Map layers" }).click();
      await layers.getByRole("button", { name: "Lidar terrain" }).click();
      await layers.getByRole("radio", { name: "Shaded relief" }).click();
      await page.getByRole("button", { name: "Close the map panel" }).click();
      await tilesIn(page);
      await page.waitForTimeout(1000);
      const tag = id === "3dep" || routed ? id : `${id}-unrouted`;
      await page.screenshot({ path: `${OUT}/compare-lidar-${tag}.png` });
    });
  }

  test("Shaded relief at zoom 16 from Mapterhorn, by MapLibre's hillshade", async ({ page, context }) => {
    test.setTimeout(300_000);
    let routed = 0;
    await mudCreekAt16(page, context, () =>
      context.route(/elevation-tiles-prod\/terrarium\/\d+\/\d+\/\d+\.png/, async (r) => {
        const [, z, x, y] = /terrarium\/(\d+)\/(\d+)\/(\d+)\.png/.exec(r.request().url())!;
        const res = await r.fetch({ url: `https://tiles.mapterhorn.com/${z}/${x}/${y}.webp` });
        routed++;
        await r.fulfill({ response: res });
      }),
    );
    const layers = page.getByRole("region", { name: "Map layers" });
    await page.getByRole("button", { name: "Map layers" }).click();
    await layers.getByRole("button", { name: "Hillshade" }).click();
    await page.getByRole("button", { name: "Close the map panel" }).click();
    await tilesIn(page);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/compare-lidar-mapterhorn${routed ? "" : "-unrouted"}.png` });
  });

  test("Shaded relief at zoom 16 from today's 10 m Terrarium hillshade", async ({ page, context }) => {
    test.setTimeout(300_000);
    await mudCreekAt16(page, context, () => context.route(/elevation-tiles-prod/, (r) => r.continue()));
    const layers = page.getByRole("region", { name: "Map layers" });
    await page.getByRole("button", { name: "Map layers" }).click();
    await layers.getByRole("button", { name: "Hillshade" }).click();
    await page.getByRole("button", { name: "Close the map panel" }).click();
    await tilesIn(page);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/compare-lidar-terrarium.png` });
  });
});
