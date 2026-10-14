/**
 * The listing's facts on the card (WF1, docs/plans/parcel-workflow.md §2): what it says when the listing's acres
 * differ from the boundary's. Listings round, take in neighbouring lots, or describe a parcel since split.
 */
import { SCREEN_CONSTANTS } from "../screen/config";

/**
 * "The listing says 52 ac; this boundary is 43.9 ac.", when the two differ by more than `card.listingAcresPct` of the
 * boundary's acres; null otherwise, or when either is unknown.
 */
/** Acres without trailing zeros: "52", "43.9". */
const ac = (n: number, d: number) => n.toLocaleString("en-US", { maximumFractionDigits: d });

export function listingAcresNote(
  listingAcres: number | null,
  boundaryAcres: number | null,
  pct: number = SCREEN_CONSTANTS.card.listingAcresPct,
): string | null {
  if (listingAcres === null || boundaryAcres === null || boundaryAcres <= 0) return null;
  if (Math.abs(listingAcres - boundaryAcres) <= (boundaryAcres * pct) / 100) return null;
  return `The listing says ${ac(listingAcres, 2)} ac; this boundary is ${ac(boundaryAcres, 1)} ac.`;
}
