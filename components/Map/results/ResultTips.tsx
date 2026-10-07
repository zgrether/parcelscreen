"use client";
/**
 * The result overlays' text (step 15 plan §4): on hover with a mouse, on a tap on a touch screen. Lines and
 * dots within reach win over the soil unit under the point (tooltip.ts). Hover tips follow the pointer; a
 * tapped tip stays until the next tap.
 */
import { useEffect, useRef } from "react";
import type { MapMouseEvent } from "maplibre-gl";
import { useMap } from "../MapView";
import { canHover, hideTip, showTip, tipAt } from "./tooltip";

export function ResultTips() {
  const map = useMap();
  const showing = useRef(false);
  useEffect(() => {
    if (!map) return;
    const hover = canHover();
    const show = (e: MapMouseEvent, px?: number) => {
      const tip = tipAt(map, e.point, px);
      if (tip) {
        showTip(map, e.lngLat, tip);
        showing.current = true;
      } else if (showing.current) {
        hideTip(map);
        showing.current = false;
      }
      return tip;
    };
    const onMove = (e: MapMouseEvent) => {
      const tip = show(e, 4);
      const canvas = map.getCanvas();
      if (tip) canvas.style.cursor = "help";
      else if (canvas.style.cursor === "help") canvas.style.cursor = "";
    };
    const onTap = (e: MapMouseEvent) => void show(e);
    if (hover) map.on("mousemove", onMove);
    else map.on("click", onTap);
    return () => {
      map.off("mousemove", onMove);
      map.off("click", onTap);
    };
  }, [map]);
  return null;
}
