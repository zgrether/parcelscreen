/**
 * A card's factors as cells (step 10b plan §1–§2): the Favorites grid's factor columns and the phone card's strip, in
 * the rubric's order: the Musts first, as their marks (a limit that's ranked too with its letter, "✓B"), then Really
 * want and Nice to have as letters. Don't care is left out. Pure.
 */
import type { Factor, Letter } from "../rubric/types";
import { EDITOR_TITLES, SHORT_TITLES } from "../rubric/words";
import type { Card, GateStatus } from "./card";
import { GATE_MARK, MUST_STATUS_WORD, mustLines, mustText, shownRankedRows } from "./cardLines";
import { SET_ASIDE_READING } from "./adjustWords";
import { shownLetter } from "./adjust";

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
  /** The person's adjustment on this parcel (step 12): marked ✎. */
  adjusted?: true;
  /** Set aside on this parcel (step 12): no mark or letter, never best. */
  setAside?: true;
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
      ...(m.adjusted ? { adjusted: true as const } : {}),
    };
  });
  const { should, could } = shownRankedRows(card);
  const grades = [...should, ...could].map((r): FactorCell => {
    // The letter every view shows (adjust.ts shownLetter): the person's override, marked ✎.
    const l = shownLetter(card, r.key)!;
    return {
      key: r.key,
      short: SHORT_TITLES[r.key],
      title: EDITOR_TITLES[r.key],
      kind: "grade",
      grade: l.grade,
      text: l.grade ?? "–",
      detail: r.detail,
      score: l.grade ? points[l.grade] : null,
      ...(l.adjusted ? { adjusted: true as const } : {}),
    };
  });
  // Step 12: what the person set aside here keeps its column, empty and marked.
  const aside = (card.setAside ?? []).map((x): FactorCell => ({
    key: x.key,
    short: SHORT_TITLES[x.key],
    title: EDITOR_TITLES[x.key],
    kind: x.must ? "must" : "grade",
    text: "–",
    detail: SET_ASIDE_READING(x.reason),
    score: null,
    adjusted: true,
    setAside: true,
  }));
  return [...musts, ...grades, ...aside];
}

/** A Must's outcomes in the order the phone card's chips put them: the failing ones first. */
const CHIP_ORDER: Record<GateStatus, number> = { fail: 0, warn: 1, unknown: 2, pass: 3 };

/**
 * The phone card's chips (Z-7, UX part 2 PR 7c2, plan §9 Q7): the person's top four factors by their own order. A Must
 * that isn't a pass comes first, failing ones first; then the letters in the rubric's order (a limit that's ranked too
 * among them). A Must that passes and has no letter is left out, as is what's set aside: the strip on a desktop has them.
 */
export function cardChips(cells: FactorCell[], n = 4): FactorCell[] {
  const shown = cells.filter((c) => !c.setAside);
  const musts = shown
    .filter((c) => c.kind === "must" && c.status && c.status !== "pass")
    .sort((a, b) => CHIP_ORDER[a.status!] - CHIP_ORDER[b.status!]);
  const letters = shown.filter((c) => c.grade !== undefined && !musts.includes(c));
  return [...musts, ...letters].slice(0, n);
}
