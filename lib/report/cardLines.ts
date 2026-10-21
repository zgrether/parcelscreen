/**
 * The card's lines (step 7; moved here from ReportCard in step 8b, so the grade note can compare them): its Must have
 * lines (the gates the person keeps, then each limit) and its ranked rows by tier, and each Must's mark.
 */
import { fmt } from "@/lib/format";
import { lowerFirst, type Card, type GateStatus, type Letter, type Row } from "./card";
import type { PanelKey } from "./cardPanels";
import { thresholdStatus, thresholdWords, type MustStatus } from "@/lib/rubric/musts";
import { EDITOR_TITLES } from "@/lib/rubric/words";

/** One Must on the card: a gate the person keeps, or a limit on a row with its measure. */
export interface MustLine {
  key: PanelKey;
  label: string;
  status: GateStatus;
  detail: string;
  /** The data that didn't load, when that's why it's unknown. */
  missing?: string;
  /** The detail's first clause when more follows (Gate.first): the rest goes on its own line. */
  first?: string;
  /**
   * Step 10b (owner, 10/21): a limit whose factor is also ranked shows once, here, with the row's letter beside the
   * mark ("✓ B · 2,855 ft, at least 1,800 ft"); null when the row isn't graded. Absent for a gate or an unranked limit.
   */
  grade?: Letter | null;
}

/** A Must's mark on the card: ✓ passes, ! to check first, ✗ fails, ? unknown. */
export const GATE_MARK: Record<GateStatus, string> = { pass: "✓", warn: "!", fail: "✗", unknown: "?" };

/** A Must's status in words (step 7 plan §1.4): a warning is something to check first. */
export const MUST_STATUS_WORD: Record<GateStatus, string> = {
  pass: "Pass",
  warn: "Check first",
  fail: "Fail",
  unknown: "Unknown",
};

/** A Must line's detail as the card says it: "Check first: …" unless it passes (the print page's one line). */
export const mustText = (m: MustLine): string =>
  m.status === "pass" ? m.detail : `${MUST_STATUS_WORD[m.status]}: ${lowerFirst(m.detail)}`;

const LIMIT_STATUS: Record<MustStatus, GateStatus> = { pass: "pass", fail: "fail", unknown: "unknown" };

/** The card's Must have lines: the gates the person keeps, then each limit, in the rubric's order. */
export function mustLines(card: Card): MustLine[] {
  const R = card.rubric.rubric;
  const gates = card.gates
    .filter((g) => R.musts.some((m) => m.factor === g.key && m.threshold === undefined))
    .map((g): MustLine => ({
      key: g.key,
      // The priorities page's own words for each factor (owner, #216): "Driveway on your land", not "Easement needed".
      label: EDITOR_TITLES[g.key],
      status: g.status,
      detail: g.reason,
      ...(g.missing ? { missing: g.missing } : {}),
      ...(g.first ? { first: g.first } : {}),
    }));
  const limits = R.musts.flatMap((must): MustLine[] => {
    if (must.threshold === undefined) return [];
    const row = card.rows.find((x) => x.key === must.factor);
    const measured = row?.short ?? row?.detail;
    const limit = thresholdWords(must, (n) => fmt(n));
    // Ranked too (step 10b): one line, the value first, then the limit, with the row's letter.
    const ranked = !!row && R.ranked.some((c) => c.factor === must.factor);
    return [
      {
        key: must.factor,
        label: EDITOR_TITLES[must.factor],
        status: LIMIT_STATUS[thresholdStatus(must, row?.measure)],
        detail: ranked
          ? `${measured ? `${measured}, ` : ""}${limit}`
          : `${limit}${measured ? ` · ${measured}` : ""}`,
        ...(row?.missing ? { missing: row.missing } : {}),
        ...(ranked ? { grade: row.grade } : {}),
      },
    ];
  });
  // Within budget held as a Must (step 10): after the gates, its reason the budgets at its status.
  const budget: MustLine[] = card.budgetMust
    ? [
        {
          key: "budget",
          label: EDITOR_TITLES.budget,
          status: card.budgetMust.status,
          detail: card.budgetMust.reason,
        },
      ]
    : [];
  return [...gates, ...budget, ...limits];
}

/**
 * The ranked rows the card draws by tier (step 10b): a factor with a limit is drawn once, on its Must line with its
 * letter, so its tier skips it. Its weight and letter still count where the rubric ranks it (`rankedRows`).
 */
export function shownRankedRows(card: Card): { should: Row[]; could: Row[] } {
  const R = card.rubric.rubric;
  const limited = new Set(R.musts.filter((m) => m.threshold !== undefined).map((m) => m.factor));
  const { should, could } = rankedRows(card);
  return {
    should: should.filter((x) => !limited.has(x.key)),
    could: could.filter((x) => !limited.has(x.key)),
  };
}

/** The ranked rows by tier, in rank order (plan §1.4). */
export function rankedRows(card: Card): { should: Row[]; could: Row[] } {
  const by = (tier: "should" | "could") =>
    card.rubric.rubric.ranked
      .filter((c) => c.tier === tier)
      .flatMap((c) => card.rows.filter((x) => x.key === c.factor));
  return { should: by("should"), could: by("could") };
}
