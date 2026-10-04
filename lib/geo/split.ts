/**
 * The split tool's geometry: cut a parcel with a line, measure both sides, and slide the line to hit a
 * target acreage. Ported from the prototype (proto L602–633) with the map/DOM state removed: every
 * function takes the parcel and the line explicitly.
 */
import { area, bearing, destination, featureCollection, intersect, polygon } from "@turf/turf";
import type { Feature, MultiPolygon, Polygon, Position } from "geojson";
import { compass } from "../format";
import { M2_PER_ACRE, type LatLon } from "./types";

/** +1 = right of the direction of travel a→b, −1 = left. */
export type Side = 1 | -1;

export interface SplitPieces {
  left: Feature<Polygon> | null;
  right: Feature<Polygon> | null;
  leftAc: number;
  rightAc: number;
}

/** A large polygon on one side of the line a→b (8 km past each end, 15 km deep). */
export function halfPlane(a: LatLon, b: LatLon, side: Side): Feature<Polygon> {
  const A = [a[1], a[0]],
    B = [b[1], b[0]];
  const br = bearing(A, B);
  const A2 = destination(A, 8, br + 180, { units: "kilometers" }).geometry.coordinates,
    B2 = destination(B, 8, br, { units: "kilometers" }).geometry.coordinates;
  const C = destination(B2, 15, br + 90 * side, { units: "kilometers" }).geometry.coordinates,
    D = destination(A2, 15, br + 90 * side, { units: "kilometers" }).geometry.coordinates;
  return polygon([[A2, B2, C, D, A2]]);
}

/** The largest polygon of a (multi)polygon result; null stays null. */
export function biggest(f: Feature<Polygon | MultiPolygon> | null): Feature<Polygon> | null {
  if (!f) return null;
  if (f.geometry.type === "Polygon") return f as Feature<Polygon>;
  let best: Feature<Polygon> | null = null,
    ba = 0;
  for (const c of f.geometry.coordinates as Position[][][]) {
    const p = polygon(c);
    const a = area(p);
    if (a > ba) {
      ba = a;
      best = p;
    }
  }
  return best;
}

function side(parcel: Feature<Polygon>, a: LatLon, b: LatLon, s: Side): Feature<Polygon> | null {
  try {
    return biggest(intersect(featureCollection([parcel, halfPlane(a, b, s)])));
  } catch {
    return null;
  }
}

/** Both pieces of the parcel cut by the line a→b, with their acreage. */
export function splitPieces(parcel: Feature<Polygon>, a: LatLon, b: LatLon): SplitPieces {
  const right = side(parcel, a, b, 1);
  const left = side(parcel, a, b, -1);
  return {
    left,
    right,
    leftAc: left ? area(left) / M2_PER_ACRE : 0,
    rightAc: right ? area(right) / M2_PER_ACRE : 0,
  };
}

/** Compass name of the side, e.g. "NW", used in the split panel labels. */
export function sideName(a: LatLon, b: LatLon, s: Side): string {
  const br = (bearing([a[1], a[0]], [b[1], b[0]]) + 90 * s + 360) % 360;
  return compass(br);
}

/**
 * Slides the line a→b sideways (perpendicular, up to ±2 km) until the chosen side has `targetAc` acres,
 * by 40 bisection steps. Returns the moved line, or null when the target can't be reached by sliding
 * (the prototype then says "rotate it or pick the other side").
 */
export function fitSplit(
  parcel: Feature<Polygon>,
  a0: LatLon,
  b0: LatLon,
  targetAc: number,
  s: Side,
): { a: LatLon; b: LatLon } | null {
  if (!(targetAc > 0)) return null;
  const A = [a0[1], a0[0]],
    B = [b0[1], b0[0]];
  const br = bearing(A, B) + 90; // perpendicular
  const moved = (off: number): { a: LatLon; b: LatLon } => {
    const a = destination(A, off, br, { units: "kilometers" }).geometry.coordinates,
      b = destination(B, off, br, { units: "kilometers" }).geometry.coordinates;
    return { a: [a[1]!, a[0]!], b: [b[1]!, b[0]!] };
  };
  const acAt = (off: number): number => {
    const { a, b } = moved(off);
    const P = splitPieces(parcel, a, b);
    return s < 0 ? P.leftAc : P.rightAc;
  };
  let lo = -2,
    hi = 2;
  const fLo = acAt(lo),
    fHi = acAt(hi);
  if ((fLo - targetAc) * (fHi - targetAc) > 0) return null;
  const inc = fHi > fLo;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const v = acAt(mid);
    if (v < targetAc === inc) lo = mid;
    else hi = mid;
  }
  return moved((lo + hi) / 2);
}

/** The `split_from` label carried by a piece: the parent's parcel number, else "parent parcel". */
export function splitFromLabel(parentProps: Record<string, unknown>): string {
  const id = parentProps.parno || parentProps.PARCELID || parentProps.pin;
  return id ? String(id) : "parent parcel";
}
