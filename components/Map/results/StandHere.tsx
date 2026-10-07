"use client";
/**
 * "Stand here" beside the evaluation ring (step 17a; plan phase-0-17-ground.md §2): opens the ground viewer at
 * the point the report's sun, sky and driveway were computed. To stand somewhere else, tap a pin or the
 * bulls-eye first (that moves the evaluation), then Stand here. It needs only the shown result, so a kept
 * one has it too. Hidden while a tool is open, like the ring.
 */
import { useEffect } from "react";
import { Marker } from "maplibre-gl";
import { useOpenGround } from "@/components/Ground/GroundContext";
import { useScreenItContext } from "@/components/Results/ScreenItContext";
import { evaluationPoint } from "@/lib/report/point";
import { useMap } from "../MapView";

export function StandHere() {
  const map = useMap();
  const s = useScreenItContext();
  const open = useOpenGround();
  const tool = s ? s.ctl.state.mode !== null || s.ctl.state.split !== null : false;
  const display = s && !s.stale && !tool ? s.display : null;
  const p = display && open ? evaluationPoint(display) : null;
  const lng = p?.ll[1],
    lat = p?.ll[0];

  useEffect(() => {
    if (!map || !open || lng === undefined || lat === undefined) return;
    const el = document.createElement("button");
    el.className = "stand-here";
    el.textContent = "Stand here";
    el.title = "See the skyline and the sun from this point";
    el.addEventListener("click", (e) => {
      e.stopPropagation(); // not a tap on the map
      open();
    });
    const m = new Marker({ element: el, anchor: "left", offset: [16, 0] }).setLngLat([lng, lat]).addTo(map);
    return () => void m.remove();
  }, [map, open, lng, lat]);

  return null;
}
