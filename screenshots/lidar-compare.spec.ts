/**
 * The shaded-relief candidates side by side (roadmap step 14c plan §3; owner, 10/25: "real detail at zoom 17 over Mud
 * Creek's red-gate line and one other fixture, at the same spot in each candidate"). Each candidate
 * (test/tools/reliefCandidates.ts) is drawn alone, at full strength over a plain background, at view zoom 17 over each
 * spot, cropped to the same square; then one sheet per spot puts them side by side with their sources named.
 *
 * - Image services (USGS 3DEP as built, Esri's and USGS's cached hillshades, a state's relief service) are drawn as
 *   MapLibre raster layers, overzoomed past their deepest tiles as the app would.
 * - Elevation tiles are shaded by MapLibre's own hillshade (multidirectional), as the app would: Mapterhorn's Terrarium
 *   tiles as they come, and USGS 3DEP's 32-bit elevation from exportImage, turned into Terrarium here in the runner
 *   (in the app, a protocol handler in the map's worker would do the same).
 *
 * Live tiles: run by .github/workflows/lidar-tiles.yml, which pushes the sheets to pr-assets/14c-lidar/.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { importParcel, openExplorer } from "../e2e/flow";
import { replayHar } from "../e2e/replay";
import { GRAYSON, withRedGate } from "../e2e/redGate";
import {
  BASE_CANDIDATES,
  SPOTS,
  demTileUrl,
  findStateServices,
  stateCandidate,
  terrarium,
  type Candidate,
} from "../test/tools/reliefCandidates";

const OUT = "test-results/screenshots";
const SIDE = 520;
const DEM_HOST = "https://dem-3dep.test";

async function live(context: BrowserContext): Promise<void> {
  await context.route(
    /basemap\.nationalmap\.gov|arcgisonline\.com|elevation\.nationalmap\.gov|mapterhorn\.com|vginmaps|nconemap|tnmap/,
    (r) => r.continue(),
  );
  // USGS 3DEP's elevation as Terrarium: the 32-bit GeoTIFF fetched and re-encoded here.
  await context.route(/dem-3dep\.test\/\d+\/\d+\/\d+\.png/, async (r) => {
    const [z, x, y] = /\/(\d+)\/(\d+)\/(\d+)\.png/.exec(r.request().url())!.slice(1).map(Number) as [
      number,
      number,
      number,
    ];
    try {
      const res = await r.fetch({ url: demTileUrl(z, x, y), timeout: 90_000 });
      const { fromArrayBuffer } = await import("geotiff");
      const { encode } = await import("fast-png");
      const buf = await res.body();
      const tiff = await fromArrayBuffer(new Uint8Array(buf).buffer);
      const img = await tiff.getImage();
      const [band] = (await img.readRasters()) as unknown as Float32Array[];
      const w = img.getWidth(),
        h = img.getHeight();
      const png = encode({ width: w, height: h, data: terrarium(band!, w, h), channels: 3, depth: 8 });
      await r.fulfill({ status: 200, contentType: "image/png", body: Buffer.from(png) });
    } catch {
      await r.fulfill({ status: 502, body: "dem tile failed" });
    }
  });
}

const tilesIn = (page: Page) =>
  page
    .waitForFunction(
      () => {
        const m = (window as unknown as { __psMap?: { areTilesLoaded(): boolean; isMoving(): boolean } })
          .__psMap;
        return !!m && !m.isMoving() && m.areTilesLoaded();
      },
      undefined,
      { timeout: 90_000 },
    )
    .catch(() => undefined);

/** The map panel closed if it's open (it isn't after an import; a click on a missing button would wait forever). */
async function closePanel(page: Page): Promise<void> {
  const close = page.getByRole("button", { name: "Close the map panel" });
  if (await close.isVisible()) await close.click();
}

/** Draws one candidate alone: every other raster and hillshade layer hidden, a plain background under it. */
async function show(page: Page, c: Candidate | null): Promise<void> {
  const spec = c && {
    id: c.id,
    kind: c.kind,
    tiles: [
      c.id === "3dep-dem"
        ? `${DEM_HOST}/{z}/{x}/{y}.png`
        : c.url(91, 92, 93).replace("/91/93/92", "/{z}/{y}/{x}").replace("/91/92/93", "/{z}/{x}/{y}"),
    ],
    size: c.size,
    maxzoom: c.maxzoom,
    bboxTemplate: c.dynamic && c.id !== "3dep-dem",
  };
  // Dynamic (exportImage) sources: their box written as MapLibre's template.
  if (spec && spec.bboxTemplate) {
    const sample = c!.url(10, 0, 0);
    const box = new URL(sample).searchParams.get("bbox")!;
    spec.tiles = [
      sample.replace(encodeURIComponent(box), "{bbox-epsg-3857}").replace(box, "{bbox-epsg-3857}"),
    ];
  }
  await page.evaluate((s) => {
    type M = {
      getStyle(): { layers: { id: string; type: string }[] };
      getLayer(id: string): unknown;
      getSource(id: string): unknown;
      removeLayer(id: string): void;
      removeSource(id: string): void;
      addSource(id: string, src: object): void;
      addLayer(layer: object, before?: string): void;
      setLayoutProperty(id: string, p: string, v: unknown): void;
    };
    const m = (window as unknown as { __psMap: M }).__psMap;
    for (const id of ["cmp-layer", "cmp-bg"]) if (m.getLayer(id)) m.removeLayer(id);
    if (m.getSource("cmp-src")) m.removeSource("cmp-src");
    for (const l of m.getStyle().layers)
      if (l.type === "raster" || l.type === "hillshade") m.setLayoutProperty(l.id, "visibility", "none");
    const first = m.getStyle().layers[0]?.id;
    m.addLayer({ id: "cmp-bg", type: "background", paint: { "background-color": "#f2f2ee" } }, first);
    if (!s) return;
    if (s.kind === "dem") {
      m.addSource("cmp-src", {
        type: "raster-dem",
        tiles: s.tiles,
        tileSize: s.size,
        maxzoom: s.maxzoom,
        encoding: "terrarium",
      });
      m.addLayer(
        {
          id: "cmp-layer",
          type: "hillshade",
          source: "cmp-src",
          paint: { "hillshade-method": "multidirectional", "hillshade-exaggeration": 1 },
        },
        m.getStyle().layers[1]?.id,
      );
    } else {
      m.addSource("cmp-src", { type: "raster", tiles: s.tiles, tileSize: s.size, maxzoom: s.maxzoom });
      m.addLayer({ id: "cmp-layer", type: "raster", source: "cmp-src" }, m.getStyle().layers[1]?.id);
    }
  }, spec);
}

test.describe("compare", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("each candidate at view zoom 17, at each spot, side by side", async ({ page, context }) => {
    test.setTimeout(2_700_000);
    const found = await findStateServices((u, i) => fetch(u, i));
    const candidates = [
      ...BASE_CANDIDATES,
      ...found.map(stateCandidate).filter((c): c is Candidate => c !== null),
    ];
    await replayHar(context, GRAYSON);
    await live(context);
    await openExplorer(page, GRAYSON);
    await importParcel(page, GRAYSON);
    await withRedGate(page);
    await closePanel(page);

    for (const spot of SPOTS) {
      const cells: { label: string; source: string; png: string }[] = [];
      for (const c of candidates) {
        const inside = c.covers === "all" || c.covers === spot.state;
        await page.evaluate(
          ([lat, lon]) =>
            (window as unknown as { __psMap: { jumpTo(o: object): void } }).__psMap.jumpTo({
              center: [lon, lat],
              zoom: 17,
              pitch: 0,
              bearing: 0,
            }),
          spot.ll,
        );
        await show(page, inside ? c : null);
        await tilesIn(page);
        await page.waitForTimeout(1500);
        const at = await page.evaluate(([lat, lon]) => {
          const m = (
            window as unknown as {
              __psMap: {
                project(ll: [number, number]): { x: number; y: number };
                getContainer(): HTMLElement;
              };
            }
          ).__psMap;
          const p = m.project([lon, lat]);
          const r = m.getContainer().getBoundingClientRect();
          return { x: r.left + p.x, y: r.top + p.y };
        }, spot.ll);
        const png = await page.screenshot({
          clip: {
            x: Math.max(0, at.x - SIDE / 2),
            y: Math.max(0, at.y - SIDE / 2),
            width: SIDE,
            height: SIDE,
          },
        });
        await page.screenshot({
          path: `${OUT}/cmp17-lidar-${spot.id}-${c.id}.png`,
          clip: {
            x: Math.max(0, at.x - SIDE / 2),
            y: Math.max(0, at.y - SIDE / 2),
            width: SIDE,
            height: SIDE,
          },
        });
        cells.push({
          label: inside ? c.label : `${c.label}: outside its state`,
          source: c.source,
          png: png.toString("base64"),
        });
      }
      // The sheet: the same square from each candidate, with its source.
      const sheet = await context.newPage();
      await sheet.setViewportSize({ width: 1700, height: 1200 });
      await sheet.setContent(
        `<html><body style="margin:16px;font:14px/1.3 sans-serif;background:#fff">
          <h2 style="margin:0 0 8px">${spot.label}: view zoom 17, the same square in each</h2>
          <div style="display:grid;grid-template-columns:repeat(3,${SIDE}px);gap:14px">
          ${cells
            .map(
              (
                c,
              ) => `<figure style="margin:0"><img src="data:image/png;base64,${c.png}" width="${SIDE}" height="${SIDE}" style="display:block;border:1px solid #ccc">
              <figcaption><b>${c.label}</b><br><span style="color:#555">${c.source}</span></figcaption></figure>`,
            )
            .join("")}
          </div></body></html>`,
      );
      await sheet.screenshot({ path: `${OUT}/sheet17-lidar-${spot.id}.png`, fullPage: true });
      await sheet.close();
      expect(cells.length).toBeGreaterThan(0);
    }
  });

  /**
   * Could Mapterhorn's tiles be the 3D terrain's too (owner, 10/25; a decision of its own)? The terrain preview's
   * Terrarium requests (AWS, 256 px, to zoom 15) answered from Mapterhorn's tiles of the same tile, in 3D over the red
   * gate, beside today's: the drape, the 10 m hillshade and the contours all read the one source.
   */
  for (const src of ["aws", "mapterhorn"] as const) {
    test(`3D terrain over the red gate from ${src === "aws" ? "AWS Terrain Tiles (today)" : "Mapterhorn"}`, async ({
      page,
      context,
    }) => {
      test.setTimeout(300_000);
      await replayHar(context, GRAYSON);
      await live(context);
      await context.route(/elevation-tiles-prod\/terrarium\/\d+\/\d+\/\d+\.png/, async (r) => {
        if (src === "aws") return r.continue();
        const [, z, x, y] = /terrarium\/(\d+)\/(\d+)\/(\d+)\.png/.exec(r.request().url())!;
        const res = await r.fetch({ url: `https://tiles.mapterhorn.com/${z}/${x}/${y}.webp` });
        await r.fulfill({ response: res });
      });
      await openExplorer(page, GRAYSON);
      await importParcel(page, GRAYSON);
      await withRedGate(page);
      await closePanel(page);
      await page.evaluate(([lat, lon]) => {
        const m = (window as unknown as { __psMap: { jumpTo(o: object): void } }).__psMap;
        m.jumpTo({ center: [lon, lat], zoom: 16, pitch: 0, bearing: 0 });
      }, SPOTS[0].ll);
      await page.getByRole("button", { name: "Tilt the map to 3D" }).click();
      await page.waitForTimeout(2000);
      await tilesIn(page);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/terrain3d-lidar-${src}.png` });
    });
  }
});
