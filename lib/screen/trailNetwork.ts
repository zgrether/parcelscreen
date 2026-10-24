/**
 * How much walking trail the parcel's gentle ground could hold (step 14, docs/plans/step-14-land-uses.md §2.2): a
 * simple estimate, and the panel says how it's made. The fine DEM's cells inside the boundary at most
 * uses.trailMaxGradePct steep, less the lidar's drainages (flow accumulation over driveway.streamContributingM2) and
 * the flood zone, kept in patches of at least uses.trailMinPatchAc; their area over one path every
 * uses.trailSpacingFt is the trail length. "Gentle ground", never "under mature trees": canopy isn't confirmed.
 */
import { SCREEN_CONSTANTS } from "./config";
import type { Dem } from "./types";
import { M2_PER_ACRE } from "../geo/types";

const U = SCREEN_CONSTANTS.uses;
const M_PER_MI = 1609.344;
const M_PER_FT = 0.3048;

export interface TrailNetwork {
  /** Acres of gentle ground in patches big enough to walk. */
  gentleAc: number;
  /** Miles of trail at one path every uses.trailSpacingFt. */
  miles: number;
}

export function trailNetwork(
  d: Dem,
  slopeDeg: Float32Array,
  inside: Uint8Array,
  /** Cells of contributing area (D8, in cells), or null when not built. */
  flowAcc: Float32Array | null,
  /** 1 where the cell is in FEMA's flood zone, or null. */
  sfha: Uint8Array | null,
): TrailNetwork {
  const gentleDeg = (Math.atan(U.trailMaxGradePct / 100) * 180) / Math.PI;
  const cellM2 = d.res * d.resY;
  const streamCells = SCREEN_CONSTANTS.driveway.streamContributingM2 / cellM2;
  const n = d.w * d.h;
  const ok = new Uint8Array(n);
  for (let i = 0; i < n; i++)
    ok[i] =
      inside[i] && slopeDeg[i]! <= gentleDeg && !(flowAcc && flowAcc[i]! >= streamCells) && !(sfha && sfha[i])
        ? 1
        : 0;
  // Patches: 4-connected components, each kept when it's at least trailMinPatchAc.
  const minCells = (U.trailMinPatchAc * M2_PER_ACRE) / cellM2;
  const seen = new Uint8Array(n);
  const stack: number[] = [];
  let kept = 0;
  for (let i = 0; i < n; i++) {
    if (!ok[i] || seen[i]) continue;
    let size = 0;
    stack.push(i);
    seen[i] = 1;
    while (stack.length) {
      const j = stack.pop()!;
      size++;
      const r = (j / d.w) | 0,
        c = j - r * d.w;
      for (const k of [
        c > 0 ? j - 1 : -1,
        c < d.w - 1 ? j + 1 : -1,
        r > 0 ? j - d.w : -1,
        r < d.h - 1 ? j + d.w : -1,
      ])
        if (k >= 0 && ok[k] && !seen[k]) {
          seen[k] = 1;
          stack.push(k);
        }
    }
    if (size >= minCells) kept += size;
  }
  const m2 = kept * cellM2;
  return {
    gentleAc: Math.round((m2 / M2_PER_ACRE) * 100) / 100,
    miles: Math.round((m2 / (U.trailSpacingFt * M_PER_FT) / M_PER_MI) * 100) / 100,
  };
}
