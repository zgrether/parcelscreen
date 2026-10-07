"use client";
/**
 * Parcel outlines for the current view, from zoom 14 (proto refreshLines, L549–560; step 13f plan §1).
 * The view is covered by zoom-14 tiles, each fetched once per session from each state service with
 * simplified geometry (lib/geo/parcelTiles.ts) and kept in a tile cache, so panning back or zooming within
 * the band makes no new requests. A parcel that crosses tiles is drawn once.
 *
 * Dense places (owner, after 13f): below zoom 15, each tile's parcel count is asked first (a cached
 * count-only request), and a tile with more than 1,500 parcels waits for zoom 15 ("Dense area — zoom in to
 * see all parcel lines"). The map redraws at most every 250 ms as tiles arrive, plus once when the last one
 * lands, from outlines prepared once per tile.
 *
 * A state service that doesn't answer (owner, after 16b): when nothing could be drawn in the view because a
 * service failed, the hint names it ("Virginia parcel service isn't responding — …"), and a tap or a
 * parcel-number search in that view says the same (parcelServiceDown). Before, the map just stayed empty.
 *
 * Deviation: the prototype drew them from zoom 15, one request for the whole view. The outlines are for
 * display and picking only: a selection fetches the full record (fullRecord).
 */
import type { Feature, MultiPolygon, Polygon } from "geojson";
import type { GeoJSONSource, Map as MlMap, PointLike } from "maplibre-gl";
import { useEffect } from "react";
import { browserHttp } from "@/lib/client/http";
import { pickOutline, type ParcelLine } from "@/lib/geo/parcels";
import {
  countTile,
  DENSE_BELOW_ZOOM,
  detailFor,
  drawsAt,
  fetchTile,
  fieldsFor,
  lineKey,
  LINES_MIN_ZOOM,
  TileCache,
  tileKey,
  tilesFor,
  TILE_ZOOM,
  type Detail,
  type Tile,
  type TileResult,
} from "@/lib/geo/parcelTiles";
import { isServiceDownMessage, serviceDownMessage } from "@/lib/geo/serviceStatus";
import { LAYER, SOURCE } from "./style";

export { LINES_MIN_ZOOM };
export const ZOOM_HINT = "Zoom in to see parcel lines";
export const INCOMPLETE_HINT = "Some parcel lines didn't load here — zoom in.";
export const DENSE_HINT = "Dense area — zoom in to see all parcel lines";
const OUR_HINTS = new Set([ZOOM_HINT, INCOMPLETE_HINT, DENSE_HINT]);
/** Below this, the zoom hint isn't shown either: the view is too wide for parcels to mean anything. */
const HINT_FROM_ZOOM = LINES_MIN_ZOOM - 1.5;
/** The map redraws at most this often while tiles arrive. */
const REDRAW_MS = 250;

/** The outlines drawn now on each map, by key (service and object id), as the services returned them. */
const drawn = new WeakMap<MlMap, Map<string, ParcelLine>>();

/** Tiles fetched this session, and the requests still going (a tile is never asked for twice at once). */
const cache = new TileCache();
const pending = new Map<string, Promise<TileResult>>();
/** Each service's parcel count per tile, for the density guard (a tile's count doesn't change in a session). */
const counts = new Map<string, Promise<number | null>>();

/** The message for a parcel service that failed in the current view while nothing could be drawn. */
const downInView = new WeakMap<MlMap, string>();

/**
 * "Virginia parcel service isn't responding — …" when the view has no parcel lines because that service
 * failed; null otherwise. A tap on empty map and the parcel-number search say it too.
 */
export const parcelServiceDown = (map: MlMap): string | null => downInView.get(map) ?? null;

/** A tile's outlines as the map draws them, built once per tile: each feature tagged with its key. */
interface Prepared {
  keys: string[];
  features: Feature<Polygon | MultiPolygon>[];
}
const prepared = new WeakMap<TileResult, Prepared>();

function prepare(t: TileResult): Prepared {
  let p = prepared.get(t);
  if (!p) {
    const keys = t.lines.map(lineKey);
    p = {
      keys,
      features: t.lines.map((l, i) => ({
        ...l.feature,
        properties: { ...l.feature.properties, _k: keys[i] },
      })),
    };
    prepared.set(t, p);
  }
  return p;
}

function loadTile(serviceUrl: string, tile: Tile, detail: Detail): Promise<TileResult> {
  const key = tileKey(serviceUrl, detail, tile);
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(key);
  if (!p) {
    p = fetchTile(browserHttp, serviceUrl, tile, detail).then((r) => {
      pending.delete(key);
      // A failed request is tried again next time; a tile over the limit stays as it is.
      if (!r.failed) cache.set(key, r);
      return r;
    });
    pending.set(key, p);
  }
  return p;
}

function tileCount(serviceUrl: string, tile: Tile): Promise<number | null> {
  const key = `${serviceUrl}|${TILE_ZOOM}/${tile.x}/${tile.y}`;
  let c = counts.get(key);
  if (!c) {
    c = countTile(browserHttp, serviceUrl, tile).then((n) => {
      if (n === null) counts.delete(key); // asked again next time
      return n;
    });
    counts.set(key, c);
  }
  return c;
}

/**
 * The outline under a screen point, as the service returned it. (The map's rendered features are clipped to
 * tiles, so they can't stand in for the boundary; each drawn feature carries its key here instead.)
 */
export function outlineAt(map: MlMap, point: PointLike): ParcelLine | null {
  const lines = drawn.get(map);
  if (!lines || !map.getLayer(LAYER.parcelLinesFill)) return null;
  const hits = map.queryRenderedFeatures(point, { layers: [LAYER.parcelLinesFill] });
  const under = [...new Set(hits.map((h) => h.properties?._k))]
    .filter((k): k is string => typeof k === "string")
    .flatMap((k) => {
      const l = lines.get(k);
      return l ? [l] : [];
    });
  // The one containing the tap, smallest first (lib/geo/parcels.ts pickOutline); else what's drawn on top.
  const ll = map.unproject(point);
  return pickOutline(under, [ll.lat, ll.lng]) ?? under[0] ?? null;
}

/** The counties of the outlines drawn now, per service: where map search looks for parcel numbers (13f). */
export function countiesShown(map: MlMap): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const l of drawn.get(map)?.values() ?? []) {
    const code = (l.feature.properties as Record<string, unknown> | null)?.[fieldsFor(l.source).county];
    if (code == null || code === "") continue;
    if (!out.has(l.source)) out.set(l.source, new Set());
    out.get(l.source)!.add(String(code));
  }
  return out;
}

export function useParcelLines(
  map: MlMap | null,
  enabled: boolean,
  serviceUrls: readonly string[],
  hint: (text: string | ((prev: string) => string)) => void,
) {
  useEffect(() => {
    if (!map) return;
    const source = () => map.getSource<GeoJSONSource>(SOURCE.parcelLines);
    const visibility = enabled ? "visible" : "none";
    map.setLayoutProperty(LAYER.parcelLines, "visibility", visibility);
    map.setLayoutProperty(LAYER.parcelLinesFill, "visibility", visibility);
    /** Draws the given tiles' outlines, each parcel once. */
    const show = (tiles: readonly TileResult[]) => {
      const lines = new Map<string, ParcelLine>();
      const features: Feature<Polygon | MultiPolygon>[] = [];
      for (const t of tiles) {
        const p = prepare(t);
        p.keys.forEach((k, i) => {
          if (lines.has(k)) return;
          lines.set(k, t.lines[i]!);
          features.push(p.features[i]!);
        });
      }
      drawn.set(map, lines);
      source()?.setData({ type: "FeatureCollection", features });
    };
    const clearOurHints = (h: string) => (OUR_HINTS.has(h) || isServiceDownMessage(h) ? "" : h);
    if (!enabled) {
      downInView.delete(map);
      show([]);
      hint(clearOurHints);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let redraw: ReturnType<typeof setTimeout> | undefined;
    // Each refresh supersedes the last: a slower answer for an old view never draws over a newer one.
    let generation = 0;

    const refresh = () => {
      const gen = ++generation;
      downInView.delete(map);
      clearTimeout(redraw);
      redraw = undefined;
      const zoom = map.getZoom();
      if (zoom < LINES_MIN_ZOOM) {
        show([]);
        hint((h) => (zoom >= HINT_FROM_ZOOM ? ZOOM_HINT : clearOurHints(h)));
        return;
      }
      hint(clearOurHints);
      const b = map.getBounds();
      const tiles = tilesFor({
        west: b.getWest(),
        south: b.getSouth(),
        east: b.getEast(),
        north: b.getNorth(),
      });
      const detail = detailFor(zoom);
      const done: TileResult[] = [];
      const failed = new Set<string>();
      let dense = false;
      const draw = () => {
        if (gen === generation) show(done);
      };
      const jobs = serviceUrls.flatMap((url) =>
        tiles.map(async (t) => {
          // Below zoom 15 a dense tile waits (the count is cached, so this costs one tiny request per tile);
          // from 15 every tile draws, so none is counted.
          if (zoom < DENSE_BELOW_ZOOM && !drawsAt(zoom, await tileCount(url, t))) {
            dense = true;
            return;
          }
          const r = await loadTile(url, t, detail);
          if (r.failed) failed.add(url);
          done.push(r);
          // Redraw as tiles arrive, at most every REDRAW_MS.
          redraw ??= setTimeout(() => {
            redraw = undefined;
            draw();
          }, REDRAW_MS);
        }),
      );
      void Promise.all(jobs).then(() => {
        if (gen !== generation) return;
        clearTimeout(redraw);
        redraw = undefined;
        draw();
        if (failed.size && done.every((t) => t.lines.length === 0)) {
          const message = serviceDownMessage([...failed][0]!);
          downInView.set(map, message);
          hint(message);
        } else if (dense) hint(DENSE_HINT);
        else if (done.some((t) => !t.complete && !t.failed)) hint(INCOMPLETE_HINT);
      });
    };
    const onMove = () => {
      clearTimeout(timer);
      timer = setTimeout(refresh, 350);
    };
    map.on("moveend", onMove);
    refresh();
    return () => {
      map.off("moveend", onMove);
      clearTimeout(timer);
      clearTimeout(redraw);
      generation++;
    };
  }, [map, enabled, serviceUrls, hint]);
}
