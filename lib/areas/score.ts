/**
 * Scoring an area for one person (step 13, docs/plans/step-13-area-catalog.md §4): their rubric grades each area-scale
 * factor at the area's median, by the card's own rule for that row; the fit letter is the parcel grade's arithmetic over
 * those rows; Musts become the share of the area's points that pass every area-scale limit; an area where under
 * areas.minMustShare pass isn't suggested. Display-time, pure: nothing about the person is stored with an area.
 */
import { SCREEN_CONSTANTS } from "../screen/config";
import { atLeast, atMost, gradedRows, parcelGrade } from "../rubric/grade";
import { thresholdStatus, MEASURE_UNIT } from "../rubric/musts";
import type { Letter, NamedRubric, RowKey, Rubric } from "../rubric/types";
import { weightsOf } from "../rubric/weights";
import type { AreaFile, Measure } from "./types";

const K = SCREEN_CONSTANTS.areas;

/** The factors graded at area scale (§1), in the card's order. */
export const AREA_FACTORS = [
  "elevation",
  "sky",
  "trails",
  "town",
  "hospital",
  "climate",
  "longView",
  "airport",
  "longTrail",
] as const satisfies readonly RowKey[];
export type AreaFactor = (typeof AREA_FACTORS)[number];

/** The measure a limit on each factor reads, per point (lib/rubric/musts.ts MEASURE_UNIT's units). */
export const LIMIT_MEASURE: Partial<Record<AreaFactor, Measure>> = {
  elevation: "elevFt",
  sky: "skyMag",
  trails: "trailheadMin",
  town: "groceryMin",
  hospital: "erMin",
  airport: "airportMin",
  longTrail: "longTrailMin",
};

type Values = Partial<Record<Measure, number | null>>;
const worse = (a: Letter, b: Letter): Letter => (a > b ? a : b);
const better = (a: Letter, b: Letter): Letter => (a < b ? a : b);

/** A factor's letter from an area's values, by its card row's rule (lib/report/card.ts); null when unmeasured. */
export function areaLetter(f: AreaFactor, v: Values, R: Rubric): Letter | null {
  const b = R.bands;
  const n = (m: Measure) => v[m] ?? null;
  switch (f) {
    case "elevation":
      return n("elevFt") === null ? null : atLeast(n("elevFt")!, b.elevationFt);
    case "sky":
      return n("skyMag") === null ? null : atLeast(n("skyMag")!, b.skyMag);
    case "hospital":
      return n("erMin") === null ? null : atMost(n("erMin")!, b.erMin);
    case "town":
      return n("groceryMin") === null ? null : atMost(n("groceryMin")!, b.groceryMin);
    case "airport":
      return n("airportMin") === null ? null : atMost(n("airportMin")!, b.airportMin);
    case "longTrail":
      return n("longTrailMin") === null ? null : atMost(n("longTrailMin")!, b.longTrailMin);
    case "longView":
      return n("viewOpenPct") === null ? null : atLeast(n("viewOpenPct")!, b.viewOpenPct);
    case "climate":
      return n("janLowF") === null || n("julHighF") === null
        ? null
        : worse(atLeast(n("janLowF")!, b.janLowF), atMost(n("julHighF")!, b.julHighF));
    case "trails": {
      // Adjoining open public land is an A; else the trailhead's drive, raised to at most B with open land near.
      const open = n("openLandFt");
      if (open !== null && open <= K.adjoinFt) return "A";
      const head = n("trailheadMin");
      if (head === null) return null;
      const byHead = atMost(head, b.trailheadMin);
      return open !== null && open <= b.openLandWithinFt ? better(byHead, "B") : byHead;
    }
  }
}

export interface AreaRow {
  key: AreaFactor;
  grade: Letter | null;
}

export interface AreaCard {
  id: string;
  rubric: NamedRubric;
  rows: AreaRow[];
  /** The weighted mean of the graded rows' points, as a parcel's; null when none is graded. */
  points: number | null;
  /** The fit letter. */
  grade: Letter | null;
  /** The fit letter with its sign: "B+", "B", "B−" (fitLabel). */
  fit: string | null;
  /** The person's limits on area-scale factors (the Musts with a threshold whose measure an area has). */
  limits: { factor: AreaFactor; threshold: number }[];
  /** The share of points passing every limit, 0–1; 1 when there are none. */
  mustShare: number;
  /** Points with a reading for every limit (the share's denominator). */
  sharePoints: number;
  /** Not suggested: under areas.minMustShare passes every limit. */
  suggestable: boolean;
}

/** The person's Musts that an area can measure: a limit on an area-scale factor. */
export function areaLimits(R: Rubric): AreaCard["limits"] {
  return R.musts
    .filter((m) => m.threshold !== undefined && (AREA_FACTORS as readonly string[]).includes(m.factor))
    .filter((m) => LIMIT_MEASURE[m.factor as AreaFactor] !== undefined)
    .map((m) => ({ factor: m.factor as AreaFactor, threshold: m.threshold! }));
}

/** One person's card for one area. */
export function areaCard(area: AreaFile, nr: NamedRubric): AreaCard {
  const R = nr.rubric;
  const rows = AREA_FACTORS.filter((f) => !R.wonts.includes(f)).map((key) => ({
    key,
    grade: areaLetter(key, area.medians, R),
  }));
  const graded = gradedRows(
    rows.map((r) => ({ ...r, label: r.key, detail: "" })),
    R,
  );
  const { points, grade } = parcelGrade(graded, R, weightsOf(R));
  const limits = areaLimits(R);
  let pass = 0;
  let counted = 0;
  area.points.ll.forEach((_, i) => {
    const statuses = limits.map((l) => {
      const m = LIMIT_MEASURE[l.factor]!;
      const value = area.points[m][i];
      return value === null || value === undefined
        ? "unknown"
        : thresholdStatus(
            { factor: l.factor, threshold: l.threshold },
            { value, unit: MEASURE_UNIT[l.factor]! },
          );
    });
    if (statuses.includes("unknown")) return;
    counted++;
    if (statuses.every((s) => s === "pass")) pass++;
  });
  const mustShare = !limits.length ? 1 : counted ? pass / counted : 0;
  return {
    id: area.id,
    rubric: nr,
    rows,
    points,
    grade,
    fit: fitLabel(points, R),
    limits,
    mustShare,
    sharePoints: limits.length ? counted : area.points.ll.length,
    suggestable: mustShare >= K.minMustShare,
  };
}

const LETTERS: readonly Letter[] = ["A", "B", "C", "D"];

/**
 * An area's fit with its sign (owner, #298 answers; areas only, never a parcel's grade): the letter the points reach,
 * "+" in the top areas.fitSign of that letter's band and "−" in the bottom one. A letter's band runs from its cutoff to
 * the next letter's (an A's, to A's points); an F has no sign. With the starting cutoffs (A from 3.5, B from 2.5, …)
 * a B+ is 3.17 to 3.5 and a B− is 2.5 to 2.83.
 */
export function fitLabel(points: number | null, R: Rubric): string | null {
  if (points === null) return null;
  const letter = atLeast(points, R.gradeCutoffs);
  const i = LETTERS.indexOf(letter);
  if (i < 0) return letter;
  const lo = R.gradeCutoffs[i]!;
  const hi = i === 0 ? R.points.A : R.gradeCutoffs[i - 1]!;
  const third = (hi - lo) * K.fitSign;
  return points >= hi - third ? `${letter}+` : points < lo + third ? `${letter}−` : letter;
}

/** The ranking (§4.4): suggestable first, then fit points, then Must share, then name. */
export function rankAreas(cards: readonly AreaCard[], names: ReadonlyMap<string, string>): AreaCard[] {
  return [...cards].sort(
    (a, b) =>
      Number(b.suggestable) - Number(a.suggestable) ||
      (b.points ?? -1) - (a.points ?? -1) ||
      b.mustShare - a.mustShare ||
      (names.get(a.id) ?? a.id).localeCompare(names.get(b.id) ?? b.id),
  );
}
