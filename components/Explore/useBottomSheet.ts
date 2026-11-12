"use client";
/**
 * On narrow portrait screens the panel is a bottom sheet over the map (proto L1622–1642). Landscape and desktop get the
 * side panel.
 *
 * Room for the map (docs/plans/map-room.md §1): four snaps, the line (one slim row), the peek (the header), 46% and 88%
 * (sheetState.ts holds the moves). Drag the handle, the header or the line to any of them. A tap on the handle collapses
 * the sheet to the line, or from the line opens it to where it was; a tap on the line opens it too. Header taps no
 * longer cycle the heights (Zach, #427 Q3). Collapsing clears nothing: × closes the parcel. The person's choice is kept
 * for the session (`ps.sheet`): a parcel opens there and a grade ends there, the line in a fresh session (Zach, #427 Q1:
 * no rise to 46% after a grade). Below 110 px the sheet is in "map mode", its report hidden.
 *
 * Deviation (step 12b): the map stays full-height under the sheet instead of shrinking with it, and a drag
 * moves only the sheet, written straight to the DOM. Resizing the map on every pointer move made it redraw
 * and jump; the prototype's Leaflet map only re-measured after the snap. Once the sheet settles, `inset`
 * reports its height so the map can keep its centre in the part that is still visible.
 *
 * Stepping aside (13e-6): while a map tool is in use, the sheet shows at its peek height at most, with its content
 * hidden, so the map has the room. Nothing is saved and the inset doesn't change (the map doesn't move under a tool);
 * afterwards the sheet is back where it was.
 *
 * Its snaps are shares of the explorer's own height, the space above the tab bar (step 4b), not of the window's.
 *
 * The peek fits what the header holds (owner, step 4c): 92 px, or 148 px while the grade button shows under the header
 * (the two-line name, its acres and the button). A sheet resting at its peek follows it; the others don't change.
 */
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import {
  LINE,
  SHEET_KEY,
  initialSheet,
  nearestSnap,
  parseChosen,
  sheetReducer,
  snapHeights,
  type SheetEvent,
  type SheetState,
} from "./sheetState";

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
const clamp = (px: number, root: HTMLElement | null) =>
  Math.round(Math.max(LINE, Math.min(space(root) * 0.92, px)));
const MAP_MODE_BELOW = 110;
const SNAP_MS = 180;

const readChosen = () => {
  try {
    return parseChosen(sessionStorage.getItem(SHEET_KEY));
  } catch {
    return parseChosen(null);
  }
};

/**
 * Where a drag starts, from its element's `data-grip`: a tap on the handle toggles, on the line expands, on the header
 * does nothing.
 */
export type Grip = "handle" | "header" | "line";

export function useBottomSheet(
  root: RefObject<HTMLElement | null>,
  panel: RefObject<HTMLElement | null>,
  stepAside = false,
  peek = PEEK,
) {
  // The explorer renders client-side only, so this runs in the browser.
  const [sheetNow, setSheetNow] = useState(isSheet);
  // The room above the tab bar, px: measured once mounted and on each resize.
  const [room, setRoom] = useState(() => window.innerHeight);
  const [state, setState] = useState<SheetState>(() => initialSheet(readChosen()));
  const [dragMapMode, setDragMapMode] = useState<boolean | null>(null);
  const drag = useRef<{ startY: number; startH: number; moved: boolean; h: number; grip: Grip } | null>(
    null,
  );
  const height = sheetNow ? snapHeights(room, peek)[state.at] : null;
  useLayoutEffect(() => {
    const measure = () => {
      setSheetNow(isSheet());
      setRoom(space(root.current));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [root]);

  // The person's choice, for the session (map-room plan §1).
  useEffect(() => {
    try {
      sessionStorage.setItem(SHEET_KEY, state.chosen);
    } catch {
      /* storage blocked: it lasts until the page closes */
    }
  }, [state.chosen]);

  /** During a drag: move the sheet without a React render. */
  const paint = (px: number) => {
    panel.current?.style.setProperty("height", `${px}px`);
    root.current?.style.setProperty("--sheet-h", `${px}px`);
    setDragMapMode(px < MAP_MODE_BELOW); // re-renders only when it flips
  };

  /** Every settled move animates like a snap. */
  const animate = () => {
    const p = panel.current;
    p?.style.setProperty("transition", `height ${SNAP_MS}ms`);
    setTimeout(() => p?.style.removeProperty("transition"), SNAP_MS + 20);
  };

  const move = (e: SheetEvent) => {
    if (!isSheet()) return;
    animate();
    setDragMapMode(null);
    setState((s) => sheetReducer(s, e));
  };

  /** After a drag: to the nearest snap. Written to the DOM as well, since a drag that ends where it started changes no state. */
  const settle = (px: number) => {
    const h = snapHeights(space(root.current), peek);
    const to = nearestSnap(px, h);
    animate();
    paint(h[to]);
    setDragMapMode(null);
    setState((s) => sheetReducer(s, { type: "drag", to }));
  };

  // Stepping aside and back animates like a snap; so does a peek that changes under a sheet resting at it.
  const aside = stepAside && height != null;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) return void (first.current = false);
    const p = panel.current;
    p?.style.setProperty("transition", `height ${SNAP_MS}ms`);
    const t = setTimeout(() => p?.style.removeProperty("transition"), SNAP_MS + 20);
    return () => clearTimeout(t);
  }, [aside, panel]);
  const atPeek = state.at === "peek";
  const firstPeek = useRef(true);
  useEffect(() => {
    if (firstPeek.current) return void (firstPeek.current = false);
    if (!atPeek) return;
    const p = panel.current;
    p?.style.setProperty("transition", `height ${SNAP_MS}ms`);
    const t = setTimeout(() => p?.style.removeProperty("transition"), SNAP_MS + 20);
    return () => clearTimeout(t);
  }, [peek, atPeek, panel]);

  /** A drag on the handle ends in a click too: that one isn't a tap. */
  const dragged = useRef(false);
  const onPointerUp = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (d.moved) {
      dragged.current = d.grip === "handle";
      return settle(d.h);
    }
    // A tap on the line opens the sheet; the header no longer cycles (Zach, #427 Q3). The handle's tap is its click.
    if (d.grip === "line") move({ type: "expand" });
  };
  const handlers = {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      // While it's stepped aside the sheet stays put: the tool has the screen. The handle is a button too (8c), and the
      // one that drags; other buttons (×, Grade) keep their taps.
      const control = (e.target as HTMLElement).closest("button:not(.sheet-handle),select,input");
      if (!isSheet() || aside || control) return;
      const grip = (e.currentTarget.dataset.grip ?? "header") as Grip;
      dragged.current = false;
      const h = panel.current?.getBoundingClientRect().height ?? 0;
      drag.current = { startY: e.clientY, startH: h, moved: false, h, grip };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d) return;
      const dy = d.startY - e.clientY;
      if (Math.abs(dy) > 4) d.moved = true;
      d.h = clamp(d.startH + dy, root.current);
      if (d.moved) paint(d.h);
    },
    onPointerUp,
    onPointerCancel: onPointerUp,
  };

  // A tool has the screen: the plain peek at most, whatever the header holds.
  const shown = aside && height != null ? Math.min(height, PEEK) : height;
  const mapMode = dragMapMode ?? (shown != null && shown < MAP_MODE_BELOW);
  const atLine = sheetNow && state.at === "line";

  return {
    /** The sheet's height as shown (null when the panel is at the side): its peek at most while it steps aside. */
    height: shown,
    /** How much of the map's bottom the settled sheet covers, in px; stepping aside doesn't change it. */
    inset: height ?? 0,
    mapMode,
    /** Stepped aside for a tool. */
    aside,
    /** Resting at its peek (step 7: the header then shows the answer's reason, which the sheet's body repeats). */
    atPeek: sheetNow && atPeek && !aside,
    /** Resting at the line: the slim row shows in the header's place. */
    atLine,
    /**
     * The drag, on each grip (the handle, the header, the line), each marked with its `data-grip`: a tap on the handle
     * toggles, on the line expands, on the header does nothing.
     */
    handlers,
    /**
     * The handle's click, "Collapse the sheet" / "Expand the sheet": a tap, a key or a screen reader's activation alike,
     * but not the click a drag on it ends with.
     */
    onHandleClick: () => {
      if (dragged.current) dragged.current = false;
      else move({ type: "toggle" });
    },
    /**
     * The app shows something in the sheet: a selected line's or mark's row, the rulebook's panel on Back (to the
     * middle, from the line or the peek), or the step list (`tall`, Steps ▸: the top). Not remembered.
     */
    raise: (tall = false) => move({ type: "raise", to: tall ? "top" : "mid" }),
    /** A parcel opened or a grade finished: back to the person's choice. */
    restore: () => move({ type: "restore" }),
  };
}
