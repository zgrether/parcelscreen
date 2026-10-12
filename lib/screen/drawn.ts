/**
 * Lines drawn with the parcel (follow-up 34): an existing drive or ATV trail ("track"), or an easement's centre line
 * with its recorded width. The screen measures each one on the fine DEM (its length, and its grades as a route's are
 * measured), and lays them on the grid for the router: a track's cells and an easement's corridor count as the
 * parcel's own land, and a track's cells cost as flat ground (driveway.ts). Where a line's end meets a road, its other
 * end is an entrance (driveway.ts drawnEntrances).
 */
import { booleanPointInPolygon, distance, length, lineString } from "@turf/turf";
import type { Feature, MultiPolygon, Polygon, Position } from "geojson";
import * as UTM from "../geo/utm";
import { SCREEN_CONSTANTS } from "./config";
import { bilinear, inGrid, rcToUTM, utmToRC } from "./dem";
import { gradeOver, type DrawnGrid } from "./driveway";
import type { Dem, DrawnInput, DrawnLine } from "./types";
import { M2FT } from "./util";

const K = SCREEN_CONSTANTS.driveway;
/** An easement drawn without a width: the Notes tab's default (lib/client/parcelStore.ts EASEMENT_WIDTH_FT). */
const DEFAULT_EASEMENT_FT = 30;

const xy = (ll: readonly [number, number]): Position => [ll[1], ll[0]];

/**
 * The corridor's half width, metres: an easement's recorded width; a track's cleared corridor (a route measured on its
 * smoothed line can sit a cell off a track's centre line and still be on it).
 */
const halfWidthM = (l: DrawnInput): number =>
  l.kind === "easement" ? (l.widthFt ?? DEFAULT_EASEMENT_FT) / M2FT / 2 : K.clearingWidthM / 2;

/**
 * The lines on the fine DEM's grid: each cell within a line's half width of it (and every cell the line passes
 * through) holds 1 + the line's index, the first line drawn winning where two overlap; `track` marks a track's cells.
 */
export function drawnGrid(d: Dem, lines: readonly DrawnInput[]): DrawnGrid {
  const n = d.w * d.h;
  const cell = new Uint16Array(n),
    track = new Uint8Array(n);
  const step = Math.min(d.res, d.resY) / 2;
  lines.forEach((l, k) => {
    const r = halfWidthM(l);
    const reachR = Math.ceil(r / d.resY),
      reachC = Math.ceil(r / d.res);
    const mark = (i: number) => {
      if (!cell[i]) cell[i] = k + 1;
      if (l.kind === "track" && cell[i] === k + 1) track[i] = 1;
    };
    const pts = l.line.map((ll) => UTM.fwd(ll[0], ll[1]));
    for (let s = 1; s < pts.length; s++) {
      const [x0, y0] = pts[s - 1]!,
        [x1, y1] = pts[s]!;
      const segM = Math.hypot(x1 - x0, y1 - y0);
      const nSteps = Math.max(1, Math.ceil(segM / step));
      for (let t = 0; t <= nSteps; t++) {
        const x = x0 + ((x1 - x0) * t) / nSteps,
          y = y0 + ((y1 - y0) * t) / nSteps;
        const [rr, cc] = utmToRC(d, x, y);
        if (inGrid(d, rr, cc)) mark(rr * d.w + cc);
        for (let dr = -reachR; dr <= reachR; dr++)
          for (let dc = -reachC; dc <= reachC; dc++) {
            const r2 = rr + dr,
              c2 = cc + dc;
            if (!inGrid(d, r2, c2)) continue;
            const [cx, cy] = rcToUTM(d, r2, c2);
            if (Math.hypot(cx - x, cy - y) <= r) mark(r2 * d.w + c2);
          }
      }
    }
  });
  return { lines, cell, track };
}

/** The router's own land (follow-up 34): the outline's cells, and every drawn line's (a track's, an easement's corridor). */
export const insideWithLines = (inside: Uint8Array, g: DrawnGrid): Uint8Array =>
  inside.map((v, i) => (v || g.cell[i] ? 1 : 0));

/**
 * A line's profile on the DEM ([metres along, elevation], every profileStepM, the ground interpolated between the
 * cells as a route's is), over the part the grid covers.
 */
export function lineProfile(d: Dem, line: readonly (readonly [number, number])[]): [number, number][] {
  const pts = line.map((ll) => UTM.fwd(ll[0], ll[1]));
  const prof: [number, number][] = [];
  let along = 0,
    next = 0;
  for (let s = 1; s < pts.length; s++) {
    const [x0, y0] = pts[s - 1]!,
      [x1, y1] = pts[s]!;
    const segM = Math.hypot(x1 - x0, y1 - y0);
    while (next <= along + segM) {
      const f = segM ? (next - along) / segM : 0;
      const z = bilinear(d, x0 + (x1 - x0) * f, y0 + (y1 - y0) * f);
      if (!Number.isNaN(z)) prof.push([next, z]);
      next += K.profileStepM;
    }
    along += segM;
  }
  return prof;
}

/** The mean grade of a profile's steps, percent: a route's avgGradePct (driveway.ts). */
const meanGradePct = (prof: readonly (readonly [number, number])[]): number => {
  let sum = 0;
  for (let i = 1; i < prof.length; i++)
    sum += Math.abs(prof[i]![1] - prof[i - 1]![1]) / (prof[i]![0] - prof[i - 1]![0]);
  return prof.length > 1 ? (sum / (prof.length - 1)) * 100 : 0;
};

/**
 * Each line measured: its length, how much of it lies outside the parcel's outline, and its grades on the fine DEM
 * (null without a DEM, or when it covers less than minGradedM of the line). Only consecutive samples count towards
 * `gradedFt`, so a line that leaves the grid isn't graded across the gap.
 */
export function measureLines(
  lines: readonly DrawnInput[],
  outline: Feature<Polygon | MultiPolygon>,
  d: Dem | null,
): DrawnLine[] {
  return lines.map((l) => {
    const coords = l.line.map(xy);
    const lenM = length(lineString(coords), { units: "meters" });
    let outsideM = 0;
    for (let s = 1; s < coords.length; s++) {
      const a = coords[s - 1]!,
        b = coords[s]!;
      const segM = distance(a, b, { units: "meters" });
      const n = Math.max(1, Math.ceil(segM));
      for (let t = 0; t < n; t++) {
        const f = (t + 0.5) / n;
        const p = [a[0]! + (b[0]! - a[0]!) * f, a[1]! + (b[1]! - a[1]!) * f];
        if (!booleanPointInPolygon(p, outline)) outsideM += segM / n;
      }
    }
    const prof = d ? lineProfile(d, l.line) : [];
    let gradedM = 0;
    for (let i = 1; i < prof.length; i++)
      if (prof[i]![0] - prof[i - 1]![0] <= K.profileStepM + 1e-6) gradedM += prof[i]![0] - prof[i - 1]![0];
    const graded = gradedM >= K.drawn.minGradedM;
    return {
      id: l.id,
      kind: l.kind,
      lengthFt: lenM * M2FT,
      widthFt: l.kind === "easement" ? (l.widthFt ?? DEFAULT_EASEMENT_FT) : null,
      outsideFt: outsideM * M2FT,
      gradedFt: gradedM * M2FT,
      avgGradePct: graded ? meanGradePct(prof) : null,
      maxGradePct: graded ? gradeOver(prof, K.gradeWindowsM.headline) : null,
    };
  });
}
