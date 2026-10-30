/**
 * The rubric (docs/design/workflow-review.md, "Rubric algorithm"; docs/plans/step-1-profiles-grading.md §3.1): one
 * ranked list of preferences plus a short list of minimums. Pure data, graded at display time over a stored screen's
 * measurements (lib/report/card.ts); the engine never sees it, and a rubric change never asks for a re-screen.
 * Step 1 carries today's card as the default rubric (default.ts); step 3's editor and step 4's interview write others.
 */

export type Letter = "A" | "B" | "C" | "D" | "F";

/** The dealbreakers (the card's gates), in the card's order. */
export const GATE_KEYS = ["floodplain", "access", "easement", "septic"] as const;
export type GateKey = (typeof GATE_KEYS)[number];

/**
 * The graded rows, in the card's order. Within budget (step 10) is a row only in a rubric with budgets: it's never on
 * the starting list (default.ts), and a rubric without budgets neither ranks it nor lists it as Don't care.
 */
export const ROW_KEYS = [
  "elevation",
  "homesite",
  "sky",
  "room",
  "driveway",
  "trails",
  "town",
  // Step 11 (docs/plans/step-11-new-data.md §2.1): split from Town, which keeps the groceries.
  "hospital",
  "garden",
  // Step 11's new factors (plan §2): after the rows before them, so their order and ties stay as they were.
  "climate",
  "privacy",
  "longView",
  "airport",
  "longTrail",
  "internet",
  // Step 14d (docs/plans/step-14d-places.md §4.2): after step 11's, for the same reason.
  "paddling",
  // Step 17 (docs/plans/step-17-climbing.md §4): after Paddling, the same way.
  "climbing",
  "budget",
] as const;
export type RowKey = (typeof ROW_KEYS)[number];

export type Factor = GateKey | RowKey;

/**
 * The interview's budgets (question 13; step 10): the most the person would spend to be ready to camp and ready to
 * build, all in, in dollars. Null where not given.
 */
export interface Budgets {
  camp: number | null;
  build: number | null;
}

/**
 * Each row's cutoffs, today's `card.rows` (lib/screen/config.ts): the bands a measurement is graded on, best first
 * (A's edge, B's, C's, D's). The rules that read them are the card's row functions.
 */
export interface Bands {
  elevationFt: number[];
  skyMag: number[];
  roomX: number[];
  trailheadKm: number[];
  trailheadMin: number[];
  openLandWithinFt: number;
  erMin: number[];
  groceryMin: number[];
  gardenAc: number[];
  /** The Driveway row's steepest grade, in %, at most (step 7). */
  drivewayPct: number[];
  /** Step 11: Climate's January mean low at the site, in °F, at least. */
  janLowF: number[];
  /** Step 11: Climate's July mean high at the site, in °F, at most. */
  julHighF: number[];
  /** Step 11: Privacy's nearest house, in ft, at least. */
  privacyFt: number[];
  /** Step 11: Privacy's houses in sight within a mile, at most. */
  privacySight: number[];
  /** Step 11: Long view's share of the horizon open past 3 mi, in %, at least. */
  viewOpenPct: number[];
  /** Step 11: Airport's drive to the nearest airport on Settings' list, in minutes, at most. */
  airportMin: number[];
  /** Step 11: Bike to a long trail's drive to the nearest access point, in minutes, at most. */
  longTrailMin: number[];
  /** Step 11: Internet's dish spot, the clear share of its view cone, in %, at least. */
  dishClearPct: number[];
  /** Step 14d: Paddling's drive to the nearest flatwater launch, in minutes, at most. */
  paddleMin: number[];
  /** Step 17: Climbing's drive to the nearest rope area (sport or trad), in minutes, at most. */
  climbMin: number[];
}

/**
 * A Must: a dealbreaker gate (no threshold: the gate's own rule decides), or a ranked factor's minimum, a threshold in
 * the row's own unit (musts.ts). A factor can hold a Must card and a ranked card at once ("at least 3,000 ft" gates,
 * "higher is better" ranks).
 */
export interface MustCard {
  factor: Factor;
  threshold?: number;
}

/** A ranked card: Should or Could, in rank order (the first is rank 1). */
export interface RankedCard {
  factor: RowKey;
  tier: "should" | "could";
}

/** Explicit weights (today's, summing to 100), or rank-sum from the ranked cards (weights.ts). */
export type Weights = { mode: "explicit"; of: Record<RowKey, number> } | { mode: "rankSum" };

export interface Rubric {
  version: 1;
  musts: MustCard[];
  ranked: RankedCard[];
  /** Left out of the grade and hidden from the card. */
  wonts: RowKey[];
  bands: Bands;
  weights: Weights;
  /** The points a letter earns (A 4 … F 0): the parcel's score is their weighted mean over the graded rows. */
  points: Record<Letter, number>;
  /** The score's A, B, C and D lower edges, best first; below the last, an F. */
  gradeCutoffs: number[];
  /** Contender from this score with at most this many warnings; Pass below `pass` or with a failed Must. */
  verdict: { contender: number; pass: number; contenderMaxWarns: number };
  /**
   * Step 10: the budgets the Within budget card grades against. Absent on a rubric made without them (saved before
   * step 10, or the starting list): no budget row.
   */
  budgets?: Budgets;
}

/** The id of a profile's own rubric (lib/client/rubrics.ts): the first choice everywhere. */
export const MINE = "mine";

/** A rubric with its identity: whose it is, for the card's switch and the list's columns. */
export interface NamedRubric {
  id: string;
  name: string;
  rubric: Rubric;
}
