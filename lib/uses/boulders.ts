/**
 * Boulder potential in Uses (docs/plans/boulders.md §2): the one line and its detail, from the result's `boulders`.
 * Outside the grade: no chip and no tally. Null for a grade from before the measurement (no `boulders`).
 */
import { SCREEN_CONSTANTS } from "../screen/config";
import type { ScreenResult } from "../screen/types";
import { BOULDERS } from "./words";

export interface BouldersView {
  /**
   * "Likely boulders (for bouldering): 2.6 ac; possible boulder ground: 233 ac more (bouldery soils, rough lidar
   * texture)", "Possible boulder ground (for bouldering): 0.6 ac (rough lidar texture)", or "No sign of boulder ground".
   */
  line: string;
  /** Whether either reading found anything. */
  found: boolean;
  /** The detail's lines: the likely acres, each flagged soil, the rough patches (or why there are none), the stony units. */
  lines: string[];
}

export function bouldersView(b: ScreenResult["boulders"]): BouldersView | null {
  if (!b) return null;
  const rough = b.rough && b.rough.patches.length > 0 ? b.rough : null;
  const readings = [...(b.soils.length ? [BOULDERS.soils] : []), ...(rough ? [BOULDERS.rough] : [])];
  const found = readings.length > 0 && b.acres > 0;
  const likely = b.likelyAcres;
  const lines = [
    ...(likely > 0 ? [BOULDERS.likely(likely)] : []),
    ...b.soils.map((s) => BOULDERS.soil(s.name, s.acres, s.terms)),
    b.rough === null
      ? BOULDERS.noGrid
      : rough
        ? BOULDERS.patches(
            rough.patches.length,
            rough.acres,
            rough.patches.length >= SCREEN_CONSTANTS.boulders.maxPatches,
          )
        : BOULDERS.noRough,
    ...(b.stony.length ? [BOULDERS.stony(b.stony)] : []),
  ];
  return {
    line: found ? BOULDERS.line(likely, Math.max(0, b.acres - likely), readings) : BOULDERS.none,
    found,
    lines,
  };
}
