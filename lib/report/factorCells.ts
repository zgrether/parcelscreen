/**
 * A card's factors as cells (step 10b plan §1–§2): the Favorites grid's factor columns and the phone card's strip, in
 * the rubric's order: the Musts first, as their marks (a limit that's ranked too with its letter, "✓B"), then Really
 * want and Nice to have as letters. Don't care is left out. Pure.
 */
import type { Factor, Letter } from "../rubric/types";
import { EDITOR_TITLES, SHORT_TITLES } from "../rubric/words";
import type { Card, GateStatus } from "./card";
import { GATE_MARK, MUST_STATUS_WORD, mustLines, mustText, shownRankedRows } from "./cardLines";

export interface FactorCell {
  key: Factor;
  /** The grid's header and the strip's label: "Elev". */
  short: string;
  /** The full name: "Elevation at the build site". */
  title: string;
  kind: "must" | "grade";
  /** A Must's outcome. */
  status?: GateStatus;
  /** A row's letter; on a Must, the letter of a limit that's ranked too. Null: not graded. */
  grade?: Letter | null;
  /** The cell: "✓", "✓B", "!", "B", "–". */
  text: string;
  /** What the cell's title says: the row's detail or the Must's reason. */
  detail: string;
  /** For sorting and best-in-column, higher is better; null when unknown (sorted last, never best). */
  score: number | null;
}

/** A Must's outcomes, worst to best: unknown isn't ranked. */
const STATUS_SCORE: Record<GateStatus, number | null> = { fail: 0, warn: 1, pass: 2, unknown: null };

export function factorCells(card: Card): FactorCell[] {
  const points = card.rubric.rubric.points;
  const musts = mustLines(card).map((m): FactorCell => {
    const key = m.key as Factor;
    const status = STATUS_SCORE[m.status];
    // A limit that's ranked too sorts by its outcome, then its letter.
    const letter = m.grade !== undefined && m.grade !== null ? points[m.grade] : 0;
    return {
      key,
      short: SHORT_TITLES[key],
      title: EDITOR_TITLES[key],
      kind: "must",
      status: m.status,
      ...(m.grade !== undefined ? { grade: m.grade } : {}),
      text: `${GATE_MARK[m.status]}${m.grade !== undefined ? (m.grade ?? "–") : ""}`,
      // mustText says "Check first: …" itself; a pass says so here.
      detail: m.status === "pass" ? `${MUST_STATUS_WORD.pass}: ${mustText(m)}` : mustText(m),
      score: status === null ? null : status * 10 + letter,
    };
  });
  const { should, could } = shownRankedRows(card);
  const grades = [...should, ...could].map((r): FactorCell => ({
    key: r.key,
    short: SHORT_TITLES[r.key],
    title: EDITOR_TITLES[r.key],
    kind: "grade",
    grade: r.grade,
    text: r.grade ?? "–",
    detail: r.detail,
    score: r.grade ? points[r.grade] : null,
  }));
  return [...musts, ...grades];
}
