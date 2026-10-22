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

  it("every row a Should card, in the card's order: n down to 1 over n(n+1)/2", () => {
    // The card's rows (step 11 adds one per factor); Within budget (step 10) comes only with budgets.
    const rows = ROW_KEYS.filter((k) => k !== "budget");
    const ranked: RankedCard[] = rows.map((factor) => ({ factor, tier: "should" }));
    const w = rankSumWeights(ranked);
    const n = rows.length;
    expect(round1(rows.map((k) => w[k]))).toEqual(
      round1(rows.map((_, i) => ((n - i) / ((n * (n + 1)) / 2)) * 100)),
    );
    // Fifteen rows since step 11's Internet: 15 down to 1 over 120.
    expect(
      round1([w.elevation, w.climate, w.privacy, w.longView, w.airport, w.longTrail, w.internet]),
    ).toEqual([12.5, 5, 4.2, 3.3, 2.5, 1.7, 0.8]);
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
      driveway: 0,
      town: 0,
      hospital: 5,
      garden: 10,
      climate: 0,
      privacy: 0,
      longView: 0,
      airport: 0,
      longTrail: 0,
      internet: 0,
      budget: 0,
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
      "hospital",
    ]);
  });
});
