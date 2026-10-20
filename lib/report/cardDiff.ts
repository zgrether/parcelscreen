/**
 * What an edit changed on the card (step 8b, owner on #228): a line's or a mark's edit in Details regrades the card at
 * display time, and a short note under the header says what moved: "Septic now passes", or "Driveway on your land: ! →
 * ✓ · B → A". It compares two cards for the same screen and the same rubric: the Must lines' statuses, the shown
 * ranked rows' letters (Don't care rows are hidden, so they don't count), the parcel's letter and its verdict. Pure.
 */
import type { Letter } from "@/lib/rubric/types";
import { VERDICT_WORD, type Card, type GateStatus, type Verdict } from "./card";
import { GATE_MARK, mustLines, rankedRows } from "./cardLines";
import type { PanelKey } from "./cardPanels";

export type CardChange =
  | { kind: "must"; key: PanelKey; label: string; from: GateStatus; to: GateStatus }
  | { kind: "row"; key: PanelKey; label: string; from: Letter | null; to: Letter | null };

export interface CardDiff {
  /** In the card's order: the Must lines, then the ranked rows. */
  changes: CardChange[];
  grade: { from: Letter | null; to: Letter | null } | null;
  verdict: { from: Verdict; to: Verdict } | null;
}

const shownRows = (c: Card) => {
  const { should, could } = rankedRows(c);
  return [...should, ...could];
};

export function cardDiff(before: Card, after: Card): CardDiff {
  const changes: CardChange[] = [];
  const musts = new Map(mustLines(before).map((m) => [`${m.key}|${m.label}`, m]));
  for (const m of mustLines(after)) {
    const was = musts.get(`${m.key}|${m.label}`);
    if (was && was.status !== m.status)
      changes.push({ kind: "must", key: m.key, label: m.label, from: was.status, to: m.status });
  }
  const rows = new Map(shownRows(before).map((r) => [r.key, r]));
  for (const r of shownRows(after)) {
    const was = rows.get(r.key);
    if (was && was.grade !== r.grade)
      changes.push({ kind: "row", key: r.key, label: r.label, from: was.grade, to: r.grade });
  }
  return {
    changes,
    grade: before.grade !== after.grade ? { from: before.grade, to: after.grade } : null,
    verdict: before.verdict !== after.verdict ? { from: before.verdict, to: after.verdict } : null,
  };
}

/** Nothing the card shows moved. */
export const unchanged = (d: CardDiff): boolean => !d.changes.length && !d.grade && !d.verdict;

const NOW: Record<GateStatus, string> = {
  pass: "now passes",
  warn: "now needs a check",
  fail: "now fails",
  unknown: "is now unknown",
};

/** The most rows the note names; the rest are counted. */
const MAX_NAMED = 2;

/**
 * The note's words, or null when nothing moved. One Must alone, with the letter and verdict as they were, reads as a
 * sentence ("Septic now passes"); anything more is marks and letters, the rows first, then the parcel's letter, then
 * its verdict ("Driveway on your land: ! → ✓ · B → A").
 */
export function gradeNote(d: CardDiff): string | null {
  if (unchanged(d)) return null;
  const [only] = d.changes;
  if (d.changes.length === 1 && only!.kind === "must" && !d.grade && !d.verdict)
    return `${only!.label} ${NOW[only!.to]}`;
  const named = d.changes
    .slice(0, MAX_NAMED)
    .map((c) =>
      c.kind === "must"
        ? `${c.label}: ${GATE_MARK[c.from]} → ${GATE_MARK[c.to]}`
        : `${c.label}: ${c.from ?? "–"} → ${c.to ?? "–"}`,
    );
  const more = d.changes.length - MAX_NAMED;
  const parts = [...named, ...(more > 0 ? [`${more} more`] : [])];
  if (d.grade) parts.push(`${d.grade.from ?? "–"} → ${d.grade.to ?? "–"}`);
  if (d.verdict) parts.push(`${VERDICT_WORD[d.verdict.from]} → ${VERDICT_WORD[d.verdict.to]}`);
  return parts.join(" · ");
}

/** Where a tap on the note goes on Grade: the first row that changed, else the answer (the parcel's letter). */
export const noteTarget = (d: CardDiff): PanelKey | "answer" => d.changes[0]?.key ?? "answer";
