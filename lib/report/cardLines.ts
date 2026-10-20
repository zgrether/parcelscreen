/**
 * The card's lines (step 7; moved here from ReportCard in step 8b, so the grade note can compare them): its Must have
 * lines (the gates the person keeps, then each limit) and its ranked rows by tier, and each Must's mark.
 */
import { fmt } from "@/lib/format";
import type { Card, GateStatus, Row } from "./card";
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
}

/** A Must's mark on the card: ✓ passes, ! to check first, ✗ fails, ? unknown. */
export const GATE_MARK: Record<GateStatus, string> = { pass: "✓", warn: "!", fail: "✗", unknown: "?" };

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
    }));
  const limits = R.musts.flatMap((must): MustLine[] => {
    if (must.threshold === undefined) return [];
    const row = card.rows.find((x) => x.key === must.factor);
    const measured = row?.short ?? row?.detail;
    return [
      {
        key: must.factor,
        label: EDITOR_TITLES[must.factor],
        status: LIMIT_STATUS[thresholdStatus(must, row?.measure)],
        detail: `${thresholdWords(must, (n) => fmt(n))}${measured ? ` · ${measured}` : ""}`,
        ...(row?.missing ? { missing: row.missing } : {}),
      },
    ];
  });
  return [...gates, ...limits];
}

/** The ranked rows by tier, in rank order (plan §1.4). */
export function rankedRows(card: Card): { should: Row[]; could: Row[] } {
  const by = (tier: "should" | "could") =>
    card.rubric.rubric.ranked
      .filter((c) => c.tier === tier)
      .flatMap((c) => card.rows.filter((x) => x.key === c.factor));
  return { should: by("should"), could: by("could") };
}
