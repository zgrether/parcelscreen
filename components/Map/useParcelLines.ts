"use client";
/**
 * Parcel outlines for the current view, from zoom 13.5 (proto refreshLines, L549–560; step 13f plan §1).
 * The view is covered by zoom-14 tiles, each fetched once per session from each state service with
 * simplified geometry (lib/geo/parcelTiles.ts) and kept in a tile cache, so panning back or zooming within
 * the band makes no new requests. Outlines draw as their tiles arrive, refreshed 350 ms after the map stops
 * moving; a parcel that crosses tiles is drawn once.
 *
 * Deviation: the prototype drew them from zoom 15, one request for the whole view. With the Info panel
 * docked a parcel's fit lands about half a zoom wider (owner, #29 and 13f). The outlines are for display
 * and picking only: a selection fetches the full record (fullRecord).
 */
import type { GeoJSONSource, Map as MlMap, PointLike } from "maplibre-gl";
import { useEffect } from "react";
import { browserHttp } from "@/lib/client/http";
import { pickOutline, type ParcelLine } from "@/lib/geo/parcels";
import {
  detailFor,
  fetchTile,
  lineKey,
  LINES_MIN_ZOOM,
  TileCache,
  tileKey,
  tilesFor,
  type Detail,
  type Tile,
  type TileResult,
} from "@/lib/geo/parcelTiles";
import { LAYER, SOURCE } from "./style";

export { LINES_MIN_ZOOM };
export const ZOOM_HINT = "Zoom in to see parcel lines";
export const INCOMPLETE_HINT = "Some parcel lines didn't load here — zoom in.";
/** Below this, the zoom hint isn't shown either: the view is too wide for parcels to mean anything. */
const HINT_FROM_ZOOM = LINES_MIN_ZOOM - 1.5;

/** The outlines currently drawn on each map, as the services returned them. */
const drawn = new WeakMap<MlMap, ParcelLine[]>();

/** Tiles fetched this session, and the requests still going (a tile is never asked for twice at once). */
const cache = new TileCache();
const pending = new Map<string, Promise<TileResult>>();

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

/**
 * The outline under a screen point, as the service returned it. (The map's rendered features are clipped to
 * tiles, so they can't stand in for the boundary; each drawn feature carries its index here instead.)
 */
export function outlineAt(map: MlMap, point: PointLike): ParcelLine | null {
  const lines = drawn.get(map);
  if (!lines || !map.getLayer(LAYER.parcelLinesFill)) return null;
  const hits = map.queryRenderedFeatures(point, { layers: [LAYER.parcelLinesFill] });
  const under = [...new Set(hits.map((h) => h.properties?._i))]
    .filter((i): i is number => typeof i === "number")
    .flatMap((i) => (lines[i] ? [lines[i]] : []));
  // The one containing the tap, smallest first (lib/geo/parcels.ts pickOutline); else what's drawn on top.
  const ll = map.unproject(point);
  return pickOutline(under, [ll.lat, ll.lng]) ?? under[0] ?? null;
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
    const show = (lines: ParcelLine[]) => {
      drawn.set(map, lines);
      source()?.setData({
        type: "FeatureCollection",
        features: lines.map((l, i) => ({ ...l.feature, properties: { ...l.feature.properties, _i: i } })),
      });
    };
    const clearOurHints = (h: string) => (h === ZOOM_HINT || h === INCOMPLETE_HINT ? "" : h);
    if (!enabled) {
      show([]);
      hint(clearOurHints);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Each refresh supersedes the last: a slower answer for an old view never draws over a newer one.
    let generation = 0;

    const refresh = () => {
      const gen = ++generation;
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
      const draw = () => {
        if (gen !== generation) return;
        const seen = new Set<string>();
        const lines: ParcelLine[] = [];
        for (const t of done)
          for (const l of t.lines) {
            const k = lineKey(l);
            if (seen.has(k)) continue;
            seen.add(k);
            lines.push(l);
          }
        show(lines);
      };
      let frame = 0;
      const jobs = serviceUrls.flatMap((url) =>
        tiles.map((t) =>
          loadTile(url, t, detail).then((r) => {
            done.push(r);
            // Draw as tiles arrive, at most once a frame.
            if (!frame)
              frame = requestAnimationFrame(() => {
                frame = 0;
                draw();
              });
          }),
        ),
      );
      void Promise.all(jobs).then(() => {
        if (gen !== generation) return;
        cancelAnimationFrame(frame);
        draw();
        if (done.some((t) => !t.complete && !t.failed)) hint(INCOMPLETE_HINT);
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
      generation++;
    };
  }, [map, enabled, serviceUrls, hint]);
}
