/// <reference lib="webworker" />
/**
 * Save offline's downloads, run by the service worker (step 14e, docs/plans/step-14e-offline.md §4): the page sends
 * the plan (lib/offline/plan.ts) over a message channel, and this fetches each request through lib/http.ts (at most
 * four at a time per host), keeps it pinned to the parcel, and reports progress back. The worker is the one writer of
 * the tile cache: the page's own tile requests go through it anyway.
 *
 * A tile already kept, and stored within the refresh window, is pinned without asking again (unless it's Update
 * offline copy). A request that fails is counted, and the parcel is saved as incomplete; what did download stays.
 */
import { offlineLayerFor, tileCacheKey, type OfflineLayer } from "@/components/Map/offlineLayers";
import { MAX_PAGES, tileQuery } from "@/lib/geo/parcelTiles";
import { CancelledError, createHttpClient } from "@/lib/http";
import { REFRESH_AFTER_DAYS } from "./config";
import type { SaveItem } from "./plan";
import { pinnedBy, pinTile, putSaved, storeTile, type SavedParcel } from "./store";
import { isErrorJson, storable } from "./swTiles";

export interface SaveRequest {
  type: "SAVE_OFFLINE";
  parcel: string;
  name: string;
  items: SaveItem[];
  /** Update offline copy: fetch everything again. */
  force: boolean;
}

export type SaveReply =
  | { type: "progress"; done: number; total: number; failed: number }
  | { type: "done"; saved: SavedParcel }
  | { type: "full" }
  | { type: "cancelled" };

const DAY_MS = 86_400_000;
/** At most this many progress messages a second. */
const PROGRESS_MS = 150;

const http = createHttpClient({ env: "browser" });

const isQuota = (e: unknown): boolean => e instanceof DOMException && e.name === "QuotaExceededError";

/** One request: fetched (or found kept) and pinned. Throws on a full device; false when it didn't download. */
async function keep(
  layer: OfflineLayer,
  url: string,
  body: string | undefined,
  req: SaveRequest,
  signal: AbortSignal,
): Promise<{ ok: boolean; more: boolean }> {
  const key = tileCacheKey(layer, new URL(url, self.location.origin), body);
  if (!key) return { ok: false, more: false };
  const freshAfter = req.force ? Infinity : Date.now() - REFRESH_AFTER_DAYS * DAY_MS;
  // A parcel-line page that's kept can't say whether another page follows, so those are always fetched.
  if (layer.id !== "parcel-lines" && (await pinTile(key, req.parcel, freshAfter)))
    return { ok: true, more: false };
  const res = await http.fetch(url, {
    signal,
    timeoutMs: 30_000,
    ...(body !== undefined ? { method: "POST", body: new URLSearchParams(body) } : {}),
  });
  const blob = await res.blob();
  if (!storable(layer, res, blob) || (layer.expect === "json" && (await isErrorJson(blob))))
    return { ok: false, more: false };
  await storeTile(key, layer.id, blob, res.headers.get("content-type"), Date.now(), req.parcel);
  if (layer.id !== "parcel-lines") return { ok: true, more: false };
  const page = JSON.parse(await blob.text()) as {
    exceededTransferLimit?: boolean;
    properties?: { exceededTransferLimit?: boolean };
  };
  return { ok: true, more: !!(page.exceededTransferLimit || page.properties?.exceededTransferLimit) };
}

async function item(i: SaveItem, req: SaveRequest, signal: AbortSignal): Promise<boolean> {
  if (i.kind === "get") {
    const url = new URL(i.url, self.location.origin);
    const layer = offlineLayerFor(url, url.origin === self.location.origin);
    return !!layer && (await keep(layer, url.href, undefined, req, signal)).ok;
  }
  const url = `${i.serviceUrl}/query`;
  const layer = offlineLayerFor(new URL(url), false);
  if (!layer) return false;
  for (let page = 0; page < MAX_PAGES; page++) {
    const r = await keep(layer, url, tileQuery(i.serviceUrl, i.tile, i.detail, page).toString(), req, signal);
    if (!r.ok) return false;
    if (!r.more) return true;
  }
  return true;
}

/** Runs one save, replying on `port`; a "cancel" message on the port stops it. */
export async function runSave(req: SaveRequest, port: MessagePort): Promise<void> {
  const ctl = new AbortController();
  port.onmessage = (e: MessageEvent) => {
    if ((e.data as { type?: string } | null)?.type === "cancel") ctl.abort();
  };
  const total = req.items.length;
  let done = 0;
  let failed = 0;
  let full = false;
  let last = 0;
  const report = (force = false) => {
    const now = Date.now();
    if (!force && now - last < PROGRESS_MS) return;
    last = now;
    port.postMessage({ type: "progress", done, total, failed } satisfies SaveReply);
  };
  await Promise.all(
    req.items.map(async (i) => {
      try {
        if (!(await item(i, req, ctl.signal))) failed++;
      } catch (e) {
        if (isQuota(e) && !full) {
          full = true;
          ctl.abort();
        } else if (!(e instanceof CancelledError)) failed++;
      }
      done++;
      report();
    }),
  );
  report(true);
  // Recorded however it ended, so what downloaded is listed (as Incomplete when cut short) and Delete can free it: a pin
  // with no saved parcel behind it would never be evicted.
  const stopped = full || ctl.signal.aborted;
  const pinned = await pinnedBy(req.parcel);
  const saved: SavedParcel = {
    parcel: req.parcel,
    name: req.name,
    ...pinned,
    savedAt: new Date().toISOString(),
    complete: !stopped && failed === 0,
    failed: stopped ? total - done + failed : failed,
  };
  if (pinned.tiles) await putSaved(saved);
  if (full) return port.postMessage({ type: "full" } satisfies SaveReply);
  if (stopped) return port.postMessage({ type: "cancelled" } satisfies SaveReply);
  port.postMessage({ type: "done", saved } satisfies SaveReply);
}
