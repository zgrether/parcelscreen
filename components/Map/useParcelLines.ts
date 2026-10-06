"use client";
/**
 * Parcel outlines for the current view, at zoom 14.5 and above, from the same state services the tap lookup
 * uses (proto refreshLines, L549–560): refreshed 350 ms after the map stops moving; a newer view cancels an
 * older request so only the latest one draws.
 *
 * Deviation: the prototype drew them from zoom 15. With the Info panel docked (13e-5), a parcel's fit lands
 * about half a zoom level wider, which put a 44-acre parcel's neighbours below 15 (owner, #29 review).
 */
import type { GeoJSONSource, Map as MlMap, PointLike } from "maplibre-gl";
import { useEffect } from "react";
import { browserHttp } from "@/lib/client/http";
import { parcelsInBounds, pickOutline, type ParcelLine } from "@/lib/geo/parcels";
import { LAYER, SOURCE } from "./style";

/** Parcel outlines are fetched and drawn from this zoom up. */
export const LINES_MIN_ZOOM = 14.5;
export const ZOOM_HINT = "Zoom in to see parcel lines";

/** The outlines currently drawn on each map, as the services returned them. */
const drawn = new WeakMap<MlMap, ParcelLine[]>();

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
    if (!enabled) {
      show([]);
      hint((h) => (h === ZOOM_HINT ? "" : h));
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inflight: AbortController | null = null;
    const refresh = async () => {
      if (map.getZoom() < LINES_MIN_ZOOM) {
        show([]);
        hint((h) => (map.getZoom() >= 13 ? ZOOM_HINT : h === ZOOM_HINT ? "" : h));
        return;
      }
      hint((h) => (h === ZOOM_HINT ? "" : h));
      inflight?.abort(); // a newer pan/zoom supersedes this one
      const ctl = new AbortController();
      inflight = ctl;
      const b = map.getBounds();
      try {
        const lines = await parcelsInBounds(
          browserHttp,
          serviceUrls,
          { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() },
          ctl.signal,
        );
        if (inflight !== ctl) return;
        show(lines);
      } catch {
        /* cancelled by a newer view, or every service failed: leave the last outlines */
      }
    };
    const onMove = () => {
      clearTimeout(timer);
      timer = setTimeout(refresh, 350);
    };
    map.on("moveend", onMove);
    void refresh();
    return () => {
      map.off("moveend", onMove);
      clearTimeout(timer);
      inflight?.abort();
    };
  }, [map, enabled, serviceUrls, hint]);
}
