/**
 * Boulder potential in Uses (docs/plans/boulders.md §2): the one line and its detail, from the result's `boulders`.
 * Outside the grade: no chip and no tally. Null for a grade from before the measurement (no `boulders`).
 */
import { SCREEN_CONSTANTS } from "../screen/config";
import type { ScreenResult } from "../screen/types";
import { BOULDERS } from "./words";

export interface BouldersView {
  /** "Possible boulder ground: 3.2 ac (bouldery soils, rough lidar texture)", or "No sign of boulder ground". */
  line: string;
  /** Whether either reading found anything (the detail opens only then). */
  found: boolean;
  /** The detail's lines: each flagged soil, then the rough patches (or why there are none). */
  lines: string[];
}

export function bouldersView(b: ScreenResult["boulders"]): BouldersView | null {
  if (!b) return null;
  const rough = b.rough && b.rough.patches.length > 0 ? b.rough : null;
  const readings = [...(b.soils.length ? [BOULDERS.soils] : []), ...(rough ? [BOULDERS.rough] : [])];
  const found = readings.length > 0 && b.acres > 0;
  const lines = [
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
  ];
  return { line: found ? BOULDERS.line(b.acres, readings) : BOULDERS.none, found, lines };
}
