"use client";
/**
 * The horizon fan and the evaluation ring (step 15b; proto drawHorizon, L1232–1243). The fan needs the live
 * session (ridge cells on the wide DEM); the ring is the shown result's evaluation point, so a kept result
 * has it too. Both drape on the 13g terrain. A ray's text shows on hover, or on a tap on touch screens
 * (ResultTips).
 */
import { useEffect } from "react";
import type { GeoJSONSource } from "maplibre-gl";
import { fanRays } from "@/lib/render/fan";
import { evaluationPoint } from "@/lib/report/point";
import { useScreenItContext } from "@/components/Results/ScreenItContext";
import { useMap } from "../MapView";
import { LAYER, SOURCE } from "../style";
import { TIP_LAYERS } from "./tooltip";
import { useOverlayPrefs } from "./useOverlayPrefs";

const EMPTY = { type: "FeatureCollection" as const, features: [] };
TIP_LAYERS.add(LAYER.fanRay);

export function FanLayer() {
  const map = useMap();
  const s = useScreenItContext();
  const { fan } = useOverlayPrefs();
  const tool = s ? s.ctl.state.mode !== null || s.ctl.state.split !== null : false;
  const view = s?.view ?? null;
  const from = s?.viewFrom ?? null;
  const canopy = s?.canopyDeg ?? null;
  const display = s && !s.stale ? s.display : null;

  useEffect(() => {
    const src = map?.getSource<GeoJSONSource>(SOURCE.fan);
    if (!src) return;
    src.setData(fan && !tool && view && from && canopy != null ? fanRays(view, from, canopy) : EMPTY);
  }, [map, fan, tool, view, from, canopy]);

  useEffect(() => {
    const src = map?.getSource<GeoJSONSource>(SOURCE.evalRing);
    if (!src) return;
    const p = display && !tool ? evaluationPoint(display) : null;
    src.setData(
      p
        ? { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [p.ll[1], p.ll[0]] } }
        : EMPTY,
    );
  }, [map, display, tool]);

  return null;
}
