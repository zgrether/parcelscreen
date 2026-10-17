/**
 * The breakdown bar (value-ranking.md §8; VR7): for one parcel and one person's weights, the points each graded row
 * earns and loses toward the parcel grade, on the grade's own scale (F 0 to A 4), with the grade lines and the verdict
 * lines marked. A row's share is its weight over the graded rows' weights, so the earned parts add up to the parcel's
 * points.
 */
import { verdictLines } from "../rubric/grade";
import { weightsOf } from "../rubric/weights";
import type { Card, Letter, RowKey } from "./card";

export interface BreakdownRow {
  key: RowKey;
  label: string;
  grade: Letter;
  /** The row's weight as a share of the graded rows' weights (0–1). */
  share: number;
  /** Points earned and lost toward the parcel's grade: share × points, share × (A's points − points). */
  earned: number;
  lost: number;
}

export interface Breakdown {
  rows: BreakdownRow[];
  /** Rows left out because they aren't graded (didn't load, or nothing to grade). */
  ungraded: { key: RowKey; label: string }[];
  /** The parcel's points, and the scale's top (A's points). */
  points: number;
  max: number;
  /** The grade lines (each grade's lower edge) and the verdict's two lines, on the same scale. */
  lines: { at: number; label: string; kind: "grade" | "verdict" }[];
}

/** Null when no row is graded. */
export function breakdown(card: Card): Breakdown | null {
  const K = card.rubric.rubric;
  const w = weightsOf(K);
  const graded = card.rows.filter((r): r is typeof r & { grade: Letter } => r.grade !== null);
  const total = graded.reduce((a, r) => a + w[r.key], 0);
  if (!graded.length || total <= 0) return null;
  const max = K.points.A;
  const rows = graded.map((r) => {
    const share = w[r.key] / total;
    const pts = K.points[r.grade];
    return {
      key: r.key,
      label: r.label,
      grade: r.grade,
      share,
      earned: share * pts,
      lost: share * (max - pts),
    };
  });
  return {
    rows,
    ungraded: card.rows.filter((r) => r.grade === null).map((r) => ({ key: r.key, label: r.label })),
    points: rows.reduce((a, r) => a + r.earned, 0),
    max,
    lines: [
      ...K.gradeCutoffs.map((at, i) => ({ at, label: "ABCD"[i]!, kind: "grade" as const })),
      { at: verdictLines(K).contender, label: "Contender", kind: "verdict" },
      { at: verdictLines(K).pass, label: "Pass below", kind: "verdict" },
    ],
  };
}
