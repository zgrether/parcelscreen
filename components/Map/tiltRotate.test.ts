/** The tilt-and-rotate gesture's two decisions (map UX, 2026-10-10); e2e/map-gestures.spec.ts drives the real one. */
import { describe, expect, it } from "vitest";
import { draggedCamera, isDoublePress } from "./tiltRotate";

describe("a double-click: a second press soon after, near the first release", () => {
  const up = { t: 1000, x: 100, y: 100 };
  it("within 400 ms and 6 px it continues the double-click", () => {
    expect(isDoublePress(up, { t: 1300, x: 103, y: 102 })).toBe(true);
  });
  it("too late, too far, or with no release before, it doesn't", () => {
    expect(isDoublePress(up, { t: 1450, x: 100, y: 100 })).toBe(false);
    expect(isDoublePress(up, { t: 1100, x: 110, y: 100 })).toBe(false);
    expect(isDoublePress(null, { t: 1100, x: 100, y: 100 })).toBe(false);
  });
});

describe("the camera while dragging", () => {
  const start = { bearing: 10, pitch: 20 };
  it("up tilts toward the horizon, down flattens; right turns clockwise", () => {
    expect(draggedCamera(start, 0, -40, 80)).toEqual({ bearing: 10, pitch: 40 });
    expect(draggedCamera(start, 0, 20, 80)).toEqual({ bearing: 10, pitch: 10 });
    expect(draggedCamera(start, 60, 0, 80)).toEqual({ bearing: 40, pitch: 20 });
  });
  it("the tilt stays between flat and the map's limit (a tool's lock is 0)", () => {
    expect(draggedCamera(start, 0, -400, 80).pitch).toBe(80);
    expect(draggedCamera(start, 0, 400, 80).pitch).toBe(0);
    expect(draggedCamera(start, 0, -400, 0).pitch).toBe(0);
  });
});
