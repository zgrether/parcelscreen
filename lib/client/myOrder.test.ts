import { describe, expect, it } from "vitest";
import { built } from "@/test/support/parcels";
import { byRank, lastRank, RANK_PATTERN, rankBetween, rankForMove, withRanks } from "./myOrder";
import type { ParcelStore } from "./parcelStore";

const store = (...ranks: (string | null)[]): ParcelStore => ({
  v: 2,
  open: null,
  built: ranks.map((rank, i) => built(`k${i}`, { rank })),
});
const order = (s: ParcelStore) => [...s.built].sort(byRank).map((p) => p.key);

describe("ranks (WF3): a fractional index between its neighbours", () => {
  it("between two ranks, before the first, after the last: always strictly between, always well formed", () => {
    expect(rankBetween(null, null)).toBe("V");
    for (const [a, b] of [
      [null, "V"],
      ["V", null],
      ["V", "W"],
      ["V", "V1"],
      ["0V", "1"],
      [null, "01"],
      ["z", null],
      ["zzzz", null],
    ] as [string | null, string | null][]) {
      const r = rankBetween(a, b);
      expect(r).toMatch(RANK_PATTERN);
      if (a !== null) expect(r > a).toBe(true);
      if (b !== null) expect(r < b).toBe(true);
    }
  });

  it("stays in order through many moves at random places (a seeded walk)", () => {
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const ranks: string[] = [];
    for (let n = 0; n < 500; n++) {
      const i = Math.floor(rand() * (ranks.length + 1));
      const r = rankBetween(ranks[i - 1] ?? null, ranks[i] ?? null);
      expect(r).toMatch(RANK_PATTERN);
      ranks.splice(i, 0, r);
    }
    expect([...ranks].sort()).toEqual(ranks);
    expect(new Set(ranks).size).toBe(ranks.length);
  });

  it("refuses an empty gap", () => {
    expect(() => rankBetween("V", "V")).toThrow();
    expect(() => rankBetween("W", "V")).toThrow();
  });
});

describe("every History parcel ranked (withRanks, on each read)", () => {
  it("one kept before WF3 goes to the bottom, in History's order", () => {
    const s = withRanks(store("k", null, "V", null));
    expect(order(s)).toEqual(["k2", "k0", "k1", "k3"]);
    expect(s.built.every((p) => p.rank !== null && RANK_PATTERN.test(p.rank))).toBe(true);
  });

  it("two with the same rank: the later one moves just after the other, before the next", () => {
    const s = withRanks(store("V", "V", "k"));
    expect(order(s)).toEqual(["k0", "k1", "k2"]);
    expect(s.built[0]!.rank).toBe("V");
    expect(s.built[2]!.rank).toBe("k");
  });

  it("unchanged when all are ranked apart: the same store back; the open copy follows its History entry", () => {
    const s = store("V", "k");
    expect(withRanks(s)).toBe(s);
    const open = withRanks({ ...store("V", null), open: built("k1", { rank: null }) });
    expect(open.open!.rank).toBe(open.built[1]!.rank);
    expect(lastRank(open.built)).toBe(open.built[1]!.rank);
  });
});

describe("a move: one parcel's new rank", () => {
  const all = store("1", "2", "3", "4", "5").built;
  const keys = all.map((p) => p.key!);
  const placed = (key: string, rank: string) =>
    [...all.map((p) => (p.key === key ? { ...p, rank } : p))].sort(byRank).map((p) => p.key);

  it("down, up, to the top and to the bottom", () => {
    expect(placed("k0", rankForMove(all, keys, "k0", 2)!)).toEqual(["k1", "k2", "k0", "k3", "k4"]);
    expect(placed("k3", rankForMove(all, keys, "k3", 1)!)).toEqual(["k0", "k3", "k1", "k2", "k4"]);
    expect(placed("k4", rankForMove(all, keys, "k4", 0)!)).toEqual(["k4", "k0", "k1", "k2", "k3"]);
    expect(placed("k0", rankForMove(all, keys, "k0", 4)!)).toEqual(["k1", "k2", "k3", "k4", "k0"]);
  });

  it("among the rows shown, parcels the filters hide keep their places", () => {
    // k1 and k3 hidden: k4 moved above k2 lands just after k0, so still above the hidden k1.
    const shown = ["k0", "k2", "k4"];
    expect(placed("k4", rankForMove(all, shown, "k4", 1)!)).toEqual(["k0", "k4", "k1", "k2", "k3"]);
    // k0 moved below k2 lands just after it, above the hidden k3.
    expect(placed("k0", rankForMove(all, shown, "k0", 1)!)).toEqual(["k1", "k2", "k0", "k3", "k4"]);
    // To the top: just before the first row shown.
    expect(placed("k2", rankForMove(all, shown, "k2", 0)!)).toEqual(["k2", "k0", "k1", "k3", "k4"]);
  });

  it("no move: the same place, past either end, or a parcel not shown", () => {
    expect(rankForMove(all, keys, "k2", 2)).toBeNull();
    expect(rankForMove(all, keys, "k0", -1)).toBeNull();
    expect(rankForMove(all, keys, "k4", 5)).toBeNull();
    expect(rankForMove(all, ["k0"], "k3", 0)).toBeNull();
  });
});
