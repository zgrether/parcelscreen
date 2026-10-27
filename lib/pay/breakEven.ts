/**
 * Split and resell's break-even (step 15, docs/plans/step-15-how-it-could-pay.md §4): what the piece sold must fetch so
 * that it pays its share of the price carried at interest for the years held, plus the split's own costs; and what the
 * piece kept then effectively cost you. Not counted: the agent's commission, closing costs, property tax while held and
 * capital-gains tax (said under the figures). Pure.
 */

export interface BreakEvenInput {
  /** The purchase price of the whole, $. */
  price: number;
  /** The sold piece's share of the land's value, 0–1 (its acres' share unless you change it). */
  share: number;
  years: number;
  /** Interest a year, percent. */
  ratePct: number;
  /** Survey, legal and road, $. */
  costs: number;
  soldAc: number;
  keptAc: number;
  /** "If it sold for", $/ac; null: at the break-even. */
  soldAtPerAc: number | null;
}

export interface BreakEvenFigures {
  /** The price carried at interest for the years held. */
  carried: number;
  /** The sold piece's break-even, $ and $/ac. */
  breakEven: number;
  breakEvenPerAc: number;
  /** What the sale brings: the break-even, or "if it sold for" × its acres. */
  sale: number;
  /** The kept piece's effective price, $ and $/ac: carried + costs − the sale. */
  keep: number;
  keepPerAc: number;
}

export function breakEven(i: BreakEvenInput): BreakEvenFigures {
  const carried = i.price * Math.pow(1 + i.ratePct / 100, Math.max(0, i.years));
  const breakEven = i.share * carried + i.costs;
  const sale = i.soldAtPerAc !== null ? i.soldAtPerAc * i.soldAc : breakEven;
  const keep = carried + i.costs - sale;
  return {
    carried,
    breakEven,
    breakEvenPerAc: i.soldAc > 0 ? breakEven / i.soldAc : NaN,
    sale,
    keep,
    keepPerAc: i.keptAc > 0 ? keep / i.keptAc : NaN,
  };
}
