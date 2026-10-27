/**
 * Roadmap step 14c: Map layers › Lidar terrain. Off at first; on, it asks for the view's tiles at zoom 13 and up:
 * Shaded relief Mapterhorn's elevation tiles, then Slope USGS's exportImage with its rule, at the opacity set; below 13
 * it asks for none and the hint says to zoom in; off, it asks for no more; a reload keeps the choice. Both hosts are
 * answered with a flat grey PNG of our own: this session's network reaches neither.
 */
import { expect, test, type Page, type Route } from "@playwright/test";
import { openExplorer, reload } from "./flow";
import { greyPng } from "./png";
import { replayHar } from "./replay";

const SLUG = "grayson-mud-creek-6273";
const SERVICE =
  /elevation\.nationalmap\.gov\/arcgis\/rest\/services\/3DEPElevation\/ImageServer\/exportImage/;
const MAPTERHORN = /tiles\.mapterhorn\.com\/(\d+)\/\d+\/\d+\.webp/;
const WORLD_M = 40075016.686;

interface Asked {
  zoom: number;
  /** "relief" for Mapterhorn's tiles, else the exportImage rule's first raster function. */
  rule: string;
}

/** Answers both hosts and keeps each request's zoom and what it was for. */
async function lidarService(page: Page): Promise<Asked[]> {
  const asked: Asked[] = [];
  const answer = (route: Route, png: Buffer) =>
    route.fulfill({ body: png, contentType: "image/png", headers: { "access-control-allow-origin": "*" } });
  const small = greyPng(256),
    large = greyPng(512);
  await page.context().route(SERVICE, (route: Route) => {
    const q = new URL(route.request().url()).searchParams;
    const [minX, , maxX] = q.get("bbox")!.split(",").map(Number);
    asked.push({
      zoom: Math.round(Math.log2(WORLD_M / (maxX! - minX!))),
      rule: (JSON.parse(q.get("renderingRule")!) as { rasterFunction: string }).rasterFunction,
    });
    return answer(route, small);
  });
  await page.context().route(MAPTERHORN, (route: Route) => {
    asked.push({ zoom: Number(MAPTERHORN.exec(route.request().url())![1]), rule: "relief" });
    return answer(route, large);
  });
  return asked;
}

const jump = (page: Page, zoom: number) =>
  page.evaluate(
    (z) => (window as unknown as { __psMap: { jumpTo(o: object): void } }).__psMap.jumpTo({ zoom: z }),
    zoom,
  );
const paint = (page: Page, layer: string) =>
  page.evaluate((id) => {
    const m = (
      window as unknown as {
        __psMap: {
          getLayoutProperty(l: string, p: string): string;
          getPaintProperty(l: string, p: string): number;
        };
      }
    ).__psMap;
    // Shaded relief's opacity is its shadow colour's alpha (lidarOpacityPaint).
    const opacity =
      id === "lidar-relief"
        ? Number(/,([\d.]+)\)$/.exec(String(m.getPaintProperty(id, "hillshade-shadow-color")))![1])
        : m.getPaintProperty(id, "raster-opacity");
    return { visibility: m.getLayoutProperty(id, "visibility"), opacity };
  }, layer);

test("Lidar terrain: off at first; Shaded relief, then Slope, from zoom 13; the opacity; the hint below 13; kept after a reload", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await replayHar(context, SLUG);
  const asked = await lidarService(page);
  await openExplorer(page, SLUG);
  await page.waitForFunction(() => !!(window as unknown as { __psMap?: unknown }).__psMap);
  await page.waitForTimeout(1500);
  expect(asked).toEqual([]); // off by default

  await page.getByRole("button", { name: "Map layers" }).click();
  const panel = page.getByRole("region", { name: "Map layers" });
  await panel.getByRole("button", { name: "Lidar terrain" }).click();
  await expect(panel.getByRole("button", { name: "Lidar terrain" })).toHaveAttribute("aria-pressed", "true");
  await expect(panel).toContainText(
    "1 m lidar where available. Elevation: © Mapterhorn, from USGS 3DEP lidar",
  );
  await expect.poll(() => asked.length).toBeGreaterThan(0);
  // openExplorer's view is zoom 15: Mapterhorn's 512 px tiles at the view's own zoom.
  expect(new Set(asked.map((a) => a.zoom))).toEqual(new Set([15]));
  expect(asked.every((a) => a.rule === "relief")).toBe(true);
  expect(await paint(page, "lidar-relief")).toEqual({ visibility: "visible", opacity: 0.6 });

  // Slope: the classed rule; Shaded relief's layer hidden.
  asked.length = 0;
  await panel.getByRole("radio", { name: "Slope" }).click();
  await expect.poll(() => asked.length).toBeGreaterThan(0);
  expect(asked.every((a) => a.rule === "Colormap")).toBe(true);
  await expect(panel).toContainText("1 m lidar where available. Terrain: USGS 3D Elevation Program (lidar)");
  expect((await paint(page, "lidar-relief")).visibility).toBe("none");
  await expect(panel.getByRole("list", { name: "Slope, as grade" }).locator("li")).toHaveText([
    "up to 15%",
    "15–25%",
    "25–40%",
    "over 40%",
  ]);
  await panel.getByLabel(/^Opacity/).fill("80");
  expect(await paint(page, "lidar-slope")).toEqual({ visibility: "visible", opacity: 0.8 });

  // Zoom 12: nothing asked for, and the hint; 14 again: its tiles (zoom 15).
  await jump(page, 12);
  await page.waitForTimeout(800);
  asked.length = 0;
  await jump(page, 12.5);
  await expect(page.locator(".map-hint")).toHaveText("Zoom in to see lidar terrain");
  await page.waitForTimeout(800);
  expect(asked).toEqual([]);
  await jump(page, 14);
  await expect.poll(() => asked.length).toBeGreaterThan(0);
  expect(new Set(asked.map((a) => a.zoom))).toEqual(new Set([15]));
  await expect(page.locator(".map-hint", { hasText: "Zoom in to see lidar terrain" })).toHaveCount(0);

  // Kept after a reload: on, Slope, at 80%.
  await reload(page);
  await page.waitForFunction(() => !!(window as unknown as { __psMap?: unknown }).__psMap);
  await expect
    .poll(() => paint(page, "lidar-slope").catch(() => null))
    .toEqual({ visibility: "visible", opacity: 0.8 });

  // Off: no more requests.
  await page.getByRole("button", { name: "Map layers" }).click();
  await page
    .getByRole("region", { name: "Map layers" })
    .getByRole("button", { name: "Lidar terrain" })
    .click();
  expect((await paint(page, "lidar-slope")).visibility).toBe("none");
  await page.waitForTimeout(500);
  asked.length = 0;
  await jump(page, 15);
  await page.waitForTimeout(1200);
  expect(asked).toEqual([]);
  expect(errors).toEqual([]);
});
