// Small numeric helpers used across the pipeline. Ported verbatim (proto L912, L1025).
export { M2FT, M2_PER_ACRE, type LatLon } from "../geo/types";

/** A breakpoint curve: [[x, y], …] with x ascending. */
export type Curve = readonly (readonly [number, number])[];

/** Piecewise-linear interpolation over a curve, clamped to its end values. */
export function lerp(x: number, pts: Curve): number {
  if (x <= pts[0]![0]) return pts[0]![1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i]![0]) {
      const [x0, y0] = pts[i - 1]!,
        [x1, y1] = pts[i]!;
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return pts[pts.length - 1]![1];
}

export const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

/** The prototype's quantile: the element at floor(p·n) of an ascending array (no interpolation). */
export function quantile(sortedAsc: ArrayLike<number>, p: number): number {
  return sortedAsc[Math.min(sortedAsc.length - 1, Math.floor(p * sortedAsc.length))]!;
}
