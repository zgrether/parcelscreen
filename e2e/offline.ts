/**
 * Step 14e's e2e helpers (offline-cache.spec.ts, save-offline.spec.ts): the map tile hosts answered with PNGs of our
 * own (the service worker's requests reach the context's routes too, in Chromium), what the offline store holds, and
 * the service worker in control.
 */
import { expect, type BrowserContext, type Page, type Route } from "@playwright/test";
import { reload } from "./flow";

/** The basemaps' hosts (USGS and the state aerials) and the atlas's image tiles. */
const TILES =
  /basemap\.nationalmap\.gov\/arcgis\/rest\/services\/USGS\w+\/MapServer\/tile\/|vginmaps\.vdem\.virginia\.gov\/arcgis\/rest\/services\/VBMP_Imagery\/|services\.nconemap\.gov\/.*\/Orthoimagery_Latest_cached\/|tnmap\.tn\.gov\/arcgis\/rest\/services\/BASEMAPS\/|djlorenz\.github\.io\/astronomy\/image_tiles\//;
/** USGS 3DEP's export: answered here only for Slope's tiles (its rule); the grade's DEM stays with the replay. */
const EXPORT = /elevation\.nationalmap\.gov\/arcgis\/rest\/services\/3DEPElevation\/ImageServer\/exportImage/;

export interface Tiles {
  /** Answered by us, before the cut. */
  served: number;
  /** Asked for after the cut: none of them reached a tile host. */
  cutOff: number;
  cut: boolean;
}

export async function answerTiles(context: BrowserContext, body: Buffer): Promise<Tiles> {
  const t: Tiles = { served: 0, cutOff: 0, cut: false };
  const answer = (route: Route) => {
    if (t.cut) {
      t.cutOff++;
      return route.abort("internetdisconnected");
    }
    t.served++;
    return route.fulfill({ body, contentType: "image/png", headers: { "access-control-allow-origin": "*" } });
  };
  await context.route(TILES, answer);
  await context.route(EXPORT, (route: Route) =>
    new URL(route.request().url()).searchParams.has("renderingRule") ? answer(route) : route.fallback(),
  );
  return t;
}

export interface Stored {
  key: string;
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
