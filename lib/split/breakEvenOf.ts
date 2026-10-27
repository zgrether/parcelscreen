/**
 * A split scenario's break-even (step 15, docs/plans/step-15-how-it-could-pay.md §4): the inputs as typed, each one not
 * typed at its default (the asking price, the sold piece's acres share, 2 years, 7%, the midpoints of Settings → Costs'
 * survey, legal and road), and the figures from them. The sold piece is the smaller one unless you pick. Pure: the
 * scenario view and How it could pay's Split and resell row read it.
 */
import type { Rates } from "../config/costs";
import { BREAK_EVEN_DEFAULTS } from "../config/programs";
import type { BreakEvenInputs } from "../client/parcelStore";
import { breakEven, type BreakEvenFigures } from "../pay/breakEven";
import type { PieceSide } from "./scenario";

export interface BreakEvenPiece {
  side: PieceSide;
  /** "North" */
  word: string;
  acres: number;
}

/** One input: its value, and whether it's the default (labelled "assumed") or typed. */
export interface Resolved<T> {
  value: T;
  assumed: boolean;
}

export interface ResolvedBreakEven {
  sold: BreakEvenPiece;
  kept: BreakEvenPiece;
  /** Null: no price typed and no asking price; the figures wait for one. */
  price: Resolved<number> | null;
  sharePct: Resolved<number>;
  years: Resolved<number>;
  ratePct: Resolved<number>;
  survey: Resolved<number>;
  legal: Resolved<number>;
  road: Resolved<number>;
  soldAtPerAc: number | null;
  figures: BreakEvenFigures | null;
}

const mid = (r: { low: number; high: number }) => (r.low + r.high) / 2;
const typed = <T>(v: T | undefined, fallback: T): Resolved<T> =>
  v !== undefined ? { value: v, assumed: false } : { value: fallback, assumed: true };

export function resolveBreakEven(
  stored: BreakEvenInputs | undefined,
  pieces: readonly [BreakEvenPiece, BreakEvenPiece],
  askingPrice: number | null,
  rates: Rates,
): ResolvedBreakEven {
  const i = stored ?? {};
  const [a, b] = pieces;
  const smaller = a.acres <= b.acres ? a : b;
  const sold = i.soldSide ? (a.side === i.soldSide ? a : b) : smaller;
  const kept = sold === a ? b : a;
  const total = a.acres + b.acres;
  const price =
    i.price !== undefined
      ? { value: i.price, assumed: false }
      : askingPrice !== null && askingPrice > 0
        ? { value: askingPrice, assumed: true }
        : null;
  const sharePct = typed(i.sharePct, total > 0 ? (100 * sold.acres) / total : 50);
  const years = typed(i.years, BREAK_EVEN_DEFAULTS.years.value);
  const ratePct = typed(i.ratePct, BREAK_EVEN_DEFAULTS.ratePct.value);
  const survey = typed(i.survey, mid(rates["split.survey"]));
  const legal = typed(i.legal, mid(rates["split.legal"]));
  const road = typed(i.road, mid(rates["split.road"]));
  const soldAtPerAc = i.soldAtPerAc ?? null;
  const figures = price
    ? breakEven({
        price: price.value,
        share: sharePct.value / 100,
        years: years.value,
        ratePct: ratePct.value,
        costs: survey.value + legal.value + road.value,
        soldAc: sold.acres,
        keptAc: kept.acres,
        soldAtPerAc,
      })
    : null;
  return { sold, kept, price, sharePct, years, ratePct, survey, legal, road, soldAtPerAc, figures };
}
