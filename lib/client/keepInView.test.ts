/** Popovers inside the window (owner, 10/18): right-aligned to their button near the right edge, shifted or flipped. */
import { describe, expect, it } from "vitest";
import { keepInView } from "./keepInView";

const view = { width: 1280, height: 800 };
const box = (left: number, top: number, w: number, h: number) => ({
  left,
  top,
  right: left + w,
  bottom: top + h,
});

describe("keepInView", () => {
  it("leaves a popover that fits alone", () => {
    expect(keepInView(box(100, 100, 300, 200), view, box(100, 60, 120, 34))).toEqual({ dx: 0, dy: 0 });
  });

  it("past the right edge: right-aligns to its button", () => {
    // The profile button at the header's right end; its menu opened left-aligned to it and ran off the window.
    const button = box(1100, 12, 90, 30);
    const pop = box(1100, 48, 300, 240);
    const { dx, dy } = keepInView(pop, view, button);
    expect(pop.right + dx).toBe(button.right);
    expect(dy).toBe(0);
  });

  it("still too wide for that: shifts in with the margin", () => {
    const { dx } = keepInView(box(300, 48, 360, 200), { width: 375, height: 812 }, box(300, 12, 60, 30));
    expect(300 + dx).toBe(8);
  });

  it("past the bottom: flips above its button when that fits, else shifts up", () => {
    const button = box(40, 700, 100, 30);
    const pop = box(40, 736, 160, 150);
    expect(pop.top + keepInView(pop, view, button).dy).toBe(700 - 6 - 150);
    const tall = box(40, 736, 160, 760);
    const { dy } = keepInView(tall, view, button);
    expect(tall.top + dy).toBeGreaterThanOrEqual(8);
  });

  it("without a button, shifts it in", () => {
    expect(keepInView(box(1200, 100, 200, 100), view)).toEqual({ dx: -128, dy: 0 });
  });
});

describe("keepInView, against an edge", () => {
  it("leaves a full-width bottom sheet where it is", () => {
    expect(keepInView(box(0, 500, 390, 344), { width: 390, height: 844 })).toEqual({ dx: 0, dy: 0 });
  });
});
