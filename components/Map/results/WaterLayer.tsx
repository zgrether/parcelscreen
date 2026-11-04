"use client";
/**
 * Water on the land (docs/plans/water.md §2; Map layers › Water on the land, off by default): the land draining onto
 * the parcel as a faint blue fill with a dashed edge, the flow lines thicker as they gather, likely wet ground filled,
 * and the possible pond sites as rings; each names itself on hover or tap. Hidden with a stale result and while a tool
 * is open, as the other result overlays are.
 */
import { useEffect, useMemo } from "react";
import type { GeoJSONSource } from "maplibre-gl";
import { waterFeatures } from "@/lib/render/resultGeo";
import { useScreenItContext } from "@/components/Results/ScreenItContext";
import { mapGone, useMap } from "../MapView";
import { LAYER } from "../style";
import { useMapLayerPrefs } from "../useMapLayerPrefs";
import { TIP_AREAS, TIP_LAYERS } from "./tooltip";

const SOURCE = "water-on-land";
export const WATER_LAYERS = {
  shedFill: "water-shed-fill",
  shedEdge: "water-shed-edge",
  wet: "water-wet",
  line: "water-line",
  pond: "water-pond",
} as const;
/** Blue, apart from the boulders' amber, the power lines' cyan and the basemaps' greens. */
export const WATER_COLOR = "#2f6fd6";
export const WATER_DEEP = "#123f8c";
TIP_LAYERS.add(WATER_LAYERS.line);
TIP_LAYERS.add(WATER_LAYERS.pond);
TIP_AREAS.add(WATER_LAYERS.wet);
TIP_AREAS.add(WATER_LAYERS.shedFill);

const EMPTY = { type: "FeatureCollection" as const, features: [] };
const kind = (k: string) => ["==", ["get", "kind"], k] as ["==", ["get", string], string];

export function WaterLayer() {
  const map = useMap();
  const { water } = useMapLayerPrefs();
  const s = useScreenItContext();
  const tool = s ? s.ctl.state.mode !== null || s.ctl.state.split !== null : false;
  const r = s && !s.stale && !tool ? s.display : null;
  const data = useMemo(() => (r && water ? waterFeatures(r) : EMPTY), [r, water]);

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
        id: WATER_LAYERS.shedFill,
        type: "fill",
        source: SOURCE,
        filter: kind("shed"),
        paint: { "fill-color": WATER_COLOR, "fill-opacity": 0.08 },
      },
      before,
    );
    map.addLayer(
      {
        id: WATER_LAYERS.shedEdge,
        type: "line",
        source: SOURCE,
        filter: kind("shed"),
        paint: { "line-color": WATER_COLOR, "line-width": 2, "line-dasharray": [3, 2] },
      },
      before,
    );
    map.addLayer(
      {
        id: WATER_LAYERS.wet,
        type: "fill",
        source: SOURCE,
        filter: kind("wet"),
        paint: { "fill-color": WATER_COLOR, "fill-opacity": 0.45, "fill-outline-color": WATER_DEEP },
      },
      before,
    );
    map.addLayer(
      {
        id: WATER_LAYERS.line,
        type: "line",
        source: SOURCE,
        filter: kind("line"),
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": WATER_COLOR,
          // Thicker as it gathers: half an acre is a thread, a hundred acres a stream.
          "line-width": [
            "interpolate",
            ["linear"],
            ["ln", ["max", 0.5, ["get", "acres"]]],
            -0.7,
            1.2,
            4.6,
            5,
          ],
        },
      },
      before,
    );
    map.addLayer(
      {
        id: WATER_LAYERS.pond,
        type: "circle",
        source: SOURCE,
        filter: kind("pond"),
        paint: {
          "circle-radius": 7,
          "circle-color": "#ffffff",
          "circle-opacity": 0.9,
          "circle-stroke-color": WATER_DEEP,
          "circle-stroke-width": 3,
        },
      },
      before,
    );
  }, [map, data]);

  // Gone with the map: removed on unmount.
  useEffect(
    () => () => {
      if (!map || mapGone(map)) return;
      for (const id of Object.values(WATER_LAYERS)) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(SOURCE)) map.removeSource(SOURCE);
    },
    [map],
  );
  return null;
}
