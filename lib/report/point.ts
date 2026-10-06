/**
 * The evaluation point: where a result's December sun, dark sky and driveway were computed. The report
 * blocks take it as an input instead of looking it up, so the Phase 1 parcel page can pass the point stored
 * with a screen (step 14 plan §2). In Phase 0 it's always the result's own: `evaluateAt` returns a new result
 * with its own `focus`.
 */
import type { PartialScreenResult } from "../screen/types";
import type { LatLon } from "../screen/util";

export interface EvaluationPoint {
  ll: LatLon;
  /** "the largest house site", "site #2", "the existing house", … */
  label: string;
  elevFt: number | null;
  aboveFloorFt: number | null;
  slopeDeg: number | null;
  aspectDeg: number | null;
}

/** The point a result was evaluated at (`focus`, with `point`'s numbers); null before the sun step. */
export function evaluationPoint(r: PartialScreenResult): EvaluationPoint | null {
  const ll = r.point?.ll ?? r.focus?.ll;
  if (!ll) return null;
  return {
    ll,
    // The prototype's fallback when no focus was set (proto L1474).
    label: r.focus?.label ?? "the largest house site",
    elevFt: r.point?.elevFt ?? null,
    aboveFloorFt: r.point?.aboveFloorFt ?? null,
    slopeDeg: r.point?.slopeDeg ?? null,
    aspectDeg: r.point?.aspectDeg ?? null,
  };
}
