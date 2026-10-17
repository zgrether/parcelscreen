/**
 * Grade and verdict arithmetic (workflow-review.md, Rubric algorithm 4–5): a row's letter from its band, the parcel's
 * score as the weighted mean of the graded rows' points (over the rows the rubric ranks: Won't rows are left out), and
 * the letter that score reaches. The verdict rules live with the gates, in lib/report/card.ts `cardFor`.
 */
import type { Letter, Rubric, RowKey } from "./types";
import { weightsOf } from "./weights";

const LETTERS: readonly Letter[] = ["A", "B", "C", "D"];

/** The grade whose lower edge `v` reaches, cutoffs best first; below the last, an F. */
export const atLeast = (v: number, cutoffs: readonly number[]): Letter =>
  LETTERS[cutoffs.findIndex((c) => v >= c)] ?? "F";

/** The grade whose upper edge `v` is within, cutoffs best first; beyond the last, an F. */
export const atMost = (v: number, cutoffs: readonly number[]): Letter =>
  LETTERS[cutoffs.findIndex((c) => v <= c)] ?? "F";

export interface GradedRow {
  key: RowKey;
  grade: Letter;
}

/** The rows that count: graded, and not a Won't. */
export function gradedRows<R extends { key: RowKey; grade: Letter | null }>(
  rows: readonly R[],
  rubric: Rubric,
): (R & { grade: Letter })[] {
  return rows.filter((x): x is R & { grade: Letter } => x.grade !== null && !rubric.wonts.includes(x.key));
}

/**
 * The parcel's points (the weighted mean of the graded rows' points) and its letter; both null when no row counts
 * or the counted rows have no weight.
 */
export function parcelGrade(
  graded: readonly GradedRow[],
  rubric: Rubric,
  weights: Record<RowKey, number> = weightsOf(rubric),
): { points: number | null; grade: Letter | null } {
  const weight = graded.reduce((a, x) => a + weights[x.key], 0);
  const points =
    weight > 0 ? graded.reduce((a, x) => a + weights[x.key] * rubric.points[x.grade], 0) / weight : null;
  return { points, grade: points === null ? null : atLeast(points, rubric.gradeCutoffs) };
}
