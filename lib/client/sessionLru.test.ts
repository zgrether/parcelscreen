import { describe, expect, it } from "vitest";
import { SESSION_BUDGET, SESSION_LIMIT, SessionLru, type SessionEntry } from "./sessionLru";

const MB = 1024 * 1024;
const e = (parcel: string, runId: number, mb = 10): SessionEntry<null> => ({
  parcel,
  runId,
  keys: null,
  bytes: mb * MB,
});
const runs = (xs: SessionEntry<null>[]) => xs.map((x) => x.runId);

describe("live sessions (17e): up to 3, LRU, a size budget, never the current parcel", () => {
  it("keeps 3 and releases the least recently used for a fourth", () => {
    expect([SESSION_LIMIT, SESSION_BUDGET]).toEqual([3, 150 * MB]);
    const l = new SessionLru<null>();
    for (const [p, id] of [
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ] as const)
      expect(l.put(e(p, id), p)).toEqual([]);
    l.touch("a"); // a reopened: b is now the least recently used
    expect(runs(l.put(e("d", 4), "d"))).toEqual([2]);
    expect(l.parcels()).toEqual(["c", "a", "d"]);
  });

  it("a parcel run again replaces its old run, which is released", () => {
    const l = new SessionLru<null>();
    l.put(e("a", 1), "a");
    l.put(e("b", 2), "b");
    expect(runs(l.put(e("a", 3), "a"))).toEqual([1]);
    expect(l.parcels()).toEqual(["b", "a"]);
    expect(l.get("a")!.runId).toBe(3);
  });

  it("over the budget, releases the least recently used until it fits, even below 3", () => {
    const l = new SessionLru<null>();
    l.put(e("a", 1, 60), "a");
    l.put(e("b", 2, 60), "b");
    expect(runs(l.put(e("c", 3, 60), "c"))).toEqual([1]); // 180 MB > 150: a goes
    expect(l.total()).toBe(120 * MB);
  });

  it("never releases the current parcel, even alone over the budget", () => {
    const l = new SessionLru<null>();
    l.put(e("a", 1, 20), "a");
    expect(runs(l.put(e("big", 2, 400), "big"))).toEqual([1]);
    expect(l.parcels()).toEqual(["big"]);
  });

  it("remove forgets one", () => {
    const l = new SessionLru<null>();
    l.put(e("a", 1), "a");
    expect(l.remove("a")?.runId).toBe(1);
    expect(l.remove("a")).toBeUndefined();
  });
});
