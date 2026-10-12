/**
 * The build footprint on a site (value-ranking.md §5.4, owner #94 and #95 reviews; VR3a). A site *fits* when the
 * house rectangle fits inside the site's own cells (in one of four orientations) and the site's area holds the pad
 * (house, garage and turnaround); it *fits house only* when the rectangle fits but the pad doesn't; otherwise it's
 * *too small* for the build. The house's 15 ft working margin may spill onto the ground around the site: it's room
 * for excavation and equipment, not the house (owner, 2026-10-12; with it, ragged shelves read too small). Also the gentle ground (15% or less) within the drainfield
 * distance of the placed house, on the parcel's own land: what the card's Room to build row grades (VR3b).
 */
import { SCREEN_CONSTANTS } from "./config";
import type { Dem } from "./types";
import { M2FT, M2_PER_ACRE } from "./util";

export type Fit = "fits" | "house only" | "too small";

export interface SiteFit {
  fit: Fit;
  /** Gentle ground within `build.drainfieldWithinFt` of the placed house (or of the site's pin), acres. */
  gentleNearAc: number;
}

type Build = typeof SCREEN_CONSTANTS.build;

const FT2_PER_M2 = M2FT * M2FT;
/** 15% grade, in degrees of slope. */
const GENTLE_DEG = (Math.atan(0.15) * 180) / Math.PI;

/** The pad on a homesite: the house and the garage with their margins, and the turnaround (§5.4), in ft². */
export function padFt2(b: Build = SCREEN_CONSTANTS.build): number {
  const withMargin = ([w, d]: readonly number[]) => (w! + 2 * b.marginFt) * (d! + 2 * b.marginFt);
  return withMargin(b.houseRectFt) + withMargin(b.garageFt) + b.turnaroundFt[0]! * b.turnaroundFt[1]!;
}

/**
 * Cell offsets [dr, dc] covered by a w × h metre rectangle centred on a cell, turned `deg` from north. Rows grow
 * southward, columns eastward.
 */
function rectOffsets(d: Dem, wM: number, hM: number, deg: number): [number, number][] {
  const t = (deg * Math.PI) / 180,
    cos = Math.cos(t),
    sin = Math.sin(t);
  const reach = Math.hypot(wM, hM) / 2;
  const rMax = Math.ceil(reach / d.resY),
    cMax = Math.ceil(reach / d.res);
  const out: [number, number][] = [];
  for (let dr = -rMax; dr <= rMax; dr++)
    for (let dc = -cMax; dc <= cMax; dc++) {
      const x = dc * d.res,
        y = -dr * d.resY;
      // Into the rectangle's own frame: u across, v along.
      const u = x * cos - y * sin,
        v = x * sin + y * cos;
      if (Math.abs(u) <= wM / 2 && Math.abs(v) <= hM / 2) out.push([dr, dc]);
    }
  return out;
}

/**
 * Where the house rectangle fits on the site's cells, nearest the site's pin first; null when it fits nowhere. Four orientations: the rectangle is symmetric, so 0°, 45°, 90° and 135° cover the turns.
 */
export function placeHouse(
  d: Dem,
  cells: readonly number[],
  pin: readonly [number, number],
  b: Build = SCREEN_CONSTANTS.build,
): [number, number] | null {
  const mask = new Uint8Array(d.w * d.h);
  for (const i of cells) mask[i] = 1;
  const wM = b.houseRectFt[0]! / M2FT,
    hM = b.houseRectFt[1]! / M2FT;
  const turns = [0, 45, 90, 135].map((deg) => rectOffsets(d, wM, hM, deg));
  const byDistance = [...cells].sort((a, z) => {
    const da = (Math.floor(a / d.w) - pin[0]) ** 2 + ((a % d.w) - pin[1]) ** 2;
    const dz = (Math.floor(z / d.w) - pin[0]) ** 2 + ((z % d.w) - pin[1]) ** 2;
    return da - dz;
  });
  for (const i of byDistance) {
    const r = Math.floor(i / d.w),
      c = i % d.w;
    for (const offs of turns) {
      let ok = true;
      for (const [dr, dc] of offs) {
        const rr = r + dr,
          cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= d.h || cc >= d.w || !mask[rr * d.w + cc]) {
          ok = false;
          break;
        }
      }
      if (ok) return [r, c];
    }
  }
  return null;
}

/** The site's fit, and the gentle ground near where the house goes. */
export function siteFit(
  d: Dem,
  site: { cells: readonly number[]; acres: number; rc: readonly [number, number] },
  slopeDeg: Float32Array,
  inside: Uint8Array,
  b: Build = SCREEN_CONSTANTS.build,
): SiteFit {
  const placed = placeHouse(d, site.cells, site.rc, b);
  const siteFt2 = site.acres * M2_PER_ACRE * FT2_PER_M2;
  const fit: Fit = placed === null ? "too small" : siteFt2 >= padFt2(b) ? "fits" : "house only";
  const [r0, c0] = placed ?? site.rc;
  const reachM = b.drainfieldWithinFt / M2FT;
  const rMax = Math.ceil(reachM / d.resY),
    cMax = Math.ceil(reachM / d.res);
  let gentle = 0;
  for (let r = Math.max(0, r0 - rMax); r <= Math.min(d.h - 1, r0 + rMax); r++)
    for (let c = Math.max(0, c0 - cMax); c <= Math.min(d.w - 1, c0 + cMax); c++) {
      const i = r * d.w + c;
      if (!inside[i] || !(slopeDeg[i]! <= GENTLE_DEG)) continue;
      if (Math.hypot((r - r0) * d.resY, (c - c0) * d.res) <= reachM) gentle++;
    }
  return { fit, gentleNearAc: (gentle * d.res * d.resY) / M2_PER_ACRE };
}
