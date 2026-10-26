import { describe, expect, it } from "vitest";
import { DOUBLE_TAP_MS, DOUBLE_TAP_PX, eventTime, isDoubleTap } from "./doubleTap";

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
  it("is timed by when its taps happened, not when a busy page got to them", () => {
    // The second tap's event was made 450 ms after the first, and handled at 523 ms (#348's CI).
    const tapped = (t: number) => ({ timeStamp: t }) as Event;
    const a = { t: eventTime(tapped(1000)), x: 100, y: 100 };
    expect(isDoubleTap(a, { t: eventTime(tapped(1450)), x: 100, y: 100 })).toBe(true);
    expect(eventTime(undefined)).toBeGreaterThan(0);
    expect(eventTime({ timeStamp: 0 } as Event)).toBeGreaterThan(0);
  });
});
