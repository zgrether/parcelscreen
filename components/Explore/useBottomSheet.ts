"use client";
/**
 * On narrow portrait screens the panel is a bottom sheet over the map (proto L1622–1642): drag the handle or
 * header to resize, tap to cycle between snap heights (peek 92 px, 46%, 88%), and below 110 px the sheet is
 * in "map mode" with its content hidden. It opens at the peek on every load, so the app starts on the map
 * with the one-line header in reach (owner, after 14d; it used to restore the last height). Landscape and
 * desktop get the side
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
 *
 * Its snaps are shares of the explorer's own height, the space above the tab bar (step 4b), not of the window's.
 *
 * The peek fits what the header holds (owner, step 4c): 92 px, or 148 px while the grade button shows under the header
 * (the two-line name, its acres and the button). A sheet resting at its peek follows it; 46% and 88% don't change.
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";

/** Where the panel becomes a bottom sheet; globals.css uses the same query. */
export const SHEET_QUERY = "(max-width: 860px) and (orientation: portrait)";
const isSheet = () => typeof window !== "undefined" && window.matchMedia(SHEET_QUERY).matches;
/** The space the sheet has: the explorer's height, above the tab bar. */
const space = (root: HTMLElement | null) => root?.clientHeight || window.innerHeight;
/** The peek: the header alone, or the header with the grade button under it (step 4c). */
export const PEEK = 92;
export const PEEK_WITH_ACTION = 148;
/**
 * Step 7: the answer's reason, two lines at most, under the header's grade while a graded parcel is open. UX part 2
 * (J-4): the verdict and letter have a line of their own above it, 22 px more.
 */
export const PEEK_ANSWER = 60;
const snaps = (root: HTMLElement | null, peek: number) => [
  peek,
  Math.round(space(root) * 0.46),
  Math.round(space(root) * 0.88),
];
const clamp = (px: number, root: HTMLElement | null) =>
  Math.round(Math.max(72, Math.min(space(root) * 0.92, px)));
const MAP_MODE_BELOW = 110;
const SNAP_MS = 180;

export function useBottomSheet(
  root: RefObject<HTMLElement | null>,
  panel: RefObject<HTMLElement | null>,
  stepAside = false,
  peek = PEEK,
) {
  // The settled height: the peek at first. "peek" rather than its pixels, so a sheet resting there follows the peek as
  // it changes (step 4c). The explorer renders client-side only, so this runs in the browser.
  const [settled, setSettled] = useState<number | "peek" | null>(() => (isSheet() ? "peek" : null));
  const height = settled === "peek" ? peek : settled;
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
      const s = snaps(root.current, peek);
      const target = s.reduce((a, b) => (Math.abs(b - px) < Math.abs(a - px) ? b : a), s[0]!);
      // Written to the DOM as well as to state: when the drag ends where it started, the state doesn't
      // change and React wouldn't touch the dragged height.
      const p = panel.current;
      p?.style.setProperty("transition", `height ${SNAP_MS}ms`);
      paint(target);
      setDragMapMode(null);
      setSettled(target === s[0] ? "peek" : target);
      setTimeout(() => p?.style.removeProperty("transition"), SNAP_MS + 20);
    },
    [paint, panel, root, peek],
  );

  useEffect(() => {
    // Back to portrait (or narrow again): the height it had, else the peek.
    const onResize = () => setSettled((h) => (isSheet() ? (h ?? "peek") : null));
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

  const atPeek = settled === "peek";
  const firstPeek = useRef(true);
  useEffect(() => {
    if (firstPeek.current) return void (firstPeek.current = false);
    if (!atPeek) return;
    const p = panel.current;
    p?.style.setProperty("transition", `height ${SNAP_MS}ms`);
    const t = setTimeout(() => p?.style.removeProperty("transition"), SNAP_MS + 20);
    return () => clearTimeout(t);
  }, [peek, atPeek, panel]);

  const handlers = {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      // While it's stepped aside the sheet stays put: the tool or the panel has the screen.
      // The handle is a button too (8c), and the one that drags.
      const control = (e.target as HTMLElement).closest("button:not(.sheet-handle),select,input");
      if (!isSheet() || aside || control) return;
      const h = panel.current?.getBoundingClientRect().height ?? 0;
      drag.current = { startY: e.clientY, startH: h, moved: false, h };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d) return;
      const dy = d.startY - e.clientY;
      if (Math.abs(dy) > 4) d.moved = true;
      d.h = clamp(d.startH + dy, root.current);
      paint(d.h);
    },
    onPointerUp: () => {
      const d = drag.current;
      if (!d) return;
      drag.current = null;
      if (!d.moved) {
        const s = snaps(root.current, peek);
        snapTo(d.h < s[1]! * 0.8 ? s[1]! : d.h < s[2]! * 0.9 ? s[2]! : s[0]!);
      } else snapTo(d.h);
    },
  };

  // A tool or the Info panel has the screen: the plain peek, whatever the header holds.
  const shown = aside ? Math.min(height, PEEK) : height;
  const mapMode = dragMapMode ?? (shown != null && shown < MAP_MODE_BELOW);
  /** The header's Map / Panel button. */
  /**
   * After a run, a sheet at its peek (or folded to map mode) rises to its middle snap, once (proto L1566). `tall`: to
   * its top snap from wherever it rests (the progress bar's Steps ▸, Z-9: the step list under the header's rows).
   */
  const raise = (tall = false) => {
    if (!isSheet()) return;
    const [, middle, top] = snaps(root.current, peek);
    if (tall) snapTo(top!);
    else if (settled === "peek" || mapMode) snapTo(middle!);
  };

  return {
    /** The sheet's height as shown (null when the panel is at the side): its peek while it steps aside. */
    height: shown,
    /** How much of the map's bottom the settled sheet covers, in px; stepping aside doesn't change it. */
    inset: height ?? 0,
    mapMode,
    /** Stepped aside for a tool or the Info panel. */
    aside,
    /** Resting at its peek (step 7: the header then shows the answer's reason, which the sheet's body repeats). */
    atPeek: atPeek && !aside,
    handlers: { ...handlers, onPointerCancel: handlers.onPointerUp },
    raise,
  };
}
