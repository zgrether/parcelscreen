/**
 * Combining parcels into one boundary to screen (step 13b, new in the port; listings often sell several
 * parcels together). Parcels that touch are unioned as they are. Parcels separated by a narrow gap (a road
 * right-of-way between tracts) are bridged by closing the union (buffer out, then back in) just enough to
 * span the widest gap; farther apart than `maxGapM`, they are not combined. The bridge strip isn't part of
 * the listing, so the acres reported are the parcels' own.
 */
import {
  area,
  buffer,
  featureCollection,
  lineString,
  point,
  pointToLineDistance,
  polygon,
  union,
} from "@turf/turf";
import type { Feature, MultiPolygon, Polygon, Position } from "geojson";
import { parcelFacts, type ParcelRecord } from "./parcels";
import { M2_PER_ACRE } from "./types";

export interface CombineLimits {
  /** Widest gap bridged, m. */
  maxGapM: number;
  /** Gaps narrower than this are digitizing slivers: the parcels count as touching, m. */
  touchM: number;
}

export type CombineResult =
  | {
      ok: true;
      geo: Feature<Polygon>;
      /** The parcels' own acres, summed (overlaps counted once). */
      acres: number;
      /** Widest gap bridged, m; 0 when the parcels touch. */
      gapM: number;
      /** Acres added by bridging (the strip and any notch the closing filled). */
      bridgeAcres: number;
    }
  | { ok: false; reason: "fewer than two" | "too far apart" | "no single boundary"; gapM: number };

const rings = (p: Feature<Polygon>) => p.geometry.coordinates.map((r) => lineString(r));

/** Shortest distance between two polygons' boundaries, m (0 when they overlap or touch). */
function gapBetween(a: Feature<Polygon>, b: Feature<Polygon>): number {
  if (union(featureCollection([a, b]))?.geometry.type === "Polygon") return 0;
  let best = Infinity;
  const fromVertices = (from: Feature<Polygon>, to: Feature<Polygon>) => {
    const lines = rings(to);
    for (const ring of from.geometry.coordinates)
      for (const v of ring as Position[])
        for (const l of lines) best = Math.min(best, pointToLineDistance(point(v), l, { units: "meters" }));
  };
  fromVertices(a, b);
  fromVertices(b, a);
  return best;
}

/** The pieces of a (multi)polygon. */
const pieces = (f: Feature<Polygon | MultiPolygon>): Feature<Polygon>[] =>
  f.geometry.type === "Polygon" ? [f as Feature<Polygon>] : f.geometry.coordinates.map((c) => polygon(c));

/**
 * The widest gap that must be bridged to connect all pieces: the longest edge of the minimum spanning tree
 * over the pieces' pairwise gaps (Prim's; a handful of pieces).
 */
function widestGap(ps: Feature<Polygon>[]): number {
  const inTree = [0];
  let widest = 0;
  while (inTree.length < ps.length) {
    let best = { gap: Infinity, j: -1 };
    for (const i of inTree)
      for (let j = 0; j < ps.length; j++) {
        if (inTree.includes(j)) continue;
        const g = gapBetween(ps[i]!, ps[j]!);
        if (g < best.gap) best = { gap: g, j };
      }
    inTree.push(best.j);
    widest = Math.max(widest, best.gap);
  }
  return widest;
}

export function combineParcels(parcels: Feature<Polygon>[], limits: CombineLimits): CombineResult {
  if (parcels.length < 2) return { ok: false, reason: "fewer than two", gapM: 0 };
  const merged = union(featureCollection(parcels));
  if (!merged) return { ok: false, reason: "no single boundary", gapM: 0 };
  const acres = area(merged) / M2_PER_ACRE;
  if (merged.geometry.type === "Polygon")
    return { ok: true, geo: merged as Feature<Polygon>, acres, gapM: 0, bridgeAcres: 0 };

  const gapM = widestGap(pieces(merged));
  if (gapM > limits.maxGapM) return { ok: false, reason: "too far apart", gapM };
  // Close just enough to span the widest gap (half each side, plus half a metre so the buffers meet).
  const r = gapM / 2 + 0.5;
  const out = buffer(merged, r, { units: "meters" });
  const closed = out && buffer(out, -r, { units: "meters" });
  if (!closed || closed.geometry.type !== "Polygon") return { ok: false, reason: "no single boundary", gapM };
  const geo = polygon(closed.geometry.coordinates);
  return {
    ok: true,
    geo,
    acres,
    gapM: gapM < limits.touchM ? 0 : gapM,
    bridgeAcres: Math.max(0, area(geo) / M2_PER_ACRE - acres),
  };
}

/** How a parcel is named in the combine list: its parcel ID, else its place in the list. */
export function memberLabel(m: ParcelRecord, i: number): string {
  return parcelFacts(m.geo, m.props).parcelId ?? `parcel ${i + 1}`;
}

/** Identifies a parcel across taps (outline or lookup), so a second tap takes it out. */
export function memberKey(m: ParcelRecord): string {
  const ring = m.geo.geometry.coordinates[0]!;
  return `${m.source}|${parcelFacts(m.geo, m.props).parcelId ?? ""}|${ring.length}|${ring[0]!.join(",")}`;
}

/** The parcel record for a combination: every ID, owner, address and county, and the parcels' own acres. */
export function combinedRecord(
  members: ParcelRecord[],
  r: Extract<CombineResult, { ok: true }>,
): ParcelRecord {
  const facts = members.map((m) => parcelFacts(m.geo, m.props));
  const all = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))].join("; ");
  const props: Record<string, unknown> = {
    parno: members.map(memberLabel).join(" + "),
    combined_acres: r.acres,
    combined_gap_m: r.gapM,
    combined_bridge_acres: r.bridgeAcres,
  };
  const owner = all(facts.map((f) => f.owner)),
    address = all(facts.map((f) => f.address)),
    county = all(facts.map((f) => f.county));
  if (owner) props.OWNER_NAME = owner;
  if (address) props.SITE_ADDRESS = address;
  if (county) props.COUNTY_NAME = county;
  return { geo: r.geo, props, source: "combined", multiPart: members.some((m) => m.multiPart) };
}
