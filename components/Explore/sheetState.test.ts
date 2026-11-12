import { describe, expect, it } from "vitest";
import {
  LINE,
  initialSheet,
  nearestSnap,
  parseChosen,
  sheetReducer,
  snapHeights,
  type SheetEvent,
  type SheetState,
} from "./sheetState";

const run = (s: SheetState, ...events: SheetEvent[]) => events.reduce(sheetReducer, s);

describe("the phone sheet's moves (map-room plan §1)", () => {
  it("a fresh session starts at the line; a remembered choice is where it starts", () => {
    expect(initialSheet()).toEqual({ at: "line", chosen: "line", above: "peek" });
    expect(initialSheet("mid")).toEqual({ at: "mid", chosen: "mid", above: "mid" });
  });

  it("the handle collapses to the line from any height, and expands from the line to where it was", () => {
    for (const from of ["peek", "mid", "top"] as const) {
      const down = run(initialSheet(from), { type: "toggle" });
      expect(down).toEqual({ at: "line", chosen: "line", above: from });
      expect(run(down, { type: "toggle" })).toEqual({ at: from, chosen: from, above: from });
      expect(run(down, { type: "expand" })).toEqual({ at: from, chosen: from, above: from });
    }
  });

  it("a tap on the line with nothing above it remembered opens the peek", () => {
    expect(run(initialSheet(), { type: "expand" })).toEqual({ at: "peek", chosen: "peek", above: "peek" });
  });

  it("expand does nothing above the line", () => {
    const s = initialSheet("mid");
    expect(sheetReducer(s, { type: "expand" })).toBe(s);
  });

  it("a drag settles on any of the four snaps, and is remembered", () => {
    const s = run(initialSheet("mid"), { type: "drag", to: "line" });
    expect(s).toEqual({ at: "line", chosen: "line", above: "mid" });
    expect(run(s, { type: "drag", to: "top" })).toEqual({ at: "top", chosen: "top", above: "top" });
  });

  it("the app's raises move the sheet but aren't remembered; a grade or a parcel opened goes back to the choice", () => {
    const raised = run(initialSheet(), { type: "raise", to: "mid" });
    expect(raised).toEqual({ at: "mid", chosen: "line", above: "peek" });
    expect(run(raised, { type: "restore" })).toEqual(initialSheet());
    // To the top from anywhere (Steps ▸); to the middle only from the line or the peek.
    expect(run(initialSheet("mid"), { type: "raise", to: "top" }).at).toBe("top");
    const tall = initialSheet("top");
    expect(sheetReducer(tall, { type: "raise", to: "mid" })).toBe(tall);
    expect(run(initialSheet("peek"), { type: "raise", to: "mid" }).at).toBe("mid");
  });

  it("collapsing from a raise remembers the raised height for the next tap on the line", () => {
    const s = run(initialSheet(), { type: "raise", to: "mid" }, { type: "toggle" });
    expect(s).toEqual({ at: "line", chosen: "line", above: "mid" });
    expect(run(s, { type: "expand" }).at).toBe("mid");
  });

  it("snaps by height: the line, the peek, 46% and 88%; a drag lands on the nearest", () => {
    const h = snapHeights(700, 152);
    expect(h).toEqual({ line: LINE, peek: 152, mid: 322, top: 616 });
    expect(nearestSnap(70, h)).toBe("line");
    expect(nearestSnap(120, h)).toBe("peek");
    expect(nearestSnap(300, h)).toBe("mid");
    expect(nearestSnap(680, h)).toBe("top");
  });

  it("the session's memory reads only the four snaps", () => {
    expect(parseChosen("mid")).toBe("mid");
    expect(parseChosen(null)).toBe("line");
    expect(parseChosen("46")).toBe("line");
  });
});
