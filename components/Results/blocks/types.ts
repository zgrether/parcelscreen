/**
 * The report blocks' contract (step 14 plan §2). A block is a plain function of these props: no hooks, no
 * context, no browser APIs, no explorer or map state (ESLint enforces it for this folder). So the same block
 * renders in the explorer's panel, on the Phase 1 parcel page, and on the server for its PDF.
 */
import type { PartialScreenResult, ScreenResult, Step } from "@/lib/screen/types";
import type { LatLon } from "@/lib/screen/util";
import type { LineNames } from "@/lib/report/lines";
import type { EvaluationPoint } from "@/lib/report/point";

export type { EvaluationPoint };
export { evaluationPoint } from "@/lib/report/point";

/**
 * Where the block is shown: the explorer's panel, or the report card export's print page (step 9). The parcel page
 * would add a member (plan §6); every place a block depends on it is a check the compiler will point at.
 */
export type Variant = "panel" | "print";

export interface BlockProps {
  /** Partial while a run is in progress (no verdict yet). */
  result: ScreenResult | PartialScreenResult;
  point: EvaluationPoint | null;
  variant: Variant;
  /** Panel-only callbacks. Absent on the parcel page and in print, and then no control renders. */
  actions?: BlockActions;
  /** While a run is in progress (panel only): the step running now, and its progress message if it sends one. */
  running?: { step: Step; message?: string };
  /** The parcel's names for its drawn lines (owner, 2026-10-14); a line reads by its kind without them. */
  lineNames?: LineNames;
  /** The line the household chose as its driveway (WF5), by id; absent or null for the app's pick. */
  drivewayLine?: string | null;
}

export interface BlockActions {
  /** Moves the evaluation point (step 15's pins use it). */
  evaluateAt?(ll: LatLon, label: string): void;
}

/** Whether sentences that point at the map are shown: only where a map sits beside the report. */
export const showsMap = (v: Variant): boolean => v === "panel";
