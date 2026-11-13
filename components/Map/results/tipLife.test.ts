import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TIP_MS, tipLife } from "./tipLife";

describe("a tapped tip's life (map-room plan §4)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("closes itself after 5 s", () => {
    const hide = vi.fn();
    const life = tipLife(hide);
    life.shown();
    expect(life.open).toBe(true);
    vi.advanceTimersByTime(TIP_MS - 1);
    expect(hide).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(hide).toHaveBeenCalledTimes(1);
    expect(life.open).toBe(false);
  });

  it("shown again, the clock starts over", () => {
    const hide = vi.fn();
    const life = tipLife(hide);
    life.shown();
    vi.advanceTimersByTime(4000);
    life.shown();
    vi.advanceTimersByTime(4000);
    expect(hide).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(hide).toHaveBeenCalledTimes(1);
  });

  it("closed by a tap, a move or a tool first: the clock stops and nothing fires later", () => {
    const hide = vi.fn();
    const life = tipLife(hide);
    life.shown();
    life.hidden();
    expect(life.open).toBe(false);
    vi.advanceTimersByTime(TIP_MS * 2);
    expect(hide).not.toHaveBeenCalled();
  });
});
