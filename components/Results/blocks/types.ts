/**
 * The report blocks' contract (step 14 plan §2). A block is a plain function of these props: no hooks, no
 * context, no browser APIs, no explorer or map state (ESLint enforces it for this folder). So the same block
 * renders in the explorer's panel, on the Phase 1 parcel page, and on the server for its PDF.
 */
import type { PartialScreenResult, ScreenResult, Step } from "@/lib/screen/types";
import type { LatLon } from "@/lib/screen/util";
import type { EvaluationPoint } from "@/lib/report/point";

export type { EvaluationPoint };
export { evaluationPoint } from "@/lib/report/point";

/**
 * Where the block is shown. Only the explorer's panel today; the parcel page and print add members (plan
 * §6), and every place a block depends on it is a check the compiler will point at.
 */
export type Variant = "panel";

export interface BlockProps {
  /** Partial while a run is in progress (no verdict yet). */
  result: ScreenResult | PartialScreenResult;
  point: EvaluationPoint | null;
  variant: Variant;
  /** Panel-only callbacks. Absent on the parcel page and in print, and then no control renders. */
  actions?: BlockActions;
  /** While a run is in progress (panel only): the step running now, and its progress message if it sends one. */
  running?: { step: Step; message?: string };
}

export interface BlockActions {
  /** Moves the evaluation point (step 15's pins use it). */
  evaluateAt?(ll: LatLon, label: string): void;
}

/** Whether sentences that point at the map are shown: only where a map sits beside the report. */
export const showsMap = (v: Variant): boolean => v === "panel";
