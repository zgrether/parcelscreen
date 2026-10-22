/**
 * Musts with thresholds (workflow-review.md, Rubric algorithm 2): a minimum on a ranked factor, in the row's own unit
 * ("Elevation at least 3,000 ft", "an ER within 30 min"). A dealbreaker gate is a Must without a threshold: its own
 * rule decides (lib/report/card.ts). The default rubric has no threshold Musts; step 3's editor and step 4's interview
 * write them.
 */
import type { MustCard, RowKey } from "./types";

/** What a row measured, in the unit its band grades: the number a threshold is compared with. */
export interface Measure {
  value: number;
  unit: string;
}

/** Which way a row's band runs: a bigger number is better (at least), or worse (at most); null for a letter-only row. */
export const BAND_DIRECTION: Record<RowKey, "atLeast" | "atMost" | null> = {
  elevation: "atLeast",
  homesite: "atLeast",
  sky: "atLeast",
  room: "atLeast",
  driveway: "atMost",
  trails: "atMost",
  town: "atMost",
  hospital: "atMost",
  garden: "atLeast",
  // Step 10: no threshold; a Must on it reads the budgets (lib/report/card.ts).
  budget: null,
};

/** The unit a threshold on each row is in; the row's measure must carry the same one, else the Must is unknown. */
export const MEASURE_UNIT: Record<RowKey, string | null> = {
  elevation: "ft",
  homesite: "h",
  sky: "mag",
  room: "x",
  driveway: "%",
  trails: "min",
  town: "min",
  hospital: "min",
  garden: "ac",
  budget: null,
};

export type MustStatus = "pass" | "fail" | "unknown";

/**
 * A threshold Must's outcome: pass when the measure is on the right side of the threshold (at least it, or at most
 * it, by the row's direction); fail otherwise; unknown when the row has no measure, or one in another unit (a trails
 * row graded by straight-line miles when the drives didn't load), or the factor has no threshold or no direction.
 */
export function thresholdStatus(must: MustCard, measure: Measure | undefined): MustStatus {
  if (must.threshold === undefined) return "unknown";
  const key = must.factor as RowKey;
  const direction = BAND_DIRECTION[key] ?? null;
  const unit = MEASURE_UNIT[key] ?? null;
  if (!direction || !unit || !measure || measure.unit !== unit) return "unknown";
  const ok = direction === "atLeast" ? measure.value >= must.threshold : measure.value <= must.threshold;
  return ok ? "pass" : "fail";
}

/** "at least 3,000 ft" / "at most 30 min": a threshold in words, for the reason line. */
export function thresholdWords(must: MustCard, fmt: (n: number) => string): string {
  const key = must.factor as RowKey;
  const direction = BAND_DIRECTION[key] === "atMost" ? "at most" : "at least";
  return `${direction} ${fmt(must.threshold ?? 0)} ${MEASURE_UNIT[key] ?? ""}`.trim();
}
