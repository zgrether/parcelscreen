/**
 * Divide (step 14, docs/plans/step-14-land-uses.md §3.3): how many lots the county's standard rules allow, from the
 * parcel's acres and its public-road frontage, with the binding limit named. Exceptions (family divisions, private
 * roads, large lots) are listed with their rule, never added to the count. Pure: display time, no requests.
 */
import { minLotFor, type CountyRules } from "../config/counties";

export interface DivideInput {
  acres: number;
  /** Feet of public-road frontage (result.frontage.publicFt); null when the screen didn't measure it. */
  publicFrontageFt: number | null;
  /** The parcel's typical slope in percent; Mitchell's minimum lot depends on it. */
  slopePct: number | null;
  /** The county's rules; null outside the ten counties. */
  county: CountyRules | null;
  /** The zoning district the county's map gave at the parcel, when it has a map and gave one. */
  district: string | null;
}

export type DivideResult =
  | { kind: "notCovered" }
  /** The county's minimum lot size isn't in anything we could read. */
  | { kind: "unknown"; county: CountyRules }
  | {
      kind: "lots";
      county: CountyRules;
      /** At least 1: the parcel as it is. */
      lots: number;
      /** What limits the count: the acres at the minimum lot size, the frontage at its length per lot, or both. */
      binding: "size" | "frontage" | "both";
      acres: number;
      minLotAc: number;
      byAcres: number;
      /** The lots the frontage allows; null when the county has no frontage rule or the screen has no frontage. */
      byFrontage: number | null;
      frontagePerLotFt: number | null;
      publicFrontageFt: number | null;
      /** County zoning, but the district wasn't read from a map: the rural default is assumed. */
      assumedDefault: boolean;
    };

export function divide(input: DivideInput): DivideResult {
  const county = input.county;
  if (!county) return { kind: "notCovered" };
  const minLotAc = minLotFor(county, input.slopePct);
  if (minLotAc === null || minLotAc <= 0) return { kind: "unknown", county };
  const byAcres = Math.floor(input.acres / minLotAc + 1e-9);
  const per = county.frontageFt.value;
  const byFrontage =
    per !== null && per > 0 && input.publicFrontageFt !== null
      ? Math.floor(input.publicFrontageFt / per + 1e-9)
      : null;
  const raw = byFrontage === null ? byAcres : Math.min(byAcres, byFrontage);
  const lots = Math.max(1, raw);
  const binding =
    byFrontage === null
      ? "size"
      : byAcres === byFrontage
        ? "both"
        : byFrontage < byAcres
          ? "frontage"
          : "size";
  return {
    kind: "lots",
    county,
    lots,
    binding,
    acres: input.acres,
    minLotAc,
    byAcres,
    byFrontage,
    frontagePerLotFt: per,
    publicFrontageFt: input.publicFrontageFt,
    assumedDefault: county.zoning.value && input.district === null,
  };
}

const ac = (v: number) => (v >= 10 ? Math.round(v) : Math.round(v * 100) / 100).toLocaleString("en-US");
const ft = (v: number) => Math.round(v).toLocaleString("en-US");

/**
 * The answer in one line, as the panel and One page say it: "Up to 3 lots: limited by 600 ft of road frontage at 200 ft
 * per lot", "1 lot: limited by 1.4 ac at a 2 ac minimum", "Not covered here yet".
 */
export function divideHeadline(r: DivideResult): string {
  if (r.kind === "notCovered") return "Not covered here yet";
  if (r.kind === "unknown") return `${r.county.name} County's minimum lot size isn't online: ask the county`;
  const n = r.lots === 1 ? "1 lot" : `Up to ${r.lots} lots`;
  const size = `${ac(r.acres)} ac at a ${ac(r.minLotAc)} ac minimum`;
  const frontage =
    r.publicFrontageFt !== null && r.frontagePerLotFt !== null
      ? `${ft(r.publicFrontageFt)} ft of road frontage at ${ft(r.frontagePerLotFt)} ft per lot`
      : null;
  if (r.binding === "frontage" && frontage) return `${n}: limited by ${frontage}`;
  if (r.binding === "both" && frontage) return `${n}: limited by ${size} and ${frontage}`;
  return `${n}: limited by ${size}`;
}
