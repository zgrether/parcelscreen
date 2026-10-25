"use client";
/**
 * Lidar terrain on the map (roadmap step 14c): the chosen style's layer shown at its opacity, the other hidden (only a
 * shown layer's tiles load). Below zoom 13 the hint says to zoom in, as parcel lines' does; a tile that fails says so
 * once a visit. In 3D the layer drapes over the terrain, as every raster layer does.
 */
import { useEffect, useRef } from "react";
import type { ErrorEvent as MlErrorEvent } from "maplibre-gl";
import { useMap } from "./MapView";
import {
  LIDAR_FAILED,
  LIDAR_HINT,
  LIDAR_LAYER,
  LIDAR_MIN_ZOOM,
  LIDAR_SOURCE,
  LIDAR_STYLES,
  lidarOpacityPaint,
} from "./lidarStyle";
import { useMapLayerPrefs } from "./useMapLayerPrefs";
import { ZOOM_HINT } from "./useParcelLines";

type Hint = (text: string | ((prev: string) => string)) => void;

export function LidarLayer({ hint }: { hint: Hint }) {
  const map = useMap();
  const { lidar } = useMapLayerPrefs();

  useEffect(() => {
    if (!map) return;
    for (const { id } of LIDAR_STYLES) {
      const shown = lidar.on && lidar.style === id;
      map.setLayoutProperty(LIDAR_LAYER[id], "visibility", shown ? "visible" : "none");
      if (shown)
        for (const [prop, value] of Object.entries(lidarOpacityPaint(id, lidar.opacity)))
          map.setPaintProperty(LIDAR_LAYER[id], prop as Parameters<typeof map.setPaintProperty>[1], value);
    }
  }, [map, lidar]);

  // Below zoom 13: "Zoom in to see lidar terrain", over parcel lines' own zoom hint (it means zoom in too), never over
  // another hint (a tool's, say). Taken down at 13 and up, or when the layer goes off.
  useEffect(() => {
    if (!map) return;
    const ours = (h: string) => !h || h === LIDAR_HINT || h === ZOOM_HINT;
    const update = () => {
      if (lidar.on && map.getZoom() < LIDAR_MIN_ZOOM) hint((h) => (ours(h) ? LIDAR_HINT : h));
      else hint((h) => (h === LIDAR_HINT ? "" : h));
    };
    update();
    map.on("moveend", update);
    return () => {
      map.off("moveend", update);
      hint((h) => (h === LIDAR_HINT ? "" : h));
    };
  }, [map, lidar.on, hint]);

  // Tile failures from the lidar sources: one hint per visit, not one per tile (TerrainLayers does the same). A 404 isn't
  // one: Mapterhorn has no deep tile where there's no lidar, and the layer shows what there is.
  const told = useRef(false);
  useEffect(() => {
    if (!map) return;
    const sources = new Set<string>(Object.values(LIDAR_SOURCE));
    const onError = (e: MlErrorEvent) => {
      const sourceId = (e as MlErrorEvent & { sourceId?: string }).sourceId;
      if (told.current || !sourceId || !sources.has(sourceId)) return;
      if ((e.error as Error & { status?: number }).status === 404) return;
      told.current = true;
      hint(LIDAR_FAILED);
      setTimeout(() => hint((h) => (h === LIDAR_FAILED ? "" : h)), 4000);
    };
    map.on("error", onError);
    return () => {
      map.off("error", onError);
    };
  }, [map, hint]);

  return null;
}
