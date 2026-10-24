/**
 * Road frontage (step 14, docs/plans/step-14-land-uses.md §2.3): how much road runs along the boundary, by road, and how
 * much of it is public. Found by walking the boundary (owner, after #312): a stretch of the boundary is frontage on the
 * nearest road within frontage.reachM that runs within frontage.parallelDeg of it, so a road that only passes a corner,
 * or meets the boundary at an angle, isn't frontage, and nothing is added past the corners. Each stretch is then laid
 * onto its road, and the road's length so covered is what counts: a road with the parcel on both sides (Mud Creek's
 * two parts either side of Mud Creek Ln) counts once, as a deed's call along its centreline does. Measured on the
 * county map's boundary: a survey may differ.
 *
 * Public: TIGER's primary, secondary and local roads (MTFCC S1100, S1200, S1400), and OSM's ways of those classes that
 * aren't private. A track, a service drive or a private road is frontage, but not public. TIGER's roads are tried
 * first; an OSM way counts only where no TIGER road runs along the boundary (OSM's rural roads are TIGER imports).
 * Divide reads `publicFt`; the deed or plat confirms what the county counts.
 */
import { bbox } from "@turf/turf";
import type { Feature, LineString, MultiLineString, MultiPolygon, Polygon } from "geojson";
import { SCREEN_CONSTANTS } from "./config";
import type { OsmWay } from "./osmRoads";
import type { RoadFeature } from "./roads";
import { M2FT } from "./util";

const K = SCREEN_CONSTANTS.frontage;

export interface Frontage {
  /** Feet of public-road frontage, every road together. */
  publicFt: number;
  /** Each road with any frontage, longest first. */
  roads: { name: string; ft: number; public: boolean }[];
}

const isPublicTiger = (mtfcc: string | undefined) =>
  (K.publicMtfcc as readonly string[]).includes(mtfcc ?? "");
const isPublicOsm = (w: OsmWay) =>
  (K.publicOsm as readonly string[]).includes(w.highway) && w.access !== "private" && w.access !== "no";

/** Metres east and north of the parcel's middle: flat enough at a parcel's scale. */
type Xy = [number, number];

/** A segment of a road's line, and how far along the line it starts. */
interface Seg {
  a: Xy;
  b: Xy;
  line: number;
  from: number;
}

/** A road's segments near the parcel, in local metres, with what it's called and whether it's public. */
interface Road {
  name: string;
  public: boolean;
  segs: Seg[];
}

/** Where a point is nearest a road: how far off, the segment there, and how far along its line. */
interface Near {
  m: number;
  seg: Seg;
  at: number;
}

const linesOf = (g: LineString | MultiLineString): number[][][] =>
  g.type === "LineString" ? [g.coordinates] : g.coordinates;

/** The acute angle between two directions, in degrees (a road has no direction: 170° apart is 10°). */
function acuteDeg(a: Xy, b: Xy): number {
  const d = Math.abs(Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0])) % Math.PI;
  return (Math.min(d, Math.PI - d) * 180) / Math.PI;
}

/** The point's nearest place on these segments. */
function nearestOn(p: Xy, segs: readonly Seg[]): Near | null {
  let best: Near | null = null;
  for (const s of segs) {
    const dx = s.b[0] - s.a[0],
      dy = s.b[1] - s.a[1];
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((p[0] - s.a[0]) * dx + (p[1] - s.a[1]) * dy) / len2)) : 0;
    const m = Math.hypot(s.a[0] + t * dx - p[0], s.a[1] + t * dy - p[1]);
    if (!best || m < best.m) best = { m, seg: s, at: s.from + t * Math.sqrt(len2) };
  }
  return best;
}

/** The road running along the boundary at `p` (the side's direction `along`): the nearest within reach, near parallel. */
function alongside(p: Xy, along: Xy, roads: readonly Road[]): { road: Road; near: Near } | null {
  let found: { road: Road; near: Near } | null = null;
  for (const road of roads) {
    const n = nearestOn(p, road.segs);
    if (!n || n.m > K.reachM || (found && n.m >= found.near.m)) continue;
    if (acuteDeg(along, [n.seg.b[0] - n.seg.a[0], n.seg.b[1] - n.seg.a[1]]) > K.parallelDeg) continue;
    found = { road, near: n };
  }
  return found;
}

/** The total length of a set of intervals, overlaps counted once. */
function unionLength(spans: [number, number][]): number {
  const sorted = [...spans].sort((x, y) => x[0] - y[0]);
  if (!sorted.length) return 0;
  let total = 0;
  let [lo, hi] = sorted[0]!;
  for (const [a, b] of sorted.slice(1)) {
    if (a > hi) {
      total += hi - lo;
      [lo, hi] = [a, b];
    } else hi = Math.max(hi, b);
  }
  return total + hi - lo;
}

export function measureFrontage(
  tiger: readonly RoadFeature[],
  osm: readonly OsmWay[],
  parcel: Feature<Polygon | MultiPolygon>,
): Frontage {
  const [w0, s0, e0, n0] = bbox(parcel);
  const lat0 = (s0 + n0) / 2,
    lon0 = (w0 + e0) / 2;
  const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180),
    ky = 110_540;
  const xy = (c: readonly number[]): Xy => [(c[0]! - lon0) * kx, (c[1]! - lat0) * ky];
  // Only the segments near the parcel: those whose box meets the parcel's, widened by the reach.
  const hx = ((e0 - w0) / 2) * kx + K.reachM + 5,
    hy = ((n0 - s0) / 2) * ky + K.reachM + 5;
  const nearBox = (a: Xy, b: Xy) =>
    Math.max(a[0], b[0]) >= -hx &&
    Math.min(a[0], b[0]) <= hx &&
    Math.max(a[1], b[1]) >= -hy &&
    Math.min(a[1], b[1]) <= hy;
  let lineId = 0;
  const roadOf = (name: string, pub: boolean, lines: readonly (readonly number[])[][]): Road[] => {
    const segs: Seg[] = [];
    for (const l of lines) {
      const line = lineId++;
      let from = 0;
      for (let i = 1; i < l.length; i++) {
        const a = xy(l[i - 1]!),
          b = xy(l[i]!);
        if (nearBox(a, b)) segs.push({ a, b, line, from });
        from += Math.hypot(b[0] - a[0], b[1] - a[1]);
      }
    }
    return segs.length ? [{ name, public: pub, segs }] : [];
  };
  // Public roads first, so a road TIGER returns twice (a layer each, two names) keeps its public name.
  const tigerRoads = [...tiger]
    .sort((a, b) => Number(isPublicTiger(b.properties.MTFCC)) - Number(isPublicTiger(a.properties.MTFCC)))
    .flatMap((f) =>
      roadOf(f.properties.NAME || "unnamed road", isPublicTiger(f.properties.MTFCC), linesOf(f.geometry)),
    );
  const osmRoads = osm.flatMap((w) => roadOf(w.name ?? `unmapped ${w.highway}`, isPublicOsm(w), [w.coords]));

  // Each road's stretches the boundary runs along, by its line: [from, to] metres along the line.
  const spans = new Map<Road, Map<number, [number, number][]>>();
  const rings =
    parcel.geometry.type === "Polygon" ? parcel.geometry.coordinates : parcel.geometry.coordinates.flat();
  for (const ring of rings)
    for (let i = 1; i < ring.length; i++) {
      const a = xy(ring[i - 1]!),
        b = xy(ring[i]!);
      const along: Xy = [b[0] - a[0], b[1] - a[1]];
      const len = Math.hypot(along[0], along[1]);
      if (len === 0) continue;
      // The side in pieces of at most stepM, each decided by its middle and laid onto its road by its ends.
      const n = Math.ceil(len / K.stepM);
      const at = (t: number): Xy => [a[0] + along[0] * t, a[1] + along[1] * t];
      for (let j = 0; j < n; j++) {
        const hit =
          alongside(at((j + 0.5) / n), along, tigerRoads) ?? alongside(at((j + 0.5) / n), along, osmRoads);
        if (!hit) continue;
        const onLine = hit.road.segs.filter((s) => s.line === hit.near.seg.line);
        const p = nearestOn(at(j / n), onLine)!.at,
          q = nearestOn(at((j + 1) / n), onLine)!.at;
        const byLine = spans.get(hit.road) ?? new Map<number, [number, number][]>();
        const list = byLine.get(hit.near.seg.line) ?? [];
        list.push([Math.min(p, q), Math.max(p, q)]);
        byLine.set(hit.near.seg.line, list);
        spans.set(hit.road, byLine);
      }
    }
  const byRoad = new Map<string, { m: number; public: boolean }>();
  for (const [road, byLine] of spans) {
    const key = `${road.name}|${road.public}`;
    const kept = byRoad.get(key) ?? { m: 0, public: road.public };
    for (const list of byLine.values()) kept.m += unionLength(list);
    byRoad.set(key, kept);
  }
  const roads = [...byRoad.entries()]
    .map(([key, r]) => ({
      name: key.slice(0, key.lastIndexOf("|")),
      ft: Math.round(r.m * M2FT),
      public: r.public,
    }))
    .filter((r) => r.ft > 0)
    .sort((a, b) => b.ft - a.ft);
  return { publicFt: roads.filter((r) => r.public).reduce((s, r) => s + r.ft, 0), roads };
}
