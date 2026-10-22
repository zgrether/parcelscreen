/**
 * The long view at a spot (step 11, docs/plans/step-11-new-data.md §2.4), from the skyline the site's score already
 * traces (sun.ts horizonProfile: every 5°, out to 6 km on the 30 m bare-earth DEM). No new requests.
 * - Each direction's view ends at its skyline cell, the one seen highest; where nothing rises above the profile's
 *   floor within 6 km, it reaches past the profile ("farther than 3.7 mi").
 * - The open share is the part of the horizon whose view reaches past view.openKm (3 mi).
 * - The direction is the middle of the widest run of open directions.
 */
import { SCREEN_CONSTANTS } from "./config";
import type { Dem } from "./types";
import type { HorizonPoint } from "./sun";

const K = SCREEN_CONSTANTS.view;

/** A spot's long view, as a site or the house stores it (ScoreFields.view). */
export interface SpotView {
  /** The longest view, km, at most the profile's reach; `past` when a direction reaches beyond it. */
  longestKm: number;
  past: boolean;
  /** The share of the horizon whose view reaches past view.openKm, 0–1. */
  openShare: number;
  /** The middle of the widest run of open directions, degrees from north; null when none is open. */
  dirDeg: number | null;
}

/**
 * Each direction's view, km: to its skyline cell, or past the profile's reach (Infinity) when nothing rises above its
 * floor, or the skyline is the last cell traced (level ground running on).
 */
export function viewKm(
  horizon: readonly HorizonPoint[],
  dem: Pick<Dem, "res">,
  r0: number,
  c0: number,
): number[] {
  const reachM = K.reachKm * 1000;
  return horizon.map((h) => {
    if (!h.rc) return Number.POSITIVE_INFINITY;
    const m = Math.hypot(h.rc[0] - r0, h.rc[1] - c0) * dem.res;
    return m >= reachM - dem.res ? Number.POSITIVE_INFINITY : m / 1000;
  });
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/** The view from a spot, from its traced skyline. */
export function viewOf(
  horizon: readonly HorizonPoint[],
  dem: Pick<Dem, "res">,
  r0: number,
  c0: number,
): SpotView {
  const km = viewKm(horizon, dem, r0, c0);
  const n = km.length;
  const open = km.map((d) => d > K.openKm);
  const longest = Math.max(...km);
  const step = 360 / n;
  // The widest circular run of open directions, and its middle.
  let best = 0;
  let bestEnd = -1;
  if (open.every(Boolean)) {
    best = n;
    bestEnd = n - 1;
  } else {
    let run = 0;
    for (let i = 0; i < 2 * n; i++) {
      run = open[i % n] ? run + 1 : 0;
      if (run > best && run <= n) {
        best = run;
        bestEnd = i;
      }
    }
  }
  const dirDeg =
    best === 0 ? null : best === n ? null : ((((bestEnd - (best - 1) / 2) * step) % 360) + 360) % 360;
  return {
    longestKm: round2(Math.min(longest, K.reachKm)),
    past: longest > K.reachKm,
    openShare: round2(open.filter(Boolean).length / n),
    dirDeg: dirDeg === null ? null : Math.round(dirDeg),
  };
}
