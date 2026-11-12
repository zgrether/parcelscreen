/**
 * A parcel's acres, named as the report names them (perAcre.ts: "on 93.97 surveyed ac", "on 38.8 boundary ac"): a
 * recorded survey's when the listing fact is set (J-5), else the boundary's, which is the county GIS's line. For the phone
 * sheet's line (map-room plan, Zach's #427 answer 4: labelled as the report labels them).
 */
import { fmt } from "../format";

export function acresLabel(surveyed: number | null | undefined, boundary: number | null): string | null {
  // A survey's figure as recorded, to the hundredth it's usually given in (010-A-10's: 93.97).
  if (surveyed != null && surveyed > 0)
    return `${surveyed.toLocaleString("en-US", { maximumFractionDigits: 2 })} surveyed ac`;
  return boundary !== null ? `${fmt(boundary, 2)} boundary ac` : null;
}
