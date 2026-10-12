/**
 * What the card derives from a stored result (value-ranking.md §5.1–5.3; VR3b): the foundation type at the build
 * site, the dig cost of a basement in rock, and each soil's septic class. Nothing here is stored; the numbers are
 * proposals in `SCREEN_CONSTANTS`, calibrated in follow-up 47. Stage 3 (VR4) prices them.
 */
import { SCREEN_CONSTANTS } from "../screen/config";
import { soilAt, type SoilUnit } from "../screen/soils";
import type { PartialScreenResult, SoilRow, UserConfig } from "../screen/types";
import type { LatLon } from "../screen/util";

type Result = PartialScreenResult;

const B = SCREEN_CONSTANTS.bands;
const CM_PER_FT = 30.48;

/** The result's map units as soilAt reads them. */
export function unitsOf(r: Result): SoilUnit[] | null {
  return r.soilUnits
    ? r.soilUnits.map((u) => ({
        mukey: u.mukey,
        muname: u.muname,
        acres: u.acres,
        color: u.color,
        geos: u.geometries,
      }))
    : null;
}

/** The dominant soil under a point, or null. */
export const soilUnder = (r: Result, ll: LatLon): SoilRow | null => soilAt(unitsOf(r), r.soils ?? null, ll);

const num = (v: string | null | undefined): number | null =>
  v == null || v === "" || !Number.isFinite(+v) ? null : +v;

// ---------- §5.3 septic class ----------

export type SepticClass = "Conventional" | "Modified" | "Alternative";

/**
 * A soil's septic class from its NRCS rating and its limiting features (§5.3): not or somewhat limited is
 * conventional (somewhat limited may want a larger field); very limited is alternative when a water table, bedrock
 * or flooding is the reason (within `septicClass.shallowCm`), otherwise modified (slow percolation or slope: a
 * low-pressure or shallow system). Null when NRCS gives no rating.
 */
export function septicClass(x: SoilRow): SepticClass | null {
  const rating = (x.septic || x.engstafdcd || "").toLowerCase();
  if (!rating) return null;
  if (/not limited|somewhat/.test(rating)) return "Conventional";
  if (!/very limited/.test(rating)) return null;
  const shallow = SCREEN_CONSTANTS.septicClass.shallowCm;
  const water = num(x.wtdepannmin),
    rock = num(x.brockdepmin);
  const floods = !!x.flodfreqdcd && !/^none$/i.test(x.flodfreqdcd);
  return (water !== null && water < shallow) || (rock !== null && rock < shallow) || floods
    ? "Alternative"
    : "Modified";
}

// ---------- §5.1 foundation type ----------

export const FOUNDATIONS = [
  "Slab or crawl space",
  "Walkout or garage-under",
  "Cut-and-fill and retaining walls",
  "Engineered piers",
] as const;
export type Foundation = (typeof FOUNDATIONS)[number];

/**
 * The foundation at a build site (§5.1): by slope (the Slope as foundation bands), one step toward piers on bedrock
 * shallower than `foundationType.shallowRockCm`, and "engineered design" where NRCS rates the soil very limited for
 * dwellings without basements.
 */
export function foundationAt(
  slopeDeg: number,
  soil: SoilRow | null,
): { type: Foundation; engineered: boolean; shallowRock: boolean } {
  const bySlope = B.slopeDeg.filter((e) => slopeDeg >= e).length;
  const rock = num(soil?.brockdepmin);
  const shallowRock = rock !== null && rock < SCREEN_CONSTANTS.foundationType.shallowRockCm;
  const step = Math.min(FOUNDATIONS.length - 1, bySlope + (shallowRock ? 1 : 0));
  return {
    type: FOUNDATIONS[step]!,
    engineered: /very limited/i.test(soil?.engdwobdcd ?? ""),
    shallowRock,
  };
}

// ---------- §5.2 dig cost in rock ----------

export interface DigCost {
  /** The basement's excavation, cubic yards. */
  yd3: number;
  /** All of it priced as soil. */
  allSoil: number;
  /** Split at the bedrock depth: soil above, rock below. Equal to allSoil when the rock is deeper or unknown. */
  withRock: number;
  /** Bedrock depth under the site, cm; null when NRCS doesn't say. */
  rockCm: number | null;
}

/** A basement for the Settings footprint, dug at today's Settings rates (§5.2; the owner's 77-29C example). */
export function digCost(soil: SoilRow | null, dw: UserConfig["dw"]): DigCost {
  const { footprintSqFt, depthFt } = SCREEN_CONSTANTS.basement;
  const yd3 = (footprintSqFt * depthFt) / 27;
  const rockCm = num(soil?.brockdepmin);
  const soilFt = rockCm === null ? depthFt : Math.min(depthFt, rockCm / CM_PER_FT);
  const soilYd3 = (footprintSqFt * soilFt) / 27;
  return {
    yd3,
    allSoil: yd3 * dw.earthSoilPerYd,
    withRock: soilYd3 * dw.earthSoilPerYd + (yd3 - soilYd3) * dw.earthRockPerYd,
    rockCm,
  };
}
