"use client";
/**
 * Parcel outlines for the current view, at zoom 15 and above, from the same state services the tap lookup
 * uses (proto refreshLines, L549–560): refreshed 350 ms after the map stops moving; a newer view cancels an
 * older request so only the latest one draws.
 */
import type { GeoJSONSource, Map as MlMap, PointLike } from "maplibre-gl";
import { useEffect } from "react";
import { browserHttp } from "@/lib/client/http";
import { parcelsInBounds, type ParcelLine } from "@/lib/geo/parcels";
import { LAYER, SOURCE } from "./style";

export const ZOOM_HINT = "Zoom in to 15+ to see parcel lines";

/** The outlines currently drawn on each map, as the services returned them. */
const drawn = new WeakMap<MlMap, ParcelLine[]>();

/**
 * The outline under a screen point, as the service returned it. (The map's rendered features are clipped to
 * tiles, so they can't stand in for the boundary; each drawn feature carries its index here instead.)
 */
export function outlineAt(map: MlMap, point: PointLike): ParcelLine | null {
  if (!map.getLayer(LAYER.parcelLinesFill)) return null;
  const hit = map.queryRenderedFeatures(point, { layers: [LAYER.parcelLinesFill] })[0];
  const i = hit?.properties?._i;
  return typeof i === "number" ? (drawn.get(map)?.[i] ?? null) : null;
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
      if (map.getZoom() < 15) {
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
