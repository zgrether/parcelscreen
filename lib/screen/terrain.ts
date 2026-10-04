/**
 * Slope/aspect, the inside-the-boundary mask, the local valley floor and the terrain summary.
 * Ported verbatim (proto L894–910, L1016–1027, L1039).
 */
import { booleanPointInPolygon } from "@turf/turf";
import type { Feature, Polygon } from "geojson";
import { at, llToRC, rcToLL } from "./dem";
import { SCREEN_CONSTANTS } from "./config";
import type { Dem, ScreenResult } from "./types";
import { M2FT, M2_PER_ACRE, quantile, type LatLon } from "./util";

const K = SCREEN_CONSTANTS.terrain;

/**
 * Slope (degrees) and aspect (downslope direction, degrees clockwise from north) by central differences,
 * clamped at the grid edges. Rows increase southward, so dz/dy > 0 means the ground rises to the south and
 * aspect = atan2(−dz/dx, dz/dy).
 */
export function slopeAspect(d: Dem): { slope: Float32Array; aspect: Float32Array } {
  const { z, w, h, res } = d,
    slope = new Float32Array(w * h),
    aspect = new Float32Array(w * h);
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      const i = r * w + c,
        z0 = z[i]!;
      if (Number.isNaN(z0)) {
        slope[i] = NaN;
        aspect[i] = NaN;
        continue;
      }
      const zl = z[r * w + Math.max(c - 1, 0)]!,
        zr = z[r * w + Math.min(c + 1, w - 1)]!,
        zu = z[Math.max(r - 1, 0) * w + c]!,
        zd = z[Math.min(r + 1, h - 1) * w + c]!;
      const dzdx = (zr - zl) / (2 * res),
        dzdy = (zd - zu) / (2 * res); // dzdy positive = rises to the south
      slope[i] = (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI;
      aspect[i] = ((Math.atan2(-dzdx, dzdy) * 180) / Math.PI + 360) % 360;
    }
  return { slope, aspect };
}

/** 1 for cells whose centre is inside the parcel, else 0. */
export function insideMask(d: Dem, parcel: Feature<Polygon>): Uint8Array {
  const m = new Uint8Array(d.w * d.h);
  for (let r = 0; r < d.h; r++)
    for (let c = 0; c < d.w; c++) {
      const [lat, lon] = rcToLL(d, r, c);
      if (booleanPointInPolygon([lon, lat], parcel)) m[r * d.w + c] = 1;
    }
  return m;
}

/**
 * The local valley floor: the lowest ground within 1.5 km of the parcel centroid, on the wide DEM (metres).
 * The window's upper bounds are exclusive, as in the prototype.
 */
export function valleyFloor(dWide: Dem, centroid: LatLon): number {
  const [cr, cc] = llToRC(dWide, centroid[0], centroid[1]);
  let vf = Infinity;
  const rad = Math.ceil(K.valleyFloorRadiusM / dWide.res);
  for (let r = Math.max(0, cr - rad); r < Math.min(dWide.h, cr + rad); r++)
    for (let c = Math.max(0, cc - rad); c < Math.min(dWide.w, cc + rad); c++) {
      const z = at(dWide, r, c);
      if (!Number.isNaN(z) && z < vf) vf = z;
    }
  return vf;
}

/** The Terrain section's numbers, over cells inside the parcel. `diag` is filled in by the sites step. */
export function terrainStats(
  dFine: Dem,
  slope: Float32Array,
  inside: Uint8Array,
  vf: number,
): Omit<NonNullable<ScreenResult["terrain"]>, "diag"> {
  const zs: number[] = [],
    sl: number[] = [];
  let n = 0,
    under15 = 0,
    over25 = 0;
  const cellA = dFine.res * dFine.resY;
  for (let i = 0; i < inside.length; i++) {
    if (!inside[i] || Number.isNaN(slope[i]!)) continue;
    n++;
    zs.push(dFine.z[i]!);
    sl.push(slope[i]!);
    const pct = Math.tan((slope[i]! * Math.PI) / 180) * 100;
    if (pct <= K.gentleGradePct) under15++;
    if (pct > K.steepGradePct) over25++;
  }
  zs.sort((a, b) => a - b);
  sl.sort((a, b) => a - b);
  return {
    elevMinFt: zs[0]! * M2FT,
    elevMaxFt: zs[zs.length - 1]! * M2FT,
    elevMeanFt: (zs.reduce((a, b) => a + b, 0) / n) * M2FT,
    reliefFt: (zs[zs.length - 1]! - zs[0]!) * M2FT,
    slopeMedDeg: quantile(sl, 0.5),
    slopeP90Deg: quantile(sl, 0.9),
    acresUnder15: (under15 * cellA) / M2_PER_ACRE,
    acresOver25: (over25 * cellA) / M2_PER_ACRE,
    heightAboveValleyFt: (quantile(zs, 0.5) - vf) * M2FT,
    valleyFloorFt: vf * M2FT,
  };
}

/**
 * The terrain step's own flag (proto L1039). In the step it comes after the sites flags ("no house site" /
 * compact / relaxed), and flag order is part of parity.
 */
export function terrainFlags(slopeP90Deg: number): ScreenResult["flags"] {
  return slopeP90Deg > K.steepP90FlagDeg
    ? [
        {
          lvl: "warn",
          t: `90th-percentile slope is ${slopeP90Deg.toFixed(0)}°. The road will be the dominant site cost — get an excavator's number before offering.`,
        },
      ]
    : [];
}
