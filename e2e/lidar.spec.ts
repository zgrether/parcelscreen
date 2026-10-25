/**
 * Roadmap step 14c: Map layers › Lidar terrain. Off at first; on, it asks USGS's exportImage for the view's tiles at
 * zoom 13 and up with the chosen style's rule (Shaded relief, then Slope), at the opacity set; below 13 it asks for none
 * and the hint says to zoom in; off, it asks for no more; a reload keeps the choice. The service is answered with a
 * small PNG of our own: this session's network doesn't reach USGS (its real tiles are measured by
 * scripts/lidar-tiles.mts).
 */
import { deflateSync } from "node:zlib";
import { expect, test, type Page, type Route } from "@playwright/test";
import { openExplorer, reload } from "./flow";
import { replayHar } from "./replay";

const SLUG = "grayson-mud-creek-6273";
const SERVICE =
  /elevation\.nationalmap\.gov\/arcgis\/rest\/services\/3DEPElevation\/ImageServer\/exportImage/;
const WORLD_M = 40075016.686;

/** A 256 × 256 grey PNG, built here (no image library): the tile every request gets. */
function greyPng(): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const t = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(t));
    return Buffer.concat([len, t, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(256, 0);
  ihdr.writeUInt32BE(256, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // greyscale
  const rows = Buffer.alloc(257 * 256, 0x80);
  for (let y = 0; y < 256; y++) rows[y * 257] = 0; // filter: none
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

interface Asked {
  zoom: number;
  rule: string;
}

/** Answers the service and keeps each request's zoom (from its box's width) and rendering rule. */
async function lidarService(page: Page): Promise<Asked[]> {
  const asked: Asked[] = [];
  const png = greyPng();
  await page.context().route(SERVICE, (route: Route) => {
    const q = new URL(route.request().url()).searchParams;
    const [minX, , maxX] = q.get("bbox")!.split(",").map(Number);
    asked.push({ zoom: Math.round(Math.log2(WORLD_M / (maxX! - minX!))), rule: q.get("renderingRule")! });
    return route.fulfill({
      body: png,
      contentType: "image/png",
      headers: { "access-control-allow-origin": "*" },
    });
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
    return {
      visibility: m.getLayoutProperty(id, "visibility"),
      opacity: m.getPaintProperty(id, "raster-opacity"),
    };
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
  await expect(panel).toContainText("1 m lidar where available. Terrain: USGS 3D Elevation Program (lidar)");
  await expect.poll(() => asked.length).toBeGreaterThan(0);
  // openExplorer's view is zoom 15: the relief rule, a 256 px tile one level deeper (MapLibre's tiles are 512 px).
  expect(new Set(asked.map((a) => a.zoom))).toEqual(new Set([16]));
  expect(asked.every((a) => JSON.parse(a.rule).rasterFunction === "Hillshade Multidirectional")).toBe(true);
  expect(await paint(page, "lidar-relief")).toEqual({ visibility: "visible", opacity: 0.6 });

  // Slope: the classed rule; Shaded relief's layer hidden.
  asked.length = 0;
  await panel.getByRole("radio", { name: "Slope" }).click();
  await expect.poll(() => asked.length).toBeGreaterThan(0);
  expect(asked.every((a) => JSON.parse(a.rule).rasterFunction === "Colormap")).toBe(true);
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
