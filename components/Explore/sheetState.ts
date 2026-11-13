/**
 * The phone sheet's resting places and how it moves between them (docs/plans/map-room.md §1). Pure, so every move is
 * unit-tested; useBottomSheet holds it and does the DOM.
 *
 * Four snaps: the line (one slim row: the parcel, its verdict and letter, its acres), the peek (the header), 46% and
 * 88% of the space above the tab bar. Collapsing to the line clears nothing; × is what closes a parcel.
 *
 * Two memories:
 * - `chosen`, the person's own last choice, kept for the session (`ps.sheet`). A parcel opens there, and a grade ends
 *   there; a fresh session starts at the line. Only the person's drags and taps set it.
 * - `above`, where the sheet last rested above the line, for a tap on the line (the peek if none).
 * The app's raises (a line or mark selected opens its row, Steps ▸, the rulebook's Back) move the sheet without
 * touching either.
 */

export type Snap = "line" | "peek" | "mid" | "top";
export type Above = Exclude<Snap, "line">;
export const SNAPS: readonly Snap[] = ["line", "peek", "mid", "top"];

/** The line's height, px: the handle's strip and one 44 px row (map-room plan §1, §12: every control 44 px). */
export const LINE = 60;

export interface SheetState {
  /** Where it rests now. */
  at: Snap;
  /** The person's last choice: what a parcel opens at and a grade ends at. */
  chosen: Snap;
  /** Where it last rested above the line: a tap on the line goes back there. */
  above: Above;
}

export type SheetEvent =
  /** The person let go of a drag nearest this snap. */
  | { type: "drag"; to: Snap }
  /** The handle tapped (or "Collapse the sheet"): down to the line. At the line, it expands instead. */
  | { type: "toggle" }
  /** The line tapped (or "Expand the sheet"): up to where it last rested above the line. */
  | { type: "expand" }
  /** The app shows something in the sheet: up to the middle from the line or the peek, or to the top from anywhere. */
  | { type: "raise"; to: "mid" | "top" }
  /** A parcel opened or a grade finished: back to the person's choice. */
  | { type: "restore" };

export const initialSheet = (chosen: Snap = "line"): SheetState => ({
  at: chosen,
  chosen,
  above: chosen === "line" ? "peek" : chosen,
});

/** The person chose `to`: it rests there, and it's remembered. */
const choose = (s: SheetState, to: Snap): SheetState => ({
  at: to,
  chosen: to,
  // Leaving a height above the line for the line: that height is where a tap on the line returns.
  above: to !== "line" ? to : s.at !== "line" ? s.at : s.above,
});

export function sheetReducer(s: SheetState, e: SheetEvent): SheetState {
  switch (e.type) {
    case "drag":
      return choose(s, e.to);
    case "toggle":
      return s.at === "line" ? choose(s, s.above) : choose(s, "line");
    case "expand":
      return s.at === "line" ? choose(s, s.above) : s;
    case "raise":
      if (e.to === "top") return s.at === "top" ? s : { ...s, at: "top" };
      return s.at === "line" || s.at === "peek" ? { ...s, at: "mid" } : s;
    case "restore":
      return s.at === s.chosen ? s : { ...s, at: s.chosen };
  }
}

/** Each snap's height, px, in a sheet with `space` px above the tab bar and a peek of `peek` px. */
export function snapHeights(space: number, peek: number): Record<Snap, number> {
  return {
    line: LINE,
    peek,
    mid: Math.round(space * 0.46),
    top: Math.round(space * 0.88),
  };
}

/** The snap nearest a dragged height. */
export function nearestSnap(px: number, heights: Record<Snap, number>): Snap {
  return SNAPS.reduce((a, b) => (Math.abs(heights[b] - px) < Math.abs(heights[a] - px) ? b : a));
}

/** The session's memory: `ps.sheet` holds the person's choice. Anything else reads as none (a fresh session). */
export const SHEET_KEY = "ps.sheet";
export const parseChosen = (v: string | null): Snap =>
  v !== null && (SNAPS as readonly string[]).includes(v) ? (v as Snap) : "line";
