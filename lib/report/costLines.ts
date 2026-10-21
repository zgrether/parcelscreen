/**
 * The cost to enjoy in the card's words (step 10 plan §4, §8): the Grade section's two lines ("Ready to camp:
 * $200–240k ✓ under your $250k"), and the breakdown's rows (each item with its quantity, rate range, source and what
 * would lower it). Pure: the panel, Favorites, Compare and the report export read the same lines.
 */
import { fmt } from "../format";
import { shortPrice } from "../client/askingPrice";
import { rateOf, type Range } from "../config/costs";
import type { Budgets } from "../rubric/types";
import { GATE_MARK } from "./cardLines";
import {
  BUDGET_SITS,
  budgetStatusOf,
  COST_WORDS,
  costRange,
  type BudgetStatus,
  type CostEstimate,
  type CostItem,
  type CostPart,
  type CostToEnjoy,
} from "./cost";

export type CostWhich = "camp" | "build";

/** One of the Grade section's two lines. */
export interface CostSummaryLine {
  which: CostWhich;
  /** "Ready to camp" */
  label: string;
  /** "$200–240k", or "$6–21k plus the land" without an asking price. */
  range: string;
  /** Against the budget, when there's one and an asking price: its status, mark and words ("under your $250k"). */
  budget: { status: BudgetStatus; mark: string; words: string } | null;
}

/** The line as one string: "Ready to camp: $200–240k ✓ under your $250k". */
export const summaryText = (l: CostSummaryLine): string =>
  `${l.label}: ${l.range}${l.budget ? ` ${l.budget.mark} ${l.budget.words}` : ""}`;

/** "$200–240k", or "$6–21k plus the land". */
export const estimateRange = (e: CostEstimate): string =>
  `${costRange(e.total)}${e.land === null ? ` ${COST_WORDS.plusLand}` : ""}`;

/** The two lines; `noWay` with its sentence; null before the cost can be priced. */
export function costSummary(
  cost: CostToEnjoy | null | undefined,
  budgets?: Budgets,
): { kind: "lines"; lines: CostSummaryLine[] } | { kind: "noWay"; text: string } | null {
  if (!cost) return null;
  if (cost.kind === "noWay") return { kind: "noWay", text: COST_WORDS.noWay };
  const line = (which: CostWhich): CostSummaryLine => {
    const e = cost[which];
    const b = budgets?.[which] ?? null;
    const status = b === null || e.land === null ? null : budgetStatusOf(e.total, b);
    return {
      which,
      label: which === "camp" ? COST_WORDS.camp : COST_WORDS.build,
      range: estimateRange(e),
      budget:
        status && status !== "unknown"
          ? { status, mark: GATE_MARK[status], words: `${BUDGET_SITS[status]} your ${shortPrice(b!)}` }
          : null,
    };
  };
  return { kind: "lines", lines: [line("camp"), line("build")] };
}

/** "Ready to camp, all in" / "Ready to build, all in: everything but the house". */
export const estimateTitle = (which: CostWhich): string =>
  which === "camp"
    ? `${COST_WORDS.camp}, ${COST_WORDS.allIn}`
    : `${COST_WORDS.build}, ${COST_WORDS.allIn}: ${COST_WORDS.butHouse}`;

/** To the dollar: a rate. */
const money = (n: number): string => `$${fmt(Math.round(n))}`;
const moneyRange = (r: Range): string =>
  r.low === r.high ? money(r.high) : `${money(r.low)}–${fmt(Math.round(r.high))}`;
/** To the $100: an item's total, a range of estimates (the fresh-eyes review: no false precision). */
const hundreds = (n: number): number => Math.round(n / 100) * 100;
const itemRange = (r: Range): string => moneyRange({ low: hundreds(r.low), high: hundreds(r.high) });
const qtyText = (p: CostPart): string => {
  const q =
    p.qty.low === p.qty.high ? fmt(p.qty.low, p.qty.low < 1 ? 1 : 0) : `${fmt(p.qty.low)}–${fmt(p.qty.high)}`;
  return `${q} ${p.unit}`;
};

/** One rate's line in the breakdown: "2,888 ft × $5–18/ft (Pioneer track (cleared, graded, 4x4))", the rate by its Settings name. */
export const partText = (p: CostPart): string => {
  const rate = rateOf(p.rate);
  const per = rate.unit.startsWith("$/") ? rate.unit.slice(1) : "";
  return `${qtyText(p)} × ${moneyRange(p.range)}${per}: ${rate.label}`;
};

/** A rate's sources as the breakdown cites them: "gradinglands.com, driveway costs (2026)". */
export const sourceText = (p: CostPart): string =>
  rateOf(p.rate)
    .sources.map((s) => `${s.name}, ${s.date}`)
    .join("; ");

/** One item of the breakdown, in words. */
export interface BreakdownRow {
  label: string;
  /** "$14,438–51,977", or "$0" when what you have covers it. */
  total: string;
  parts: { text: string; source: string; url: string }[];
  notes: string[];
  lower: string | null;
}

const itemRows = (items: readonly CostItem[]): BreakdownRow[] =>
  items.map((i) => ({
    label: i.label,
    total: itemRange(i.total),
    parts: i.parts.map((p) => ({
      text: partText(p),
      source: sourceText(p),
      url: rateOf(p.rate).sources[0]!.url,
    })),
    notes: i.notes,
    lower: i.lower,
  }));

/** Ready to build's first row: the camp's items, which it includes, in one line. */
export const CAMP_ITEMS = "Everything in Ready to camp";

/**
 * An estimate's rows in the breakdown. Ready to build starts with the camp's items as one row ("Everything in Ready to
 * camp"), then what it adds, so the camp's items aren't listed twice.
 */
export function breakdownRows(
  cost: Extract<CostToEnjoy, { kind: "priced" }>,
  which: CostWhich,
): BreakdownRow[] {
  if (which === "camp") return itemRows(cost.camp.items);
  const n = cost.camp.items.length;
  return [
    { label: CAMP_ITEMS, total: estimateRange(cost.camp), parts: [], notes: [], lower: null },
    ...itemRows(cost.build.items.slice(n)),
  ];
}
