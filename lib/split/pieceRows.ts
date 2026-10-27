/**
 * A piece's figures in the scenario view (step 14, plan §5.1, §5.3), one row each, in order: its grade under the
 * person's rubric, its cost to camp and to build (no land price: "plus the land"), and its county check. A figure for
 * every piece is one more row here (step 15's break-even will be). Pure: the view draws the rows as they come.
 */
import { VERDICT_WORD, type Card } from "../report/card";
import { COST_WORDS } from "../report/cost";
import { costSummary } from "../report/costLines";
import type { Letter } from "../rubric/types";
import { DIVIDE } from "../uses/words";
import type { CountyCheck } from "./countyCheck";

export interface PieceRow {
  key: string;
  label: string;
  value: string;
  /** The gate colours (§8): pass, warn or fail; null for a plain figure. The value always says it in words. */
  tone: "pass" | "warn" | "fail" | null;
  /** The grade row's letter (null when no row was graded). */
  grade?: Letter | null;
}

/** Each verdict in the gate colours, as the card colours it. */
const VERDICT_TONE: Record<Card["verdict"], PieceRow["tone"]> = {
  Contender: "pass",
  Maybe: "warn",
  Pass: "fail",
};

/** A split piece's cost when its way in isn't routed (Z6). */
export const PIECE_NOT_PRICED = "not priced: the way in isn't routed yet";

export function pieceRows(card: Card, check: CountyCheck, gradeLabel: string): PieceRow[] {
  const grade: PieceRow = {
    key: "grade",
    label: gradeLabel,
    value: VERDICT_WORD[card.verdict],
    tone: VERDICT_TONE[card.verdict],
    grade: card.grade,
  };
  const s = costSummary(card.cost);
  // Polish 2 (Z6, owner): a piece with no route has the same two rows as its neighbour, each not priced, so the pieces
  // compare row for row.
  const cost: PieceRow[] = !s
    ? (["camp", "build"] as const).map((which) => ({
        key: which,
        label: COST_WORDS[which],
        value: PIECE_NOT_PRICED,
        tone: null,
      }))
    : s.kind === "noWay"
      ? [{ key: "cost", label: COST_WORDS.section, value: s.text, tone: null }]
      : s.lines.map((l) => ({ key: l.which, label: l.label, value: l.range, tone: null }));
  const county: PieceRow = {
    key: "county",
    label: DIVIDE.countyLabel,
    value: check.text,
    tone: check.pass === null ? null : check.pass ? "pass" : "fail",
  };
  return [grade, ...cost, county];
}
