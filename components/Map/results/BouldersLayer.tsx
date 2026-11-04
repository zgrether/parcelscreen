"use client";
/**
 * Boulder ground on the graded parcel (docs/plans/boulders.md §2; Map layers › Boulder ground, off by default): the
 * flagged soils' pieces as a light fill, and the rough lidar patches as a stronger fill with an outline, each naming
 * itself on hover or tap. Hidden with a stale result and while a tool is open, as the other result overlays are.
 */
import { useEffect, useMemo } from "react";
import type { GeoJSONSource } from "maplibre-gl";
import { boulderFeatures } from "@/lib/render/resultGeo";
import { useScreenItContext } from "@/components/Results/ScreenItContext";
import { mapGone, useMap } from "../MapView";
import { LAYER } from "../style";
import { useMapLayerPrefs } from "../useMapLayerPrefs";
import { TIP_AREAS } from "./tooltip";

const SOURCE = "boulder-ground";
export const BOULDER_LAYERS = { fill: "boulder-fill", edge: "boulder-edge" } as const;
/** Amber: apart from the soil units' outlines, the power lines' cyan and the basemaps' greens. */
export const BOULDER_COLOR = "#e0892b";
TIP_AREAS.add(BOULDER_LAYERS.fill);

const EMPTY = { type: "FeatureCollection" as const, features: [] };

export function BouldersLayer() {
  const map = useMap();
  const { boulders } = useMapLayerPrefs();
  const s = useScreenItContext();
  const tool = s ? s.ctl.state.mode !== null || s.ctl.state.split !== null : false;
  const r = s && !s.stale && !tool ? s.display : null;
  const data = useMemo(() => (r && boulders ? boulderFeatures(r) : EMPTY), [r, boulders]);

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
        id: BOULDER_LAYERS.fill,
        type: "fill",
        source: SOURCE,
        paint: {
          "fill-color": BOULDER_COLOR,
          "fill-opacity": ["case", ["==", ["get", "kind"], "rough"], 0.5, 0.2],
        },
      },
      before,
    );
    map.addLayer(
      {
        id: BOULDER_LAYERS.edge,
        type: "line",
        source: SOURCE,
        filter: ["==", ["get", "kind"], "rough"],
        paint: { "line-color": BOULDER_COLOR, "line-width": 2 },
      },
      before,
    );
  }, [map, data]);

  // Gone with the map: removed on unmount.
  useEffect(
    () => () => {
      if (!map || mapGone(map)) return;
      for (const id of Object.values(BOULDER_LAYERS)) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(SOURCE)) map.removeSource(SOURCE);
    },
    [map],
  );
  return null;
}
