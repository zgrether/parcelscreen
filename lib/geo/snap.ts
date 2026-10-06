/**
 * Snapping a drawn corner to the parcel it's added to (13e): within a few screen pixels of one of the
 * parcel's corners, the corner lands exactly on it; else within reach of an edge, exactly on that edge. So
 * a custom shape drawn onto a parcel joins it with no sliver between them.
 *
 * The distances are measured on screen (the caller projects each vertex), but the result is computed from
 * the vertices' own coordinates: a snapped corner is the parcel's vertex itself, or a point on the straight
 * segment between two of its vertices, exactly as the geometry library sees that edge.
 */
import type { LatLon } from "./types";

export type XY = readonly [number, number];

/** One ring of the parcel, as screen points and as the coordinates they came from (same length, same order). */
export interface SnapRing {
  xy: readonly XY[];
  ll: readonly LatLon[];
}

export interface Snap {
  kind: "corner" | "edge";
  ll: LatLon;
}

/** The parcel corner within `tolPx` of `p`, else the nearest point on an edge within `tolPx`, else null. */
export function snapCorner(p: XY, rings: readonly SnapRing[], tolPx: number): Snap | null {
  const dist = (x: number, y: number) => Math.hypot(x - p[0], y - p[1]);

  let corner: LatLon | null = null,
    cornerD = tolPx;
  for (const r of rings)
    for (let i = 0; i < r.xy.length; i++) {
      const d = dist(r.xy[i]![0], r.xy[i]![1]);
      if (d <= cornerD) [corner, cornerD] = [r.ll[i]!, d];
    }
  if (corner) return { kind: "corner", ll: corner };

  let edge: LatLon | null = null,
    edgeD = tolPx;
  for (const r of rings)
    for (let i = 0; i + 1 < r.xy.length; i++) {
      const [ax, ay] = r.xy[i]!,
        [bx, by] = r.xy[i + 1]!;
      const dx = bx - ax,
        dy = by - ay,
        len2 = dx * dx + dy * dy;
      if (len2 === 0) continue;
      const t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / len2));
      const d = dist(ax + t * dx, ay + t * dy);
      if (d > edgeD) continue;
      const A = r.ll[i]!,
        B = r.ll[i + 1]!;
      [edge, edgeD] = [[A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1])], d];
    }
  return edge ? { kind: "edge", ll: edge } : null;
}
