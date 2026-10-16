/**
 * Today's card as a rubric (step 1 plan §3.2): the four gates as Musts, every row ranked Should in the order of the
 * weights (ties by the card's order), no Won't, today's bands, points, grade cutoffs and verdict lines, and explicit
 * weights. Rank-sum weights would keep every letter on the fixtures but move the points, so the default stays
 * explicit; step 3's editor switches a rubric to rank-sum when its owner first orders the cards (owner, 2026-10-16).
 * The numbers come from `SCREEN_CONSTANTS.card` (CLAUDE.md rule 4), never from here.
 */
import { SCREEN_CONSTANTS } from "../screen/config";
import { GATE_KEYS, ROW_KEYS, type Bands, type Letter, type Rubric, type RowKey } from "./types";

/** What the default rubric takes from the card's config. */
export interface CardNumbers {
  rows: Bands;
  points: Record<Letter, number>;
  gradeCutoffs: readonly number[];
  verdict: { contender: number; pass: number; contenderMaxWarns: number };
}

export function rubricFromWeights(
  weights: Record<RowKey, number>,
  K: CardNumbers = SCREEN_CONSTANTS.card,
): Rubric {
  const byWeight = [...ROW_KEYS].sort(
    (a, b) => weights[b] - weights[a] || ROW_KEYS.indexOf(a) - ROW_KEYS.indexOf(b),
  );
  return {
    version: 1,
    musts: GATE_KEYS.map((factor) => ({ factor })),
    ranked: byWeight.map((factor) => ({ factor, tier: "should" })),
    wonts: [],
    bands: { ...K.rows },
    weights: { mode: "explicit", of: { ...weights } },
    points: { ...K.points },
    gradeCutoffs: [...K.gradeCutoffs],
    verdict: { ...K.verdict },
  };
}
