"use client";
/**
 * The result overlays' text (step 15 plan §4): on hover with a mouse, on a tap on a touch screen. Lines and
 * dots within reach win over the soil unit under the point (tooltip.ts). Hover tips follow the pointer.
 *
 * Map room (plan §4): no tip stays pinned. A tapped tip closes on a tap elsewhere, after 5 s (tipLife.ts), when the map
 * moves, or when a tool starts; a hover tip closes when the map moves too.
 */
import { useEffect, useRef } from "react";
import type { MapMouseEvent } from "maplibre-gl";
import { useExplore } from "@/components/Explore/useExploreController";
import { useMap } from "../MapView";
import { canHover, hideTip, showTip, tipAt } from "./tooltip";
import { tipLife } from "./tipLife";

export function ResultTips() {
  const map = useMap();
  const ctl = useExplore();
  const tool = ctl.state.mode !== null || ctl.state.split !== null;
  const close = useRef<() => void>(() => {});
  useEffect(() => {
    if (!map) return;
    const hover = canHover();
    let showing = false;
    const hide = () => {
      if (!showing) return;
      hideTip(map);
      showing = false;
      life.hidden();
    };
    const life = tipLife(() => {
      hideTip(map);
      showing = false;
    });
    close.current = hide;
    const show = (e: MapMouseEvent, px?: number) => {
      const tip = tipAt(map, e.point, px);
      if (tip) {
        showTip(map, e.lngLat, tip);
        showing = true;
        if (!hover) life.shown();
      } else hide();
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
    map.on("movestart", hide);
    return () => {
      map.off("mousemove", onMove);
      map.off("click", onTap);
      map.off("movestart", hide);
      hide();
      close.current = () => {};
    };
  }, [map]);
  // A tool starting closes it.
  useEffect(() => {
    if (tool) close.current();
  }, [tool]);
  return null;
}
