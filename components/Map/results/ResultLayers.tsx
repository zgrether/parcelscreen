"use client";
/**
 * The soil units, trailheads and driveway (step 15c; proto drawSoilUnits L1203–1207, L1129, drawDriveway
 * L1402–1408, B1 fixed: the driveway is on the map). All from the shown result, so a kept result draws them
 * too. The entrances are DOM pins (E1…) like the site pins; they show their text and don't evaluate. Each
 * overlay has its eye in Info › Layers; all hide while a tool is open, and with a stale result.
 */
import { useEffect, useMemo } from "react";
import { Marker, type GeoJSONSource } from "maplibre-gl";
import { drivewayFeatures, soilFeatures, trailheadFeatures } from "@/lib/render/resultGeo";
import { useScreenItContext } from "@/components/Results/ScreenItContext";
import { useMap } from "../MapView";
import { LAYER, SOURCE } from "../style";
import { canHover, hideTip, showTip, TIP_AREAS, TIP_LAYERS } from "./tooltip";
import { useOverlayPrefs } from "./useOverlayPrefs";

const EMPTY = { type: "FeatureCollection" as const, features: [] };
for (const id of [LAYER.driveRoute, LAYER.driveSecond, LAYER.driveDirect, LAYER.culverts, LAYER.trailheads])
  TIP_LAYERS.add(id);
TIP_AREAS.add(LAYER.soilFill);

export function ResultLayers() {
  const map = useMap();
  const s = useScreenItContext();
  const on = useOverlayPrefs();
  const tool = s ? s.ctl.state.mode !== null || s.ctl.state.split !== null : false;
  const r = s && !s.stale && !tool ? s.display : null;

  useEffect(() => {
    map?.getSource<GeoJSONSource>(SOURCE.soils)?.setData(r && on.soils ? soilFeatures(r) : EMPTY);
  }, [map, r, on.soils]);
  useEffect(() => {
    map
      ?.getSource<GeoJSONSource>(SOURCE.trailheads)
      ?.setData(r && on.trailheads ? trailheadFeatures(r) : EMPTY);
  }, [map, r, on.trailheads]);

  const drive = useMemo(() => (r && on.driveway ? drivewayFeatures(r) : null), [r, on.driveway]);
  useEffect(() => {
    map?.getSource<GeoJSONSource>(SOURCE.driveway)?.setData(drive ? drive.lines : EMPTY);
  }, [map, drive]);

  // The entrance pins: yellow E1…, their text on hover or tap.
  const entrances = drive?.entrances ?? null;
  useEffect(() => {
    if (!map || !entrances?.length) return;
    const markers = entrances.map((e) => {
      const el = document.createElement("div");
      el.className = "sitepin entrance";
      el.textContent = e.text;
      el.dataset.pin = e.key;
      el.setAttribute("role", "img");
      el.setAttribute("aria-label", e.tip);
      const at: [number, number] = [e.ll[1], e.ll[0]];
      if (canHover()) {
        el.addEventListener("mouseenter", () => showTip(map, at, e.tip));
        el.addEventListener("mouseleave", () => hideTip(map));
      }
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        showTip(map, at, e.tip);
      });
      return new Marker({ element: el }).setLngLat(at).addTo(map);
    });
    return () => markers.forEach((m) => m.remove());
  }, [map, entrances]);

  return null;
}
