/**
 * The offline map cache's storage (step 14e, docs/plans/step-14e-offline.md §3.3), used by the service worker and the
 * page alike: the tiles themselves in the Cache API (`ps-map-tiles-v1`), and what's known about each in IndexedDB
 * `parcelscreen-offline` (its layer, size, when it was stored and last used, and the saved parcels that pin it), apart
 * from the app's own `parcelscreen` database. Device only: never synced or exported.
 *
 * Storage can be missing or refused (a private window): then nothing is kept and the map simply uses the network.
 */
import { chooseEvictions, automaticBytes, type CacheEntry } from "./evict";
import { DEFAULT_CAP_BYTES } from "./config";

export const OFFLINE_DB = "parcelscreen-offline";
/** 1: tiles, saved, meta (step 14e). */
const OFFLINE_DB_VERSION = 1;
const TILES = "tiles";
const SAVED = "saved";
const META = "meta";
const CAP_KEY = "cap";

/** The Cache API store holding the tiles' bodies. */
export const TILE_CACHE = "ps-map-tiles-v1";

export interface TileMeta extends CacheEntry {
  layer: string;
  /** When it was stored or last refreshed (ms since the epoch). */
  storedAt: number;
}

let db: Promise<IDBDatabase | null> | null = null;

export function openOfflineDb(): Promise<IDBDatabase | null> {
  db ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(OFFLINE_DB, OFFLINE_DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(TILES)) d.createObjectStore(TILES, { keyPath: "key" });
        if (!d.objectStoreNames.contains(SAVED)) d.createObjectStore(SAVED, { keyPath: "parcel" });
        if (!d.objectStoreNames.contains(META)) d.createObjectStore(META);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return db;
}

const done = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });

const result = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });

/** The automatic cache's cap, in bytes. */
export async function readCap(): Promise<number> {
  const d = await openOfflineDb();
  if (!d) return DEFAULT_CAP_BYTES;
  const v = await result(d.transaction(META).objectStore(META).get(CAP_KEY));
  return typeof v === "number" && v > 0 ? v : DEFAULT_CAP_BYTES;
}

export async function writeCap(bytes: number): Promise<void> {
  const d = await openOfflineDb();
  if (!d) return;
  const tx = d.transaction(META, "readwrite");
  tx.objectStore(META).put(bytes, CAP_KEY);
  await done(tx);
}

export async function readTileMeta(key: string): Promise<TileMeta | undefined> {
  const d = await openOfflineDb();
  if (!d) return undefined;
  return (await result(d.transaction(TILES).objectStore(TILES).get(key))) as TileMeta | undefined;
}

export async function allTileMeta(): Promise<TileMeta[]> {
  const d = await openOfflineDb();
  if (!d) return [];
  return (await result(d.transaction(TILES).objectStore(TILES).getAll())) as TileMeta[];
}

/**
 * Keeps a tile: its body in the cache (with the response's own type), and its record, keeping any pins it had. The
 * body is read whole, so its size is exact. Returns the bytes stored.
 */
export async function storeTile(
  key: string,
  layer: string,
  body: Blob,
  contentType: string | null,
  now: number,
  pin?: string,
): Promise<number> {
  const d = await openOfflineDb();
  if (!d) return 0;
  const cache = await caches.open(TILE_CACHE);
  await cache.put(key, new Response(body, { headers: contentType ? { "content-type": contentType } : {} }));
  const tx = d.transaction(TILES, "readwrite");
  const store = tx.objectStore(TILES);
  const before = (await result(store.get(key))) as TileMeta | undefined;
  const pins = new Set(before?.pins ?? []);
  if (pin) pins.add(pin);
  const meta: TileMeta = { key, layer, bytes: body.size, storedAt: now, usedAt: now, pins: [...pins] };
  store.put(meta);
  await done(tx);
  return body.size;
}

/** Marks tiles used now: they're the last the eviction picks. */
export async function touchTiles(keys: readonly string[], now: number): Promise<void> {
  const d = await openOfflineDb();
  if (!d || !keys.length) return;
  const tx = d.transaction(TILES, "readwrite");
  const store = tx.objectStore(TILES);
  for (const key of keys) {
    const req = store.get(key);
    req.onsuccess = () => {
      const m = req.result as TileMeta | undefined;
      if (m) store.put({ ...m, usedAt: now });
    };
  }
  await done(tx);
}

/** Deletes tiles' records, then their bodies. */
async function dropTiles(d: IDBDatabase, keys: readonly string[]): Promise<void> {
  if (!keys.length) return;
  const tx = d.transaction(TILES, "readwrite");
  const store = tx.objectStore(TILES);
  for (const key of keys) store.delete(key);
  await done(tx);
  const cache = await caches.open(TILE_CACHE);
  await Promise.all(keys.map((k) => cache.delete(k)));
}

/** Drops the least recently used unpinned tiles when the automatic cache is past its cap; returns how many. */
export async function evictOverCap(): Promise<number> {
  const d = await openOfflineDb();
  if (!d) return 0;
  const keys = chooseEvictions(await allTileMeta(), await readCap());
  await dropTiles(d, keys);
  return keys.length;
}

/** Clear map cache: every unpinned tile. A parcel saved offline keeps its own. */
export async function clearAutomatic(): Promise<void> {
  const d = await openOfflineDb();
  if (!d) return;
  await dropTiles(
    d,
    (await allTileMeta()).filter((m) => !m.pins.length).map((m) => m.key),
  );
}

/** What the device holds: the automatic cache (what the cap counts) and the tiles saved parcels pin. */
export async function cacheTotals(): Promise<{ automatic: number; pinned: number }> {
  const all = await allTileMeta();
  const automatic = automaticBytes(all);
  return { automatic, pinned: all.reduce((n, m) => n + m.bytes, 0) - automatic };
}

/** A parcel saved offline on this device (Settings › Offline lists them). */
export interface SavedParcel {
  parcel: string;
  name: string;
  /** The bytes of the tiles it pins (shared tiles count for each parcel holding them). */
  bytes: number;
  tiles: number;
  savedAt: string;
  /** False when some requests failed: Try again downloads the rest. */
  complete: boolean;
  failed: number;
}

export async function putSaved(s: SavedParcel): Promise<void> {
  const d = await openOfflineDb();
  if (!d) return;
  const tx = d.transaction(SAVED, "readwrite");
  tx.objectStore(SAVED).put(s);
  await done(tx);
}

export async function listSaved(): Promise<SavedParcel[]> {
  const d = await openOfflineDb();
  if (!d) return [];
  const all = (await result(d.transaction(SAVED).objectStore(SAVED).getAll())) as SavedParcel[];
  return all.sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
}

/** Adds a parcel's pin to a tile already kept; false when it isn't kept (or is too old to keep as it is). */
export async function pinTile(key: string, parcel: string, freshAfter: number): Promise<boolean> {
  const d = await openOfflineDb();
  if (!d) return false;
  // The body first: a transaction can't wait on the Cache API without closing.
  if (!(await (await caches.open(TILE_CACHE)).match(key))) return false;
  const tx = d.transaction(TILES, "readwrite");
  const store = tx.objectStore(TILES);
  const m = (await result(store.get(key))) as TileMeta | undefined;
  const ok = !!m && m.storedAt >= freshAfter;
  if (ok && !m.pins.includes(parcel)) store.put({ ...m, pins: [...m.pins, parcel] });
  await done(tx);
  return ok;
}

/** The pinned tiles' total for one parcel. */
export async function pinnedBy(parcel: string): Promise<{ bytes: number; tiles: number }> {
  const mine = (await allTileMeta()).filter((m) => m.pins.includes(parcel));
  return { bytes: mine.reduce((n, m) => n + m.bytes, 0), tiles: mine.length };
}

/** Delete in Settings › Offline: the parcel's pins go, and a tile no parcel holds joins the automatic cache. */
export async function deleteSaved(parcel: string): Promise<void> {
  const d = await openOfflineDb();
  if (!d) return;
  const tx = d.transaction([TILES, SAVED], "readwrite");
  const tiles = tx.objectStore(TILES);
  const all = (await result(tiles.getAll())) as TileMeta[];
  for (const m of all)
    if (m.pins.includes(parcel))
      tiles.put({ ...m, pins: m.pins.filter((p) => p !== parcel), usedAt: Date.now() });
  tx.objectStore(SAVED).delete(parcel);
  await done(tx);
}

/** This device's average bytes a tile, by layer, from what it keeps (Save offline's estimate). */
export async function averagesByLayer(): Promise<Record<string, number>> {
  const sum = new Map<string, { n: number; bytes: number }>();
  for (const m of await allTileMeta()) {
    const s = sum.get(m.layer) ?? { n: 0, bytes: 0 };
    s.n++;
    s.bytes += m.bytes;
    sum.set(m.layer, s);
  }
  return Object.fromEntries([...sum].map(([layer, s]) => [layer, s.bytes / s.n]));
}
