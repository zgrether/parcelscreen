/**
 * A state easement credit from an appraised value (step 15 §2.1): the rate times the value, capped where the state
 * caps one donation, and how many years a yearly use limit spreads it over. Pure; the slider calls it as it moves.
 */
import type { EasementCredit } from "../config/programs";

export interface CreditFigure {
  /** The credit earned, $. */
  credit: number;
  /** Years to use it at the yearly limit; null without a limit. */
  years: number | null;
  /** What's left after the donor's own years (this year plus the carry-forward) at the limit, $: sold or lost. */
  beyondCarry: number;
}

export function creditFor(value: number, c: EasementCredit): CreditFigure {
  const raw = (Math.max(0, value) * c.ratePct.value) / 100;
  const credit = c.maxCredit.value !== null ? Math.min(raw, c.maxCredit.value) : raw;
  const limit = c.yearlyUse.value;
  if (limit === null || limit <= 0) return { credit, years: null, beyondCarry: 0 };
  const years = Math.ceil(credit / limit);
  // The donation's year, then the carry-forward years.
  const usable = limit * (1 + c.carryYears.value);
  return { credit, years, beyondCarry: Math.max(0, credit - usable) };
}

/** The slider's top (§2.1): the asking price, or $1,000,000 without one; it starts at $0 so no figure shows unasked. */
export const SLIDER_NO_PRICE_MAX = 1_000_000;
export const SLIDER_STEP = 5_000;
export const sliderMax = (askingPrice: number | null): number =>
  askingPrice && askingPrice > 0 ? Math.ceil(askingPrice / SLIDER_STEP) * SLIDER_STEP : SLIDER_NO_PRICE_MAX;
