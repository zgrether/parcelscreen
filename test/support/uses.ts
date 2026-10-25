/**
 * Land uses inputs for tests (step 14 §11): as the panel will build them (the card's facts at the default rubric's best
 * site, priced at the default rates), and synthetic ones for each use's yes / maybe / no tables.
 */
import { DEFAULT_RATES } from "@/lib/config/costs";
import { cardFacts, reportCard, type CardFacts, type Gate, type GateStatus } from "@/lib/report/card";
import { COST_ITEMS, type CostEstimate, type CostItem, type CostToEnjoy } from "@/lib/report/cost";
import { drawnOf, type Drawn, type Mark } from "@/lib/report/marks";
import { SCREEN_CONSTANTS } from "@/lib/screen/config";
import type { PartialScreenResult } from "@/lib/screen/types";
import type { UsesInput } from "@/lib/uses/types";
import { ZACH } from "./rubrics";

export function usesInput(
  result: PartialScreenResult,
  over: Partial<UsesInput> = {},
  drawn: Drawn = drawnOf([], null, { askingPrice: null, rates: DEFAULT_RATES }),
): UsesInput {
  const at = reportCard(result, ZACH, drawn).at;
  const K = { ...SCREEN_CONSTANTS.card, rows: ZACH.rubric.bands };
  return {
    result,
    facts: cardFacts(result, K, SCREEN_CONSTANTS.build, drawn, at),
    marks: drawn.marks,
    lines: [],
    listing: { deedRestrictions: "", hoa: "unknown" },
    ...over,
  };
}

/** A synthetic input: the result as given, the card's facts as given (no gates, no rows, site #1 by default). */
export const synthetic = (
  result: PartialScreenResult,
  facts: Partial<CardFacts> = {},
  over: Partial<Omit<UsesInput, "result" | "facts">> = {},
): UsesInput => ({
  result,
  facts: { gates: [], rows: [], at: 0, ...facts },
  marks: [],
  lines: [],
  listing: { deedRestrictions: "", hoa: "unknown" },
  ...over,
});

export const gateOf = (key: Gate["key"], status: GateStatus, reason: string): Gate => ({
  key,
  label: key,
  status,
  reason,
});

const range = (n: number) => ({ low: n, high: n });
const costItem = (label: string, qty: number): CostItem => ({
  label,
  parts: [{ qty: range(qty), unit: "ft", rate: "track.pioneer", range: range(10), total: range(qty * 10) }],
  total: range(qty * 10),
  notes: [],
  lower: null,
});

/** A Ready to camp of $10k, its pioneer track `trackFt` long, with a legal way in to buy when `easement`. */
export function pricedCamp(trackFt: number, easement = false): CostToEnjoy {
  const camp: CostEstimate = {
    items: [
      ...(easement ? [costItem(COST_ITEMS.easement, 1)] : []),
      ...(trackFt > 0
        ? [costItem(COST_ITEMS.track, trackFt)]
        : [{ ...costItem(COST_ITEMS.track, 0), parts: [] }]),
    ],
    total: { low: 10_000, high: 10_000 },
    land: null,
  };
  const choices = { septic: null, septicPermit: false, existing: null, steepFt: 0, abovePct: 12 };
  return { kind: "priced", camp, build: camp, site: "site #1", choices };
}

export const point = (kind: Extract<Mark, { shape: "point" }>["kind"], ll: [number, number]): Mark => ({
  id: kind,
  shape: "point",
  kind,
  ll,
});
