/// <reference lib="webworker" />
/**
 * The service worker's map-tile route (step 14e, docs/plans/step-14e-offline.md §3.2). For a layer whose terms allow
 * it (components/Map/offlineLayers.ts):
 *
 * - cache first: a stored tile answers at once, and is marked used (written in batches);
 * - a tile stored more than REFRESH_AFTER_DAYS ago is fetched again after answering, and replaced if that succeeds;
 * - a tile not stored is fetched, and kept when the answer is good: OK, readable (not opaque), and the kind the layer
 *   serves (an ArcGIS error is JSON with a 200, and is passed on, never kept);
 * - past the cap, the least recently used unpinned tiles go.
 *
 * The roads' TileJSON is the other way round (network first), since it names the week's tile set; offline, the cached
 * one names the tiles that are cached. Anything else passes through untouched, as before this step.
 */
import { isKept, offlineLayerFor, tileCacheKey, type OfflineLayer } from "@/components/Map/offlineLayers";
import { REFRESH_AFTER_DAYS, TOUCH_EVERY_MS } from "./config";
import { evictOverCap, readTileMeta, storeTile, TILE_CACHE, touchTiles } from "./store";

const DAY_MS = 86_400_000;
/** Stores between a check against the cap. Eviction is a full read of the records, so it isn't run per tile. */
const CHECK_EVERY = 50;

let storedSince = 0;
const touched = new Set<string>();
let touchTimer: ReturnType<typeof setTimeout> | null = null;

function touch(key: string): void {
  touched.add(key);
  touchTimer ??= setTimeout(() => {
    const keys = [...touched];
    touched.clear();
    touchTimer = null;
    void touchTiles(keys, Date.now()).catch(() => undefined);
  }, TOUCH_EVERY_MS);
}

/** Whether an answer is worth keeping as this layer's tile. */
export function storable(layer: OfflineLayer, res: Response, body: Blob): boolean {
  if (!res.ok || res.type === "opaque" || res.type === "error" || !body.size) return false;
  const type = res.headers.get("content-type") ?? "";
  if (layer.expect === "image") return type.startsWith("image/");
  if (layer.expect === "json") return type.includes("json");
  // Vector tiles: protobuf, never an error's JSON.
  return !type.includes("json");
}

/** An ArcGIS error answered with a 200: `{"error": …}`. */
export async function isErrorJson(body: Blob): Promise<boolean> {
  if (body.size > 4096) return false;
  return /^\s*\{\s*"error"\s*:/.test(await body.text());
}

async function fetchAndKeep(
  layer: OfflineLayer,
  key: string,
  request: Request,
  event: ExtendableEvent,
): Promise<Response> {
  const res = await fetch(request);
  const copy = res.clone();
  event.waitUntil(
    (async () => {
      const body = await copy.blob();
      if (!storable(layer, copy, body) || (layer.expect === "json" && (await isErrorJson(body)))) return;
      await storeTile(key, layer.id, body, copy.headers.get("content-type"), Date.now());
      if (++storedSince >= CHECK_EVERY) {
        storedSince = 0;
        await evictOverCap();
      }
    })().catch(() => undefined),
  );
  return res;
}

/** Whether the service worker answers this request itself; the matcher Serwist asks first. */
export function isMapTile(url: URL, sameOrigin: boolean): boolean {
  const layer = offlineLayerFor(url, sameOrigin);
  return !!layer && isKept(layer);
}

/** The route's handler. */
export async function handleMapTile({
  request,
  url,
  event,
}: {
  request: Request;
  url: URL;
  event: ExtendableEvent;
}): Promise<Response> {
  const layer = offlineLayerFor(url, url.origin === self.location.origin);
  if (!layer || !isKept(layer)) return fetch(request);
  const body = request.method === "POST" ? await request.clone().text() : undefined;
  const key = tileCacheKey(layer, url, body);
  if (!key) return fetch(request);

  const cache = await caches.open(TILE_CACHE);
  if (layer.networkFirst) {
    try {
      return await fetchAndKeep(layer, key, request, event);
    } catch {
      return (await cache.match(key)) ?? Response.error();
    }
  }

  const hit = await cache.match(key);
  if (!hit) return fetchAndKeep(layer, key, request, event);
  touch(key);
  event.waitUntil(
    (async () => {
      const meta = await readTileMeta(key);
      if (meta && Date.now() - meta.storedAt > REFRESH_AFTER_DAYS * DAY_MS) {
        await fetchAndKeep(layer, key, request.clone(), event);
      }
    })().catch(() => undefined),
  );
  return hit;
}
