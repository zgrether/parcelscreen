/**
 * The route's ground (step 10): what lies along the scored route, entrance to site, by the drawn lines within
 * COST_ASSUMPTIONS.onLineM and their condition; and its steep stretches, where the 30 m grade passes the paving
 * threshold. The cost to enjoy (cost.ts) and the Driveway section's Paving row (driveway.ts) both read it, so they
 * always give the same length at the same threshold (owner, #256 review).
 */
import { along, length, lineString, pointToLineDistance } from "@turf/turf";
import type { LineCondition } from "../client/parcelStore";
import { COST_ASSUMPTIONS as A, DEFAULT_PAVING, type Paving } from "../config/costs";
import type { LatLon } from "../geo/types";
import { overLimitSpans } from "../screen/driveway";
import { M2FT } from "../screen/util";
import type { CostLine } from "./cost";

export type Ground = "new" | LineCondition;
const RANK: Record<Ground, number> = { new: 0, uncleared: 1, pioneer: 2, improved: 3, paved: 4 };

/** A stretch of the route, ft from the entrance, and what's on the ground there. */
export interface Run {
  from: number;
  to: number;
  ground: Ground;
}

const xy = ([lat, lon]: LatLon): [number, number] => [lon, lat];
type RouteLine = ReturnType<typeof lineString>;

/**
 * The route's ground, entrance to site, by sampling every ~3 m. Lengths are scaled to the route's own `lengthFt`, so
 * the parts add up to what the Driveway section says.
 */
export function groundAlong(route: RouteLine, lengthFt: number, lines: readonly CostLine[]): Run[] {
  const lenM = length(route, { units: "meters" });
  if (!(lenM > 0)) return [];
  const drawn = lines
    .filter((l) => l.line.length >= 2)
    .map((l) => ({ ground: l.condition as Ground, geo: lineString(l.line.map(xy)) }));
  const n = Math.max(1, Math.ceil(lenM / 3));
  const step = lenM / n;
  const ftPerM = lengthFt / lenM;
  const runs: Run[] = [];
  for (let i = 0; i < n; i++) {
    const at = along(route, (i + 0.5) * step, { units: "meters" });
    let ground: Ground = "new";
    for (const d of drawn)
      if (RANK[d.ground] > RANK[ground] && pointToLineDistance(at, d.geo, { units: "meters" }) <= A.onLineM)
        ground = d.ground;
    const from = i * step * ftPerM,
      to = (i + 1) * step * ftPerM;
    const last = runs[runs.length - 1];
    if (last && last.ground === ground) last.to = to;
    else runs.push({ from, to, ground });
  }
  return runs;
}

/** Each ground's length, ft, between two points along the route. */
export function groundBetween(runs: readonly Run[], from: number, to: number): Record<Ground, number> {
  const out: Record<Ground, number> = { new: 0, uncleared: 0, pioneer: 0, improved: 0, paved: 0 };
  for (const r of runs) out[r.ground] += Math.max(0, Math.min(r.to, to) - Math.max(r.from, from));
  return out;
}

/** The route as the router stored it: its line, profile and length. */
interface StoredRoute {
  line: { geometry: { coordinates: number[][] } };
  profile: readonly (readonly [number, number])[];
  metrics: { lengthFt: number };
}

/** A route's ground from the parcel's drawn lines; none drawn, all new ground. */
export const routeRuns = (rt: StoredRoute, lines: readonly CostLine[]): Run[] =>
  groundAlong(lineString(rt.line.geometry.coordinates as [number, number][]), rt.metrics.lengthFt, lines);

/**
 * The route's steep stretches, ft: where its 30 m grade passes `abovePct`, less any paved line along it. What the cost
 * breakdown paves (or leaves as steep gravel) and what the Driveway section's Paving row says.
 */
export function steepStretchFt(rt: StoredRoute, abovePct: number, runs: readonly Run[]): number {
  return overLimitSpans(rt.profile as [number, number][], abovePct / 100).reduce((t, [a, b]) => {
    const g = groundBetween(runs, a * M2FT, b * M2FT);
    return t + (b - a) * M2FT - g.paved;
  }, 0);
}

/** What a report needs to say a route's paving (step 10): the paving choice and the parcel's lines, or the defaults. */
export interface PavingContext {
  paving: Paving;
  lines: readonly CostLine[];
}
export const DEFAULT_PAVING_CONTEXT: PavingContext = { paving: DEFAULT_PAVING, lines: [] };
