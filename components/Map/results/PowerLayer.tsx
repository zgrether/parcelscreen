"use client";
/**
 * The power lines near the graded parcel (step 14, docs/plans/step-14-land-uses.md §2.1; Map layers › Power lines, off
 * by default): the lines the shown result kept, cyan over a dark casing, each with its voltage and owner on hover or
 * tap. Hidden with a stale result and while a tool is open, as the other result overlays are.
 */
import { useEffect, useMemo } from "react";
import type { GeoJSONSource } from "maplibre-gl";
import { powerFeatures } from "@/lib/render/resultGeo";
import { useScreenItContext } from "@/components/Results/ScreenItContext";
import { mapGone, useMap } from "../MapView";
import { LAYER } from "../style";
import { useMapLayerPrefs } from "../useMapLayerPrefs";
import { TIP_LAYERS } from "./tooltip";

const SOURCE = "power-lines";
export const POWER_LAYERS = { casing: "power-casing", line: "power-line" } as const;
export const POWER_COLOR = "#22c1d6";
export const POWER_CASING = "#0b1410";
TIP_LAYERS.add(POWER_LAYERS.line);

const EMPTY = { type: "FeatureCollection" as const, features: [] };

export function PowerLayer() {
  const map = useMap();
  const { power } = useMapLayerPrefs();
  const s = useScreenItContext();
  const tool = s ? s.ctl.state.mode !== null || s.ctl.state.split !== null : false;
  const r = s && !s.stale && !tool ? s.display : null;
  const data = useMemo(() => (r && power ? powerFeatures(r) : EMPTY), [r, power]);

  useEffect(() => {
    if (!map || mapGone(map)) return;
    const src = map.getSource<GeoJSONSource>(SOURCE);
    if (src) return void src.setData(data);
    if (!data.features.length) return;
    map.addSource(SOURCE, { type: "geojson", data });
    // Under the parcels' outlines, over the basemap and the county's parcel lines.
    const before = map.getLayer(LAYER.savedFill) ? LAYER.savedFill : undefined;
    map.addLayer(
      {
        id: POWER_LAYERS.casing,
        type: "line",
        source: SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": POWER_CASING, "line-width": 5, "line-opacity": 0.7 },
      },
      before,
    );
    map.addLayer(
      {
        id: POWER_LAYERS.line,
        type: "line",
        source: SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": POWER_COLOR, "line-width": 2.5 },
      },
      before,
    );
  }, [map, data]);

  // Gone with the map: removed on unmount.
  useEffect(
    () => () => {
      if (!map || mapGone(map)) return;
      for (const id of Object.values(POWER_LAYERS)) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(SOURCE)) map.removeSource(SOURCE);
    },
    [map],
  );
  return null;
}
