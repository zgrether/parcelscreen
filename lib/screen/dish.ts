/**
 * The best open-sky spot for a satellite dish (step 11, docs/plans/step-11-new-data.md §2.7), parcel-wide: candidate
 * spots every dish.stepM over the parcel's own land, each scored by the share of the dish's view cone (dish.coneDeg and
 * up, all around) that the terrain leaves clear, the northern half counting dish.northWeight times as much (Starlink
 * looks north from here). The skyline is traced on the 30 m wide DEM, as the sun's is; trees aren't in it.
 */
import { SCREEN_CONSTANTS } from "./config";
import { inGrid, llToRC, rcToLL } from "./dem";
import { horizonProfile } from "./sun";
import type { Dem } from "./types";
import type { LatLon } from "./util";

const K = SCREEN_CONSTANTS.dish;

/** The best spot, and how clear its cone is, 0–1. */
export interface DishSpot {
  ll: LatLon;
  clearShare: number;
}

/**
 * The share of the cone a skyline leaves clear: in each direction, the part of the cone (coneDeg to 90°) above the
 * skyline, weighted toward the north.
 */
export function clearShare(skyline: readonly { az: number; angle: number }[]): number {
  let sum = 0;
  let weights = 0;
  for (const { az, angle } of skyline) {
    const w = az >= 270 || az <= 90 ? K.northWeight : 1;
    const blocked = Math.min(90, Math.max(K.coneDeg, angle)) - K.coneDeg;
    sum += w * (1 - blocked / (90 - K.coneDeg));
    weights += w;
  }
  return weights ? sum / weights : 0;
}

/**
 * The parcel's best spot: the clearest candidate, the nearest to `near` (the house site) among those within
 * dish.tieShare of the best. Null when the parcel has no cell on the wide DEM.
 */
export function dishSpot(dFine: Dem, inside: Uint8Array, dWide: Dem, near: LatLon | null): DishSpot | null {
  const step = Math.max(1, Math.round(K.stepM / dFine.res));
  const spots: { ll: LatLon; share: number }[] = [];
  for (let r = 0; r < dFine.h; r += step)
    for (let c = 0; c < dFine.w; c += step) {
      if (!inside[r * dFine.w + c]) continue;
      const ll = rcToLL(dFine, r, c);
      const [wr, wc] = llToRC(dWide, ll[0], ll[1]);
      if (!inGrid(dWide, wr, wc) || Number.isNaN(dWide.z[wr * dWide.w + wc]!)) continue;
      spots.push({ ll, share: clearShare(horizonProfile(dWide, wr, wc, 5, K.reachM)) });
    }
  if (!spots.length) return null;
  const best = Math.max(...spots.map((s) => s.share));
  const metres = (a: LatLon, b: LatLon) =>
    Math.hypot((a[0] - b[0]) * 111_320, (a[1] - b[1]) * 111_320 * Math.cos((a[0] * Math.PI) / 180));
  const pick = spots
    .filter((s) => s.share >= best - K.tieShare)
    .sort((a, b) => (near ? metres(a.ll, near) - metres(b.ll, near) : b.share - a.share))[0]!;
  return {
    ll: [+pick.ll[0].toFixed(6), +pick.ll[1].toFixed(6)],
    clearShare: Math.round(pick.share * 1000) / 1000,
  };
}
