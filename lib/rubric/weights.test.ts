/**
 * Rank-sum weights (workflow-review.md, Rubric algorithm 3): the design doc's table, the all-Should series, the
 * ordering guarantee, Won't rows at 0, and weightsOf for both modes.
 */
import { describe, expect, it } from "vitest";
import { rubricFromWeights } from "./default";
import { ROW_KEYS, type RankedCard, type RowKey } from "./types";
import { COULD_FACTOR, rankSumShares, rankSumWeights, weightsOf } from "./weights";

const round1 = (xs: number[]) => xs.map((x) => Math.round(x * 10) / 10);

describe("rank-sum weights", () => {
  it("the design doc's table: 5 Should and 5 Could give 19.5 … 11.7 then 7.3 … 1.5", () => {
    const tiers = [...Array<"should">(5).fill("should"), ...Array<"could">(5).fill("could")];
    expect(round1(rankSumShares(tiers))).toEqual([19.5, 17.6, 15.6, 13.7, 11.7, 7.3, 5.9, 4.4, 2.9, 1.5]);
    // Should carries 78% of the grade, Could 22%.
    const shares = rankSumShares(tiers);
    expect(Math.round(shares.slice(0, 5).reduce((a, b) => a + b, 0))).toBe(78);
    expect(COULD_FACTOR).toBe(0.75);
  });

  it("seven Should cards, the card's rows in order: n down to 1 over 28", () => {
    const ranked: RankedCard[] = ROW_KEYS.map((factor) => ({ factor, tier: "should" }));
    const w = rankSumWeights(ranked);
    expect(round1(ROW_KEYS.map((k) => w[k]))).toEqual([25, 21.4, 17.9, 14.3, 10.7, 7.1, 3.6]);
    expect(Object.values(w).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 9);
  });

  it("every card outweighs the card below it, whatever the tiers; an unranked row weighs 0", () => {
    const ranked: RankedCard[] = [
      { factor: "trails", tier: "should" },
      { factor: "garden", tier: "could" },
      { factor: "sky", tier: "could" },
      { factor: "elevation", tier: "should" },
    ];
    const w = rankSumWeights(ranked);
    const inOrder = ranked.map((c) => w[c.factor]);
    for (let i = 1; i < inOrder.length; i++) expect(inOrder[i]!).toBeLessThan(inOrder[i - 1]!);
    for (const k of ["homesite", "room", "town"] as RowKey[]) expect(w[k]).toBe(0);
    expect(Object.values(w).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 9);
  });

  it("weightsOf: explicit weights as given; rank-sum from the ranked cards", () => {
    const explicit = rubricFromWeights({
      elevation: 25,
      homesite: 25,
      sky: 10,
      room: 15,
      trails: 10,
      town: 5,
      garden: 10,
    });
    expect(weightsOf(explicit)).toEqual(explicit.weights.mode === "explicit" ? explicit.weights.of : null);
    const ranked = { ...explicit, weights: { mode: "rankSum" as const } };
    expect(weightsOf(ranked)).toEqual(rankSumWeights(explicit.ranked));
    // The default's rank order is by weight, ties by the card's order: elevation before homesite.
    expect(explicit.ranked.map((c) => c.factor)).toEqual([
      "elevation",
      "homesite",
      "room",
      "sky",
      "trails",
      "garden",
      "town",
    ]);
  });
});
