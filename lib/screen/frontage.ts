/**
 * Road frontage (step 14, docs/plans/step-14-land-uses.md §2.3): how much road runs along the boundary, by road, and how
 * much of it is public. It counts what the entrance search samples (driveway.ts frontageCandidates): a road's points
 * every entranceSampleM that lie within entranceMaxDistM of the boundary, each standing for entranceSampleM of road.
 *
 * Public: TIGER's primary, secondary and local roads (MTFCC S1100, S1200, S1400), and OSM's ways of those classes that
 * aren't private. A track, a service drive or a private road is frontage, but not public. Divide reads `publicFt`; the
 * deed or plat confirms what the county counts.
 */
import { bbox, distance, lineString, pointToLineDistance, polygonToLine } from "@turf/turf";
import type { Feature, LineString, MultiLineString, MultiPolygon, Polygon } from "geojson";
import { SCREEN_CONSTANTS } from "./config";
import type { OsmWay } from "./osmRoads";
import type { RoadFeature } from "./roads";
import { M2FT } from "./util";

const K = SCREEN_CONSTANTS.frontage;
const D = SCREEN_CONSTANTS.driveway;

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

/** The road's lines, as the entrance search walks them. */
const linesOf = (f: Feature<LineString | MultiLineString>): Feature<LineString>[] =>
  f.geometry.type === "LineString"
    ? [f as Feature<LineString>]
    : f.geometry.coordinates.map((c) => lineString(c));

/** A sample this close to one already counted is the same road (TIGER returns a road once per layer and name). */
const SAME_SAMPLE_M = D.entranceSampleM * 0.8;

/**
 * Metres of a line within entranceMaxDistM of the boundary, at the entrance search's spacing. A sample near one in
 * `counted` (the same road under another name or layer) isn't counted again, nor one within osmRoads.onRoadM of one
 * of `skip` (an OSM way on a TIGER road: the same road, imported). Each sample counted is added to `counted`.
 */
function nearBoundaryM(
  ln: Feature<LineString>,
  edges: readonly Feature<LineString>[],
  box: Box,
  counted: [number, number][],
  skip: readonly Feature<LineString>[] = [],
): number {
  let m = 0;
  for (const c of samples(ln.geometry.coordinates as [number, number][], box)) {
    if (!edges.some((e) => pointToLineDistance(c, e, { units: "meters" }) <= D.entranceMaxDistM)) continue;
    if (skip.some((t) => pointToLineDistance(c, t, { units: "meters" }) <= SCREEN_CONSTANTS.osmRoads.onRoadM))
      continue;
    if (counted.some((q) => distance(q, c, { units: "meters" }) < SAME_SAMPLE_M)) continue;
    counted.push(c);
    m += D.entranceSampleM;
  }
  return m;
}

/** [west, south, east, north]: the parcel's box widened by the entrance search's reach. */
type Box = [number, number, number, number];

/**
 * The line's points every entranceSampleM from its start (as turf's `along` would give them, on a local flat
 * approximation), keeping only those inside `box`: the roads within 1.5 km are mostly far from the parcel.
 */
function samples(coords: readonly [number, number][], box: Box): [number, number][] {
  const out: [number, number][] = [];
  const step = D.entranceSampleM;
  let next = 0; // distance along the line of the next sample
  let walked = 0;
  for (let i = 1; i < coords.length; i++) {
    const [x0, y0] = coords[i - 1]!;
    const [x1, y1] = coords[i]!;
    const kx = 111_320 * Math.cos((((y0 + y1) / 2) * Math.PI) / 180);
    const len = Math.hypot((x1 - x0) * kx, (y1 - y0) * 110_540);
    const segOut =
      Math.max(x0, x1) < box[0] ||
      Math.min(x0, x1) > box[2] ||
      Math.max(y0, y1) < box[1] ||
      Math.min(y0, y1) > box[3];
    while (next <= walked + len) {
      if (!segOut) {
        const t = len > 0 ? (next - walked) / len : 0;
        const p: [number, number] = [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
        if (p[0] >= box[0] && p[0] <= box[2] && p[1] >= box[1] && p[1] <= box[3]) out.push(p);
      }
      next += step;
    }
    walked += len;
  }
  return out;
}

export function measureFrontage(
  tiger: readonly RoadFeature[],
  osm: readonly OsmWay[],
  parcel: Feature<Polygon | MultiPolygon>,
): Frontage {
  const e = polygonToLine(parcel);
  const edges: Feature<LineString>[] = (e.type === "FeatureCollection" ? e.features : [e]).flatMap((f) =>
    f.geometry.type === "LineString"
      ? [f as Feature<LineString>]
      : f.geometry.coordinates.map((c) => lineString(c)),
  );
  const [w0, s0, e0, n0] = bbox(parcel);
  const padLat = (D.entranceMaxDistM + 5) / 110_540;
  const padLon = (D.entranceMaxDistM + 5) / (111_320 * Math.cos((((s0 + n0) / 2) * Math.PI) / 180));
  const box: Box = [w0 - padLon, s0 - padLat, e0 + padLon, n0 + padLat];
  const byRoad = new Map<string, { ft: number; public: boolean }>();
  const add = (name: string, m: number, pub: boolean) => {
    if (m <= 0) return;
    const key = `${name}|${pub}`;
    const r = byRoad.get(key) ?? { ft: 0, public: pub };
    r.ft += m * M2FT;
    byRoad.set(key, r);
  };
  const tigerLines = tiger.flatMap(linesOf);
  const counted: [number, number][] = [];
  // Public roads first, so a road TIGER returns twice keeps its public length under the public name.
  const ordered = [...tiger].sort(
    (a, b) => Number(isPublicTiger(b.properties.MTFCC)) - Number(isPublicTiger(a.properties.MTFCC)),
  );
  for (const f of ordered)
    for (const ln of linesOf(f))
      add(
        f.properties.NAME || "unnamed road",
        nearBoundaryM(ln, edges, box, counted),
        isPublicTiger(f.properties.MTFCC),
      );
  for (const w of osm)
    add(
      w.name ?? `unmapped ${w.highway}`,
      nearBoundaryM(lineString(w.coords), edges, box, counted, tigerLines),
      isPublicOsm(w),
    );
  const roads = [...byRoad.entries()]
    .map(([key, r]) => ({ name: key.slice(0, key.lastIndexOf("|")), ft: Math.round(r.ft), public: r.public }))
    .sort((a, b) => b.ft - a.ft);
  return { publicFt: roads.filter((r) => r.public).reduce((s, r) => s + r.ft, 0), roads };
}
