/**
 * Today's card as a rubric (step 1 plan §3.2): the four gates as Musts, every row ranked Should in the order of the
 * weights (ties by the card's order), no Won't, today's bands, points, grade cutoffs and verdict lines, and explicit
 * weights. Rank-sum weights would keep every letter on the fixtures but move the points, so the default stays
 * explicit; step 3's editor switches a rubric to rank-sum when its owner first orders the cards (owner, 2026-10-16).
 * The numbers come from `SCREEN_CONSTANTS.card` (CLAUDE.md rule 4), never from here.
 */
import { SCREEN_CONSTANTS } from "../screen/config";
import {
  GATE_KEYS,
  MINE,
  ROW_KEYS,
  type Bands,
  type Letter,
  type NamedRubric,
  type Rubric,
  type RowKey,
} from "./types";

/** What the default rubric takes from the card's config. */
export interface CardNumbers {
  rows: Bands;
  points: Record<Letter, number>;
  gradeCutoffs: readonly number[];
  verdict: { contender: number; pass: number; contenderMaxWarns: number };
}

/** The card's config with the default rubric's weights (`card.weights.default`). */
export type CardConfigNumbers = CardNumbers & { weights: { default: Record<RowKey, number> } };

/** The default rubric: today's card with its default weights, explicit (owner, step 1 plan §8 Q1). */
export const defaultRubric = (K: CardConfigNumbers = SCREEN_CONSTANTS.card): Rubric =>
  rubricFromWeights(K.weights.default, K);

/** The default rubric as a profile's own, named "Mine": what a fresh profile grades with. */
export const defaultNamedRubric = (K: CardConfigNumbers = SCREEN_CONSTANTS.card): NamedRubric => ({
  id: MINE,
  name: "Mine",
  rubric: defaultRubric(K),
});

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
