/** What more than one option reads (step 15 §2): the state, the forest acres, public land near. Pure. */
import { countyByFips, type CountyRules, type StateCode } from "../config/counties";
import type { Sourced } from "../config/programs";
import type { PartialScreenResult } from "../screen/types";
import type { Fact } from "../uses/types";
import { PAY_WORDS } from "./words";

export const isState = (s: string): s is StateCode => s === "VA" || s === "NC" || s === "TN";

export interface Where {
  state: StateCode | null;
  /** One of the ten counties; null outside them. */
  county: CountyRules | null;
  /** "Grayson County, VA", for a reason. */
  label: string;
}

/** The parcel's state and county; null before the county was measured. */
export function whereOf(r: PartialScreenResult): Where | null {
  if (!r.county) return null;
  return {
    state: isState(r.county.state) ? r.county.state : null,
    county: countyByFips(r.county.fips),
    label: `${r.county.name} County, ${r.county.state}`,
  };
}

/** Acres of forest: the parcel's acres × NLCD's forest share; null when the cover didn't load. */
export const forestAcOf = (r: PartialScreenResult): number | null =>
  r.cover ? (r.acres * r.cover.forestPct) / 100 : null;

const FT_PER_MI = 5280;

/**
 * The nearest open public land or the Blue Ridge Parkway within `mi`: its name and how far ("next door" when it
 * adjoins); undefined when PAD-US didn't load, null when there's none that near.
 */
export function publicNear(
  r: PartialScreenResult,
  mi: number,
): { name: string; adjoins: boolean; mi: number } | null | undefined {
  if (!r.protected) return undefined;
  const near = r.protected
    .filter((p) => p.access === "OA" || /blue ridge parkway/i.test(p.name ?? ""))
    .map((p) => ({
      name: p.name ?? "unnamed public land",
      adjoins: p.adjoins,
      mi: (p.distFt ?? Infinity) / FT_PER_MI,
    }))
    .filter((p) => p.adjoins || p.mi <= mi)
    .sort((a, b) => Number(b.adjoins) - Number(a.adjoins) || a.mi - b.mi);
  return near[0] ?? null;
}

/** A config fact as a signal or a detail line: its words, its source and date, "(to confirm)" where it is. */
export const factOf = (label: string, f: Sourced<unknown>): Fact => ({
  label,
  value: f.confidence === "to confirm" ? `${f.says} (${PAY_WORDS.toConfirm})` : f.says,
  source: f.source,
  date: f.asOf,
});
