"use client";
/**
 * The site pins (step 15b; proto finalizeRanking, L1185–1193): 1…, S1…, G1…, ✕ as DOM markers, which sit on
 * the 13g terrain and fade behind ridges. A tap re-evaluates at the pin's own stored position (never an
 * unprojected screen point, 13g §5) under the prototype's label ("site #2"); it isn't kept (15 plan Q1).
 * Gardens only show their text. Without a live session (after a reload) the pins are drawn but a tap shows
 * "Run again to evaluate here." Hidden while a tool is open.
 */
import { useEffect, useRef } from "react";
import { Marker } from "maplibre-gl";
import { inertTip, pinSpecs, type PinSpec } from "@/lib/render/pins";
import { useScreenItContext } from "@/components/Results/ScreenItContext";
import type { ScreenIt } from "@/components/Results/panel/ScreenIt";
import { useMap } from "../MapView";
import { canHover, hideTip, showTip } from "./tooltip";
import { useOverlayPrefs } from "./useOverlayPrefs";

const CLASS: Record<PinSpec["kind"], string> = {
  site: "",
  shelf: " shelf",
  garden: " garden",
  excluded: " veto",
};

export function ResultPins() {
  const map = useMap();
  const s = useScreenItContext();
  const { pins: shown } = useOverlayPrefs();
  const latest = useRef<ScreenIt | null>(s);
  useEffect(() => {
    latest.current = s;
  });

  const tool = s ? s.ctl.state.mode !== null || s.ctl.state.split !== null : false;
  const display = s && !s.stale && shown && !tool ? s.display : null;
  // Inert ("Run again to evaluate here.") only for a kept result with no run going: during a run the session
  // is on its way.
  const live = !!s?.view || !!s?.runningHere;

  useEffect(() => {
    if (!map || !display) return;
    const markers = pinSpecs(display).map((pin) => {
      const el = document.createElement("div");
      el.className = `sitepin${CLASS[pin.kind]}${pin.top ? " top" : ""}`;
      el.textContent = pin.text;
      el.dataset.pin = pin.key;
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", live ? pin.tip : inertTip(pin));
      const tip = () => {
        const now = latest.current;
        return now?.view || now?.runningHere ? pin.tip : inertTip(pin);
      };
      const at: [number, number] = [pin.ll[1], pin.ll[0]];
      // Hover only where there is a mouse: after a tap, touch screens fire emulated mouse events, and a
      // mouseleave would hide the tip the tap just showed.
      if (canHover()) {
        el.addEventListener("mouseenter", () => showTip(map, at, tip()));
        el.addEventListener("mouseleave", () => hideTip(map));
      }
      el.addEventListener("click", (e) => {
        // The pin's tap is its own: not the map's (which would close the parcel).
        e.stopPropagation();
        const now = latest.current;
        if (pin.evalLabel && now?.view) {
          hideTip(map);
          now.evaluateAt(pin.ll, pin.evalLabel);
        } else if (!now?.runningHere) showTip(map, at, tip());
      });
      return new Marker({ element: el }).setLngLat(at).addTo(map);
    });
    return () => {
      markers.forEach((m) => m.remove());
      hideTip(map);
    };
  }, [map, display, live]);

  return null;
}
