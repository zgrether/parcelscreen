"use client";
/**
 * On narrow portrait screens the panel is a bottom sheet over the map (proto L1622–1642): drag the handle or
 * header to resize, tap to cycle between snap heights (peek 92 px, 46%, 88%), and below 110 px the sheet is
 * in "map mode" with its content hidden. The height persists (ps.sheet). Landscape and desktop get the side
 * panel.
 *
 * Deviation (step 12b): the map stays full-height under the sheet instead of shrinking with it, and a drag
 * moves only the sheet, written straight to the DOM. Resizing the map on every pointer move made it redraw
 * and jump; the prototype's Leaflet map only re-measured after the snap. Once the sheet settles, `inset`
 * reports its height so the map can keep its centre in the part that is still visible.
 *
 * Stepping aside (13e-6): while a map tool is in use or the Info panel is open, the sheet shows at its peek
 * height with its content hidden, so the map and the panel have the room. Nothing is saved and the inset
 * doesn't change (the map doesn't move under a tool); afterwards the sheet is back where it was.
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import { getPref, setPref } from "@/lib/client/prefs";

/** Where the panel becomes a bottom sheet; globals.css uses the same query. */
export const SHEET_QUERY = "(max-width: 860px) and (orientation: portrait)";
const isSheet = () => typeof window !== "undefined" && window.matchMedia(SHEET_QUERY).matches;
const snaps = () => [92, Math.round(window.innerHeight * 0.46), Math.round(window.innerHeight * 0.88)];
const clamp = (px: number) => Math.round(Math.max(72, Math.min(window.innerHeight * 0.92, px)));
const MAP_MODE_BELOW = 110;
const SNAP_MS = 180;

export function useBottomSheet(
  root: RefObject<HTMLElement | null>,
  panel: RefObject<HTMLElement | null>,
  stepAside = false,
) {
  // The settled height: restored from the last visit, else the middle snap. The explorer renders
  // client-side only, so this runs in the browser.
  const [height, setHeight] = useState<number | null>(() =>
    isSheet() ? clamp(getPref("ps.sheet") ?? snaps()[1]!) : null,
  );
  const [dragMapMode, setDragMapMode] = useState<boolean | null>(null);
  const drag = useRef<{ startY: number; startH: number; moved: boolean; h: number } | null>(null);

  /** During a drag: move the sheet without a React render. */
  const paint = useCallback(
    (px: number) => {
      panel.current?.style.setProperty("height", `${px}px`);
      root.current?.style.setProperty("--sheet-h", `${px}px`);
      setDragMapMode(px < MAP_MODE_BELOW); // re-renders only when it flips
    },
    [panel, root],
  );

  const snapTo = useCallback(
    (px: number) => {
      const s = snaps();
      const target = s.reduce((a, b) => (Math.abs(b - px) < Math.abs(a - px) ? b : a), s[0]!);
      // Written to the DOM as well as to state: when the drag ends where it started, the state doesn't
      // change and React wouldn't touch the dragged height.
      const p = panel.current;
      p?.style.setProperty("transition", `height ${SNAP_MS}ms`);
      paint(target);
      setDragMapMode(null);
      setHeight(target);
      setPref("ps.sheet", target);
      setTimeout(() => p?.style.removeProperty("transition"), SNAP_MS + 20);
    },
    [paint, panel],
  );

  useEffect(() => {
    // Back to portrait (or narrow again): the saved height, as at load.
    const onResize = () =>
      setHeight((h) => (isSheet() ? (h ?? clamp(getPref("ps.sheet") ?? snaps()[1]!)) : null));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Stepping aside and back animates like a snap.
  const aside = stepAside && height != null;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) return void (first.current = false);
    const p = panel.current;
    p?.style.setProperty("transition", `height ${SNAP_MS}ms`);
    const t = setTimeout(() => p?.style.removeProperty("transition"), SNAP_MS + 20);
    return () => clearTimeout(t);
  }, [aside, panel]);

  const handlers = {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      // While it's stepped aside the sheet stays put: the tool or the panel has the screen.
      if (!isSheet() || aside || (e.target as HTMLElement).closest("button,select,input")) return;
      const h = panel.current?.getBoundingClientRect().height ?? 0;
      drag.current = { startY: e.clientY, startH: h, moved: false, h };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d) return;
      const dy = d.startY - e.clientY;
      if (Math.abs(dy) > 4) d.moved = true;
      d.h = clamp(d.startH + dy);
      paint(d.h);
    },
    onPointerUp: () => {
      const d = drag.current;
      if (!d) return;
      drag.current = null;
      if (!d.moved) {
        const s = snaps();
        snapTo(d.h < s[1]! * 0.8 ? s[1]! : d.h < s[2]! * 0.9 ? s[2]! : s[0]!);
      } else snapTo(d.h);
    },
  };

  const shown = aside ? Math.min(height, snaps()[0]!) : height;
  const mapMode = dragMapMode ?? (shown != null && shown < MAP_MODE_BELOW);
  /** The header's Map / Panel button. */
  /** After a run, a sheet folded to map mode rises to its middle snap, once (proto L1566). */
  const raise = () => {
    if (isSheet() && mapMode) snapTo(snaps()[1]!);
  };

  return {
    /** The sheet's height as shown (null when the panel is at the side): its peek while it steps aside. */
    height: shown,
    /** How much of the map's bottom the settled sheet covers, in px; stepping aside doesn't change it. */
    inset: height ?? 0,
    mapMode,
    /** Stepped aside for a tool or the Info panel. */
    aside,
    handlers: { ...handlers, onPointerCancel: handlers.onPointerUp },
    raise,
  };
}
