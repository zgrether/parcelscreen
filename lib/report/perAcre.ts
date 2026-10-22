/**
 * Price per acre (step 10b plan §3): the asking price over the listing's acres when the listing gives them, else over
 * the boundary's, to $10. When the two acreages differ by more than `card.perAcreDiffPct` of the boundary's, the figure
 * is marked and both readings are given, as the listing note does at its own 10% (lib/report/listing.ts).
 */
import { SCREEN_CONSTANTS } from "../screen/config";

export interface PerAcre {
  /** Dollars per acre, to $10. */
  value: number;
  /** "$6,310/ac" */
  text: string;
  /** Which acres it's over. */
  on: "listed" | "boundary";
  /** The two acreages differ by more than the cutoff: the figure is marked, with both readings in `both`. */
  differs: boolean;
  /** "$6,500/ac on 45.6 listed ac; $7,640/ac on 38.8 boundary ac", when they differ. */
  both: string | null;
}

const round10 = (n: number): number => Math.round(n / 10) * 10;
/** "$6,310/ac" */
export const perAcreText = (dollarsPerAcre: number): string =>
  `$${round10(dollarsPerAcre).toLocaleString("en-US")}/ac`;
const acres = (n: number): string => n.toLocaleString("en-US", { maximumFractionDigits: 1 });

export function perAcre(
  price: number | null,
  listedAcres: number | null,
  boundaryAcres: number | null,
  pct: number = SCREEN_CONSTANTS.card.perAcreDiffPct,
): PerAcre | null {
  if (price === null) return null;
  const listed = listedAcres !== null && listedAcres > 0 ? listedAcres : null;
  const boundary = boundaryAcres !== null && boundaryAcres > 0 ? boundaryAcres : null;
  const over = listed ?? boundary;
  if (over === null) return null;
  const differs =
    listed !== null && boundary !== null && Math.abs(listed - boundary) > (boundary * pct) / 100;
  return {
    value: round10(price / over),
    text: perAcreText(price / over),
    on: listed !== null ? "listed" : "boundary",
    differs,
    both: differs
      ? `${perAcreText(price / listed!)} on ${acres(listed!)} listed ac; ${perAcreText(price / boundary!)} on ${acres(boundary!)} boundary ac`
      : null,
  };
}
