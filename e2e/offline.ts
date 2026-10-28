/**
 * Step 14e's e2e helpers (offline-cache.spec.ts, save-offline.spec.ts): the map tile hosts answered with PNGs of our
 * own (the service worker's requests reach the context's routes too, in Chromium), what the offline store holds, and
 * the service worker in control.
 */
import { expect, type BrowserContext, type Page, type Route } from "@playwright/test";
import { reload } from "./flow";
import { greyPng } from "./png";

/** The basemaps' hosts (USGS and the state aerials) and the atlas's image tiles. */
const TILES =
  /basemap\.nationalmap\.gov\/arcgis\/rest\/services\/USGS\w+\/MapServer\/tile\/|vginmaps\.vdem\.virginia\.gov\/arcgis\/rest\/services\/VBMP_Imagery\/|services\.nconemap\.gov\/.*\/Orthoimagery_Latest_cached\/|tnmap\.tn\.gov\/arcgis\/rest\/services\/BASEMAPS\/|djlorenz\.github\.io\/astronomy\/image_tiles\//;
/** The elevation tiles (Terrarium, Mapterhorn): always flat grey ground, since contours drawn on noise take minutes. */
const TERRAIN = /s3\.amazonaws\.com\/elevation-tiles-prod\/terrarium\/|tiles\.mapterhorn\.com\//;
/** USGS 3DEP's export: answered here only for Slope's tiles (its rule); the grade's DEM stays with the replay. */
const EXPORT = /elevation\.nationalmap\.gov\/arcgis\/rest\/services\/3DEPElevation\/ImageServer\/exportImage/;
/** Step 16: Public land's tile queries (PAD-US's Manager Name layer; the grade asks another), answered with this. */
const PUBLIC_LAND = /Manager_Name_PADUS\/FeatureServer\/0\/query/;

export interface Tiles {
  /** Answered by us, before the cut. */
  served: number;
  /** Each tile answered, once. */
  urls: Set<string>;
  /** Asked for after the cut: none of them reached a tile host. */
  cutOff: number;
  cut: boolean;
}

export async function answerTiles(
  context: BrowserContext,
  body: Buffer,
  publicLand: unknown = { type: "FeatureCollection", features: [] },
): Promise<Tiles> {
  const t: Tiles = { served: 0, urls: new Set(), cutOff: 0, cut: false };
  const flat = greyPng(256);
  const answer = (route: Route, png: Buffer | string = body, contentType = "image/png") => {
    if (t.cut) {
      t.cutOff++;
      return route.abort("internetdisconnected");
    }
    t.served++;
    t.urls.add(route.request().url());
    return route.fulfill({
      body: png,
      contentType,
      headers: { "access-control-allow-origin": "*" },
    });
  };
  await context.route(TILES, (route: Route) => answer(route));
  await context.route(TERRAIN, (route: Route) => answer(route, flat));
  await context.route(PUBLIC_LAND, (route: Route) =>
    answer(route, JSON.stringify(publicLand), "application/geo+json"),
  );
  await context.route(EXPORT, (route: Route) =>
    new URL(route.request().url()).searchParams.has("renderingRule") ? answer(route) : route.fallback(),
  );
  return t;
}

export interface Stored {
  key: string;
  layer: string;
  bytes: number;
  pins: string[];
}

/** What the offline store knows about each kept tile. */
export const stored = (page: Page): Promise<Stored[]> =>
  page.evaluate(
    () =>
      new Promise<Stored[]>((resolve) => {
        const req = indexedDB.open("parcelscreen-offline");
        req.onsuccess = () => {
          const d = req.result;
          if (!d.objectStoreNames.contains("tiles")) return resolve([]);
          const all = d.transaction("tiles").objectStore("tiles").getAll();
          all.onsuccess = () => resolve(all.result as Stored[]);
        };
        req.onerror = () => resolve([]);
      }),
  );

export const tilesLoaded = (page: Page) =>
  expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { __psMap?: { areTilesLoaded(): boolean } }).__psMap?.areTilesLoaded(),
      ),
    )
    .toBe(true);

/** The service worker installed and in control of this page (a reload after the first visit). */
export async function controlled(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        async () => (await navigator.serviceWorker.getRegistration("/"))?.active?.state ?? "none",
      ),
    )
    .toBe("activated");
  await reload(page);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

/** The layers `answerTiles` answers. */
const ANSWERED = new Set([
  "usgs-imagery",
  "usgs-topo",
  "state-tn",
  "state-nc",
  "state-va",
  "light-pollution",
  "slope",
  "terrarium",
  "relief",
]);

/**
 * Every tile answered so far is stored. The service worker stores a tile after answering it, in the background, so the
 * map can be done before the cache is (a busy CI runner cut the network with most of the view unstored).
 */
export const allStored = (page: Page, tiles: Tiles) =>
  expect
    .poll(async () => (await stored(page)).filter((s) => ANSWERED.has(s.layer)).length, { timeout: 30_000 })
    .toBeGreaterThanOrEqual(tiles.urls.size);
