/**
 * The ground viewer's ridges by distance (owner, after the 17a review, option 1): the skyline split into
 * distance bands, so the view shows which ridge is near and which is far, painted back to front with haze.
 *
 * They come from the screen's own wide DEM (30 m, the parcel plus 6 km: dem.wideResM, the bbox the screen
 * fetched) and the engine's own march (sun.ts horizonProfile: the same eye height, steps and rounding), so the
 * bands' envelope at the report's 5° points is the report's skyline (ridges.test.ts). The report's line is still
 * drawn on top, and every number comes from it. Pure; the DEM is fetched on open and never kept.
 */
import { at, llToRC } from "@/lib/screen/dem";
import type { Dem } from "@/lib/screen/types";
import { SCREEN_CONSTANTS } from "@/lib/screen/config";
import type { LatLon } from "@/lib/screen/util";

const K = SCREEN_CONSTANTS.sun;

/** The bands' outer edges, metres: near to far. */
export const RIDGE_BANDS_M = [500, 1500, 3000, K.horizonMaxM] as const;

export interface RidgeBands {
  /** Azimuth step, degrees: band angles are at 0, step, 2·step, … */
  stepDeg: number;
  /** Outer edge of each band, metres (RIDGE_BANDS_M). */
  edgesM: readonly number[];
  /** Per band, near to far, the highest angle seen at each azimuth; null where the band has no ground. */
  angles: (number | null)[][];
}

/**
 * The skyline in each distance band from the point, looking out to `maxDist` like the engine: from the eye
 * (the DEM's ground at the point + 2 m), one step per cell along each azimuth.
 */
export function ridgeBands(
  dem: Dem,
  ll: LatLon,
  stepDeg = 1,
  edgesM: readonly number[] = RIDGE_BANDS_M,
): RidgeBands {
  const [r0, c0] = llToRC(dem, ll[0], ll[1]);
  const z0 = at(dem, r0, c0) + K.eyeHeightM;
  const maxDist = edgesM[edgesM.length - 1]!;
  const angles: (number | null)[][] = edgesM.map(() => []);
  for (let az = 0; az < 360; az += stepDeg) {
    const t = (az * Math.PI) / 180,
      dr = -Math.cos(t),
      dc = Math.sin(t);
    const best: (number | null)[] = edgesM.map(() => null);
    let band = 0;
    for (let s = 1; s * dem.res <= maxDist; s++) {
      const r = Math.round(r0 + dr * s),
        c = Math.round(c0 + dc * s);
      if (r < 0 || c < 0 || r >= dem.h || c >= dem.w) break;
      const d = s * dem.res;
      while (d > edgesM[band]!) band++;
      const z = at(dem, r, c);
      if (Number.isNaN(z)) continue;
      const ang = (Math.atan2(z - z0, d) * 180) / Math.PI;
      if (best[band] === null || ang > best[band]!) best[band] = ang;
    }
    best.forEach((a, i) => angles[i]!.push(a));
  }
  return { stepDeg, edgesM, angles };
}

/**
 * The bands' envelope at an azimuth index, as the engine reports it: the highest angle in any band, floored at
 * horizonFloorDeg for the march and at 0 for the profile (horizonProfile's `Math.max(0, best)`).
 */
export function envelope(b: RidgeBands, i: number): number {
  let best: number = K.horizonFloorDeg;
  for (const band of b.angles) {
    const a = band[i];
    if (a != null && a > best) best = a;
  }
  return Math.max(0, best);
}
