"use client";
/**
 * Applies the terrain preview's settings to the map (step 13g): 3D terrain and its exaggeration, and the
 * hillshade and contour layers' visibility. If the elevation tiles fail, the hint says so once; MapLibre keeps
 * drawing the map flat.
 */
import { useEffect, useRef } from "react";
import type { ErrorEvent as MlErrorEvent } from "maplibre-gl";
import { useMap } from "./MapView";
import { SKY, TERRAIN_LAYER, TERRAIN_SOURCE } from "./terrainStyle";
import { useTerrainPrefs } from "./useTerrainPrefs";

type Hint = (text: string | ((prev: string) => string)) => void;
const FAILED = "Terrain tiles didn't load";

export function TerrainLayers({ hint }: { hint: Hint }) {
  const map = useMap();
  const t = useTerrainPrefs();

  useEffect(() => {
    if (!map) return;
    map.setTerrain(t.terrain ? { source: TERRAIN_SOURCE.terrain, exaggeration: t.exaggeration } : null);
    const show = (id: string, on: boolean) =>
      map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    show(TERRAIN_LAYER.hillshade, t.hillshade);
    show(TERRAIN_LAYER.contourLines, t.contours);
    show(TERRAIN_LAYER.contourLabels, t.contours);
  }, [map, t]);

  useEffect(() => {
    map?.setSky(SKY);
  }, [map]);

  // Tile failures from the terrain sources: one hint per visit, not one per tile.
  const told = useRef(false);
  useEffect(() => {
    if (!map) return;
    const ours = new Set<string>(Object.values(TERRAIN_SOURCE));
    // A tile error carries the failing source's id, though MapLibre's ErrorEvent type doesn't declare it.
    const onError = (e: MlErrorEvent) => {
      const sourceId = (e as MlErrorEvent & { sourceId?: string }).sourceId;
      if (told.current || !sourceId || !ours.has(sourceId)) return;
      told.current = true;
      hint(FAILED);
      setTimeout(() => hint((h) => (h === FAILED ? "" : h)), 4000);
    };
    map.on("error", onError);
    return () => {
      map.off("error", onError);
    };
  }, [map, hint]);

  return null;
}
