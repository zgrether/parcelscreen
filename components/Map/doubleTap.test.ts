import { describe, expect, it } from "vitest";
import { DOUBLE_TAP_MS, DOUBLE_TAP_PX, isDoubleTap } from "./doubleTap";

describe("a phone's double-tap (Z-1)", () => {
  const first = { t: 1000, x: 100, y: 100 };
  it("is a second tap within the window and the distance", () => {
    expect(isDoubleTap(first, { t: 1000 + DOUBLE_TAP_MS, x: 100 + DOUBLE_TAP_PX, y: 100 })).toBe(true);
  });
  it("isn't a first tap, a late one or a far one", () => {
    expect(isDoubleTap(null, first)).toBe(false);
    expect(isDoubleTap(first, { t: 1001 + DOUBLE_TAP_MS, x: 100, y: 100 })).toBe(false);
    expect(isDoubleTap(first, { t: 1100, x: 100, y: 101 + DOUBLE_TAP_PX })).toBe(false);
  });
});
