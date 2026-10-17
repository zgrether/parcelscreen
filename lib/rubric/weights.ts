/**
 * Rank becomes weight (workflow-review.md, Rubric algorithm 3): with n ranked cards, first place counts n, second
 * n − 1, down to 1; Could cards count 75% of their rank value; the weights are scaled to total 100. Every card
 * outweighs the card below it, so a drag never has a surprising effect. Rows the rubric doesn't rank (Won't) weigh 0.
 */
import { ROW_KEYS, type RankedCard, type RowKey, type Rubric } from "./types";

/** Could cards count this much of their rank value. */
export const COULD_FACTOR = 0.75;

/** Each ranked card's share of 100, in rank order, from its tier alone. */
export function rankSumShares(tiers: readonly ("should" | "could")[]): number[] {
  const n = tiers.length;
  const raw = tiers.map((t, i) => (n - i) * (t === "could" ? COULD_FACTOR : 1));
  const total = raw.reduce((a, b) => a + b, 0);
  return raw.map((v) => (total > 0 ? (v / total) * 100 : 0));
}

export function rankSumWeights(ranked: readonly RankedCard[]): Record<RowKey, number> {
  const shares = rankSumShares(ranked.map((c) => c.tier));
  const out = Object.fromEntries(ROW_KEYS.map((k) => [k, 0])) as Record<RowKey, number>;
  ranked.forEach((c, i) => {
    out[c.factor] = shares[i]!;
  });
  return out;
}

/** The rubric's weights by row: its explicit ones, or rank-sum from its ranked cards. */
export const weightsOf = (r: Rubric): Record<RowKey, number> =>
  r.weights.mode === "explicit" ? r.weights.of : rankSumWeights(r.ranked);
