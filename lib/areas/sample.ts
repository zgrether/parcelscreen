/**
 * Sampling an area's rural land (step 13, docs/plans/step-13-area-catalog.md §3.1): candidates drawn uniformly over
 * the outline by a generator seeded with the area's id, so the same points come back month after month and a refresh
 * shows the data's changes, not the sampling's. A candidate on open water, developed land (NLCD) or any public land
 * (PAD-US fee land) is rejected.
 */
import { bbox, booleanPointInPolygon, point } from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { SCREEN_CONSTANTS } from "../screen/config";
import type { LatLon } from "../geo/types";

const K = SCREEN_CONSTANTS.areas;

/** A 32-bit hash of a string (FNV-1a): the seed. */
export function seedOf(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A small, fast, seeded generator (mulberry32): the same seed gives the same sequence everywhere. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** What sampling asks about a candidate. */
export interface SampleDeps {
  /** Its NLCD land-cover class; null where the raster has no reading (it's then rejected). */
  landCover(ll: LatLon): number | null;
  /** Whether it's on PAD-US fee land, whatever its access. */
  onPublicLand(ll: LatLon): boolean;
}

/** Why a candidate wasn't kept: on the ledger the tests read. */
export type Rejection = "outside" | "water" | "developed" | "noData" | "public";

export function rejection(
  ll: LatLon,
  outline: Feature<Polygon | MultiPolygon>,
  deps: SampleDeps,
): Rejection | null {
  if (!booleanPointInPolygon(point([ll[1], ll[0]]), outline)) return "outside";
  const c = deps.landCover(ll);
  if (c === null || c === 0) return "noData";
  if (K.waterClasses.includes(c)) return "water";
  if (K.developedClasses.includes(c)) return "developed";
  if (deps.onPublicLand(ll)) return "public";
  return null;
}

export interface Sample {
  points: LatLon[];
  /** Candidates drawn inside the outline's box, the accepted ones included. */
  candidates: number;
  rejected: Record<Rejection, number>;
  /** Fewer than areas.minPoints were accepted (or half of `n`, when that's fewer). */
  thin: boolean;
}

/**
 * Up to `n` accepted points, drawing at most `maxCandidates` (inside the outline or not), rounded to 5 decimals (about
 * a metre).
 */
export function sampleArea(
  id: string,
  outline: Feature<Polygon | MultiPolygon>,
  deps: SampleDeps,
  n: number = K.points,
  maxCandidates: number = K.maxCandidates,
): Sample {
  const [w, s, e, nn] = bbox(outline);
  const next = rng(seedOf(id));
  const rejected: Record<Rejection, number> = { outside: 0, water: 0, developed: 0, noData: 0, public: 0 };
  const points: LatLon[] = [];
  let candidates = 0;
  while (points.length < n && candidates < maxCandidates) {
    candidates++;
    const ll: LatLon = [+(s + next() * (nn - s)).toFixed(5), +(w + next() * (e - w)).toFixed(5)];
    const why = rejection(ll, outline, deps);
    if (why) rejected[why]++;
    else points.push(ll);
  }
  // A smaller run (the tests) is thin below half its own count.
  return { points, candidates, rejected, thin: points.length < Math.min(K.minPoints, n / 2) };
}
