/**
 * The December horizon: trace the skyline from a point on the wide (30 m) DEM, integrate the sun's path
 * against it, and choose the evaluation point. Ported verbatim (proto L959–985, L1075–1085, L1249–1261).
 */
import { SCREEN_CONSTANTS } from "./config";
import { at, inGrid, llToRC, rcToLL } from "./dem";
import type { Dem, ScreenResult } from "./types";
import { M2FT, type LatLon } from "./util";

const K = SCREEN_CONSTANTS.sun;

/** The skyline in one direction: the highest angle seen, and the grid cell that forms it (for the fans). */
export interface HorizonPoint {
  az: number;
  angle: number;
  rc: [number, number] | null;
}

/**
 * Horizon angle every `stepDeg` of azimuth from cell (r0, c0), looking out to `maxDist` metres, from an eye
 * 2 m above the ground. Angles below the horizontal count as 0.
 */
export function horizonProfile(
  dh: Dem,
  r0: number,
  c0: number,
  stepDeg: number = K.horizonStepDeg,
  maxDist: number = K.horizonMaxM,
): HorizonPoint[] {
  const z0 = at(dh, r0, c0) + K.eyeHeightM,
    out: HorizonPoint[] = [];
  for (let az = 0; az < 360; az += stepDeg) {
    const t = (az * Math.PI) / 180,
      dr = -Math.cos(t),
      dc = Math.sin(t);
    let best: number = K.horizonFloorDeg,
      bestRC: [number, number] | null = null;
    for (let s = 1; s * dh.res <= maxDist; s++) {
      const r = Math.round(r0 + dr * s),
        c = Math.round(c0 + dc * s);
      if (r < 0 || c < 0 || r >= dh.h || c >= dh.w) break;
      const z = at(dh, r, c);
      if (Number.isNaN(z)) continue;
      const ang = (Math.atan2(z - z0, s * dh.res) * 180) / Math.PI;
      if (ang > best) {
        best = ang;
        bestRC = [r, c];
      }
    }
    out.push({ az, angle: Math.max(0, best), rc: bestRC });
  }
  return out;
}

export interface SunDay {
  daylightH: number;
  directH: number;
  /** Solar altitude at noon, degrees. */
  noonAlt: number;
  /** The sun's highest altitude in each 5° azimuth bin (null where it never is), for the map fan colours. */
  altByAz: (number | null)[];
}

/**
 * Daylight and direct-sun hours for a day of year, sampling the sun every ¼° of hour angle (one minute):
 * a minute counts as direct when the sun is above the skyline plus the canopy allowance.
 */
export function sunHours(lat: number, horizon: HorizonPoint[], doy: number, canopy: number): SunDay {
  // sun altitude/azimuth over the day, one sample per minute of hour angle
  const dec = (-23.44 * Math.cos((2 * Math.PI * (doy + 10)) / 365) * Math.PI) / 180,
    φ = (lat * Math.PI) / 180;
  const hz = (az: number) => {
    const i = ((Math.round(az / 5) % horizon.length) + horizon.length) % horizon.length;
    return horizon[i] ? horizon[i]!.angle : 0;
  };
  let daylight = 0,
    direct = 0;
  const noonAlt = (Math.asin(Math.sin(φ) * Math.sin(dec) + Math.cos(φ) * Math.cos(dec)) * 180) / Math.PI;
  const altByAz: (number | null)[] = new Array(72).fill(null);
  for (let H = -180; H <= 180; H += K.hourAngleStepDeg) {
    const h = (H * Math.PI) / 180,
      sa = Math.sin(φ) * Math.sin(dec) + Math.cos(φ) * Math.cos(dec) * Math.cos(h),
      alt = (Math.asin(sa) * 180) / Math.PI;
    if (alt <= 0) continue;
    daylight++;
    let az =
      (Math.acos(
        Math.max(
          -1,
          Math.min(1, (Math.sin(dec) - sa * Math.sin(φ)) / (Math.cos(Math.asin(sa)) * Math.cos(φ))),
        ),
      ) *
        180) /
      Math.PI;
    if (H > 0) az = 360 - az;
    if (alt > hz(az) + canopy) direct++;
    const bi = ((Math.round(az / 5) % 72) + 72) % 72;
    if (altByAz[bi] == null || alt > altByAz[bi]!) altByAz[bi] = alt;
  }
  return { daylightH: daylight / 60, directH: direct / 60, noonAlt, altByAz };
}

/** Where the sun and sky are evaluated (proto L1081): the house, else the best usable site, else … */
export function chooseFocus(opts: {
  house: LatLon | null;
  best: { ll: LatLon; veto: string | null } | null;
  firstShelf: LatLon | null;
  centre: LatLon;
}): { ll: LatLon; label: string } {
  const { house, best, firstShelf, centre } = opts;
  if (house) return { ll: house, label: "the existing house" };
  if (best && !best.veto) return { ll: best.ll, label: "the largest house site" };
  if (firstShelf) return { ll: firstShelf, label: "shelf S1 (no house site found)" };
  if (best) return { ll: best.ll, label: "the largest (excluded) site" };
  return { ll: centre, label: "the parcel centre" };
}

export interface SunContext {
  dFine: Dem;
  dWide: Dem;
  slope: Float32Array;
  aspect: Float32Array;
}

export interface SunAt {
  point: NonNullable<ScreenResult["point"]>;
  sun: NonNullable<ScreenResult["sun"]>;
  /** The full skyline with ridge cells: session-only (the map and 3D fans need the cells). */
  horizon: HorizonPoint[];
  /** The highest skyline point between azimuths 120° and 240°. */
  worst: HorizonPoint;
  /** December's sun altitude per azimuth bin, for colouring the map fan. */
  decAltByAz: (number | null)[];
}

/** The December (and June) sun at a point (proto computeSun, L1249–1261). */
export function computeSun(ctx: SunContext, ll: LatLon, valleyFloorFt: number, canopyDeg: number): SunAt {
  const [r0, c0] = llToRC(ctx.dWide, ll[0], ll[1]);
  const horizon = horizonProfile(ctx.dWide, r0, c0, K.horizonStepDeg, K.horizonMaxM);
  const dec = sunHours(ll[0], horizon, K.decemberDoy, canopyDeg),
    jun = sunHours(ll[0], horizon, K.juneDoy, canopyDeg);
  const [s0, s1] = K.southArc;
  const worst = horizon.filter((h) => h.az >= s0 && h.az <= s1).reduce((a, b) => (b.angle > a.angle ? b : a));
  const [pr, pc] = llToRC(ctx.dFine, ll[0], ll[1]);
  const pi = pr * ctx.dFine.w + pc,
    inFine = inGrid(ctx.dFine, pr, pc);
  const zW = (() => {
    const [wr, wc] = llToRC(ctx.dWide, ll[0], ll[1]);
    return at(ctx.dWide, wr, wc);
  })();
  const z = inFine && !Number.isNaN(ctx.dFine.z[pi]!) ? ctx.dFine.z[pi]! : zW;
  const nanToNull = (v: number) => (Number.isNaN(v) ? null : v);
  return {
    point: {
      ll,
      elevFt: z * M2FT,
      aboveFloorFt: z * M2FT - valleyFloorFt,
      slopeDeg: inFine ? nanToNull(ctx.slope[pi]!) : null,
      aspectDeg: inFine ? nanToNull(ctx.aspect[pi]!) : null,
    },
    sun: {
      decDirectH: dec.directH,
      decDaylightH: dec.daylightH,
      noonAlt: dec.noonAlt,
      noonClearance: dec.noonAlt - worst.angle - canopyDeg,
      worstAz: worst.az,
      worstAngle: worst.angle,
      junDirectH: jun.directH,
      junDaylightH: jun.daylightH,
      profile: horizon.map((h) => [h.az, +h.angle.toFixed(1)] as [number, number]),
    },
    horizon,
    worst,
    decAltByAz: dec.altByAz,
  };
}

/** The sun step's flag (proto L1083–1084). */
export function sunFlags(
  sun: NonNullable<ScreenResult["sun"]>,
  focusLabel: string,
  worst: HorizonPoint,
  sunHoursWanted: number,
): ScreenResult["flags"] {
  if (sun.noonClearance <= 0)
    return [
      {
        lvl: "fatal",
        t: "Terrain to the south blocks the sun at noon on December 21. No winter solar gain, no useful PV. Unfixable.",
      },
    ];
  if (sun.decDirectH < sunHoursWanted)
    return [
      {
        lvl: "warn",
        t: `Only ${sun.decDirectH.toFixed(1)} h of direct sun on December 21 at ${focusLabel} (you wanted ${sunHoursWanted}). Ridge at ${worst.az}° is the problem.`,
      },
    ];
  return [];
}

/** Grid cell → lat/lon of a skyline point (for drawing a fan ray). */
export const ridgeLL = (dWide: Dem, p: HorizonPoint): LatLon | null =>
  p.rc ? rcToLL(dWide, p.rc[0], p.rc[1]) : null;
