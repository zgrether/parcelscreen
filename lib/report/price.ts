/**
 * The price block (UX part 2 PR 8b; the audit's Z-4, P-11), in Grade's Cost section: the asking price and $/ac, Ready to
 * camp and Ready to build without the land, the cost's optional items as toggles that re-price them, and the walk-away
 * price: what the land can cost for Ready to build to stay within the budget. Pure: the toggles re-run costToEnjoy with
 * one input changed. They change the block's figures only; Within budget grades the default (plan §9, Q2).
 */
import { shortPrice } from "../client/askingPrice";
import { DEFAULT_PAVING, type Range } from "../config/costs";
import type { Budgets } from "../rubric/types";
import {
  costRange,
  costToEnjoy,
  roundCost,
  type CostChoices,
  type CostEstimate,
  type CostInput,
} from "./cost";
import type { PerAcre } from "./perAcre";

/** The cost's optional items (plan §9, Q3): the ones that exist today, no new cost item. */
export type PriceToggleKey = "paving" | "septic" | "existing";

export interface PriceToggle {
  key: PriceToggleKey;
  /** "Pave the steep stretches" */
  label: string;
  /** "420 ft over 12%" */
  detail: string;
  /** Whether the cost as priced (the card's, the default) has it. */
  byDefault: boolean;
  /** What it adds to Ready to build when it's on, against off: "+$12–20k", "−$8–14k". */
  change: string;
}

export interface WalkAway {
  /** "Pay at most $105–170k" */
  line: string;
  /** "to stay within your $300k budget." */
  within: string;
  /** "The asking price is over it by $15–80k.", or null without an asking price. */
  asking: string | null;
}

export interface PriceBlock {
  /** "$185,000", or null when no asking price is entered. */
  asking: string | null;
  perAcre: PerAcre | null;
  /** "$18–66k plus the land": the land left out, so the walk-away can be read against it. */
  camp: string;
  build: string;
  toggles: PriceToggle[];
  /** Null with no Ready to build budget. */
  walkAway: WalkAway | null;
}

export const PRICE_WORDS = {
  title: "Price and cost",
  asking: "Asking",
  plusLand: "plus the land",
  walkAway: "Walk-away price for the land",
  togglesNote:
    "The switches change only this block. Your Within budget grade uses the costs as priced above.",
  noAsking: "No asking price entered.",
} as const;

/** Each toggle's words (the existing drive's by its condition: a paved one is used, not upgraded). */
const TOGGLE_WORDS = {
  paving: (c: CostChoices) => ({
    label: "Pave the steep stretches",
    detail: `${Math.round(c.steepFt).toLocaleString("en-US")} ft over ${c.abovePct}%`,
  }),
  septic: () => ({ label: "An alternative septic system", detail: "if the perc test fails" }),
  existing: (c: CostChoices) => ({
    label: c.existing?.condition === "paved" ? "Use the existing drive" : "Upgrade the existing drive",
    detail: "instead of a new one",
  }),
} as const;

/** The cost input with one toggle set either way. */
function withToggle(input: CostInput, key: PriceToggleKey, on: boolean): CostInput {
  switch (key) {
    case "paving":
      return { ...input, paving: { ...(input.paving ?? DEFAULT_PAVING), on } };
    case "septic": {
      // Off is the site's own class: no override, whatever an earlier choice set.
      const { septic: _septic, ...own } = input;
      return on ? { ...own, septic: "alternative" } : own;
    }
    case "existing":
      return { ...input, existingAsNew: !on };
  }
}

/** The toggles that apply to this parcel, and whether the default has each. */
function togglesOf(input: CostInput, c: CostChoices): { key: PriceToggleKey; byDefault: boolean }[] {
  const out: { key: PriceToggleKey; byDefault: boolean }[] = [];
  if (c.steepFt >= 1) out.push({ key: "paving", byDefault: (input.paving ?? DEFAULT_PAVING).on });
  // An alternative system only stands in for a known lighter one; a permit's class is settled (a perc test passed).
  if (c.septic !== null && c.septic !== "alternative" && !c.septicPermit)
    out.push({ key: "septic", byDefault: false });
  if (c.existing) out.push({ key: "existing", byDefault: true });
  return out;
}

/** Ready to build's items summed, unrounded: the toggles' differences are taken before rounding. */
const rawBuild = (input: CostInput): Range | null => {
  const c = costToEnjoy({ ...input, askingPrice: null });
  if (c?.kind !== "priced") return null;
  return c.build.items.reduce((t, i) => ({ low: t.low + i.total.low, high: t.high + i.total.high }), {
    low: 0,
    high: 0,
  });
};

/** "+$12–20k", "−$8–14k", "+$0k": a change, smaller end first. */
export function changeText(d: Range): string {
  const a = Math.abs(d.low),
    b = Math.abs(d.high);
  const sign = d.low + d.high < 0 ? "−" : "+";
  return `${sign}${costRange({ low: Math.min(a, b), high: Math.max(a, b) })}`;
}

/** The walk-away price: the build budget less Ready to build without the land, and the asking price against it. */
export function walkAway(build: Range, budget: number, asking: number | null): WalkAway {
  const most = {
    low: roundCost(Math.max(0, budget - build.high)),
    high: roundCost(Math.max(0, budget - build.low)),
  };
  // No land fits the build's high end: the most it can cost is the low end's, and only then.
  const lowOnly = most.low <= 0;
  const within = `to stay within your ${shortPrice(budget)} budget${lowOnly ? ", and only if the build comes in at its low end" : ""}.`;
  if (most.high <= 0)
    return {
      line: "No land price stays within it",
      within: `Ready to build costs more than your ${shortPrice(budget)} budget without the land.`,
      asking: null,
    };
  let words: string | null = null;
  if (asking !== null) {
    if (asking > most.high)
      words = `The asking price is over it by ${costRange({ low: asking - most.high, high: asking - most.low })}.`;
    else if (asking <= most.low)
      words = `The asking price is under it by ${costRange({ low: most.low - asking, high: most.high - asking })}.`;
    else words = "The asking price is inside that range: within budget only if the build comes in low.";
  }
  const line = `Pay at most ${costRange(lowOnly ? { low: most.high, high: most.high } : most)}`;
  return { line, within, asking: words };
}

const estimateText = (e: CostEstimate): string => `${costRange(e.total)} ${PRICE_WORDS.plusLand}`;

/**
 * The block for a priced cost, with the toggles as `chosen` sets them (a toggle not in it keeps its default). Null
 * when the cost isn't priced (no route yet, or no practical drive).
 */
export function priceBlock(
  input: CostInput,
  budgets: Budgets | undefined,
  perAcre: PerAcre | null,
  chosen: Partial<Record<PriceToggleKey, boolean>> = {},
): PriceBlock | null {
  const base = costToEnjoy({ ...input, askingPrice: null });
  if (base?.kind !== "priced") return null;
  const toggles = togglesOf(input, base.choices);
  let priced = input;
  for (const t of toggles) priced = withToggle(priced, t.key, chosen[t.key] ?? t.byDefault);
  const now = costToEnjoy({ ...priced, askingPrice: null });
  if (now?.kind !== "priced") return null;

  const shown = toggles.flatMap((t): PriceToggle[] => {
    const on = rawBuild(withToggle(priced, t.key, true)),
      off = rawBuild(withToggle(priced, t.key, false));
    if (!on || !off || (on.low === off.low && on.high === off.high)) return [];
    return [
      {
        key: t.key,
        ...TOGGLE_WORDS[t.key](base.choices),
        byDefault: t.byDefault,
        change: changeText({ low: on.low - off.low, high: on.high - off.high }),
      },
    ];
  });
  const budget = budgets?.build ?? null;
  return {
    asking: input.askingPrice === null ? null : `$${input.askingPrice.toLocaleString("en-US")}`,
    perAcre,
    camp: estimateText(now.camp),
    build: estimateText(now.build),
    toggles: shown,
    walkAway: budget === null ? null : walkAway(now.build.total, budget, input.askingPrice),
  };
}
