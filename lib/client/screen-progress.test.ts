/**
 * A4b PR B (owner, 2026-10-10): debug mode times each step as the page sees it, for the owner's phone timings of
 * the driveway step, and can be turned on from the URL.
 */
import { afterEach, describe, expect, it } from "vitest";
import { debugFromUrl, debugOn } from "./debugHandle";
import { initial, reducer } from "./useScreen";

describe("step times (debug mode)", () => {
  it("a step's time runs from its first event to its end, as the page received them", () => {
    const at = (t: number, status: "run" | "done", message?: string) => ({
      type: "message" as const,
      at: t,
      msg: {
        type: "progress" as const,
        id: 1,
        event: { step: "driveway" as const, status, ...(message ? { message } : {}) },
      },
    });
    let s = reducer({ ...initial, status: "running", runId: 1 }, at(1000, "run"));
    s = reducer(s, at(1800, "run", "2 route searches done"));
    expect(s.steps.driveway).toMatchObject({
      status: "run",
      message: "2 route searches done",
      startedAt: 1000,
    });
    expect(s.steps.driveway!.ms).toBeUndefined();
    s = reducer(s, at(4200, "done"));
    expect(s.steps.driveway!.ms).toBe(3200);
  });

  const store = new Map<string, string>();
  const ls = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  afterEach(() => {
    store.clear();
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it("?debug=1 turns debug mode on and ?debug=0 off (for a phone)", () => {
    (globalThis as { localStorage?: unknown }).localStorage = ls;
    debugFromUrl("?parcel=x&debug=1");
    expect(debugOn()).toBe(true);
    debugFromUrl("?parcel=x");
    expect(debugOn()).toBe(true); // kept until changed
    debugFromUrl("?debug=0");
    expect(debugOn()).toBe(false);
  });
});
