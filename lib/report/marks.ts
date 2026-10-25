/**
 * Point and area markers (WF4, docs/plans/parcel-workflow.md §3.1): what the household marked on the parcel, a spring,
 * a septic permit, a cleared patch. They're kept with the parcel, never in the screen result: the card reads them when
 * it's drawn, by id, as it reads line names (lines.ts). Pure.
 *
 * Two reach the card today (owner, WF4 review): a Septic permit passes the Septic gate, and a Spring near the garden is
 * noted on the Garden row. The rest wait for their costs (VR4).
 */
import { booleanPointInPolygon, distance, point, pointToLineDistance, lineString, polygon } from "@turf/turf";
import type { Paving, Rates } from "../config/costs";
import type { LatLon } from "../geo/types";
import type { Adjustment } from "./adjust";
import type { CostLine } from "./cost";
import { lineNamesOf, type LineNames } from "./lines";

/**
 * What a point marks (owner, WF4: a spring and a well apart, since they cost differently). A stream (step 14, plan §3.2)
 * is water for Garden, orchard, animals only: it reaches neither the card nor the cost.
 */
export type PointKind =
  "spring" | "stream" | "well" | "septic" | "building" | "power" | "campsite" | "gate" | "note";
/** What an area marks: a septic permit's field, or ground that's already cleared. */
export type AreaKind = "septic" | "clearing";
export type MarkKind = PointKind | AreaKind;

export const POINT_KINDS: readonly PointKind[] = [
  "spring",
  "stream",
  "well",
  "septic",
  "building",
  "power",
  "campsite",
  "gate",
  "note",
];
export const AREA_KINDS: readonly AreaKind[] = ["septic", "clearing"];

/** A septic permit's system class, as typed from the permit (stored now; VR4 prices it). */
export type SepticClass = "conventional" | "modified" | "alternative";
export const SEPTIC_CLASSES: readonly SepticClass[] = ["conventional", "modified", "alternative"];

/** A flood letter's kind: an elevation certificate, or FEMA's Letter of Map Amendment. */
export type FloodLetter = "elevation" | "loma";
export const FLOOD_LETTERS: readonly FloodLetter[] = ["elevation", "loma"];

/**
 * J-5's marks that aren't places (the septic permit and a recorded easement are drawn on the map, and stay so):
 *   - a flood letter, which passes the Floodplain Must;
 *   - service confirmed at the address (a provider's letter, or a service already there): internet settles Satellite
 *     internet, and power the cost's run to the site.
 * Each with when it was marked.
 */
export interface Facts {
  floodLetter?: { kind: FloodLetter; at: string };
  service?: { power: boolean; internet: boolean; at: string };
}

/** A point marker: one place, [lat, lon]. */
export interface PointMark {
  id: string;
  shape: "point";
  kind: PointKind;
  ll: LatLon;
}

/** An area marker: its corners, [lat, lon], at least three, not closed. */
export interface AreaMark {
  id: string;
  shape: "area";
  kind: AreaKind;
  ring: LatLon[];
}

export type Mark = PointMark | AreaMark;

/**
 * What the card reads from the parcel besides its result: the drawn lines' names, the markers, the line chosen as the
 * driveway (WF5, by id; null or absent for the app's pick), and where each easement is recorded, as typed (WF5).
 */
export interface Drawn {
  names: LineNames;
  /** With a septic permit's class, as typed (the cost to enjoy reads it, step 10). */
  marks: readonly (Mark & { septicClass?: SepticClass | null })[];
  driveway?: string | null;
  records?: ReadonlyMap<string, string>;
  /**
   * What the cost to enjoy reads besides the result and the marks (step 10, lib/report/cost.ts): the lines with their
   * condition, the asking price and the rates in use. Absent: the cost isn't priced, and Within budget isn't graded.
   */
  cost?: { lines: readonly CostLine[]; askingPrice: number | null; rates: Rates; paving?: Paving };
  /**
   * Each person's adjustments on this parcel (step 12), by the id of the rubric that grades them: MINE for the viewer's
   * own, a member's profile id for theirs. A card reads only its own rubric's.
   */
  adjust?: ReadonlyMap<string, readonly Adjustment[]>;
  /** The parcel's facts (J-5): a flood letter, service confirmed. */
  facts?: Facts;
}

/** Appended to the Floodplain Must's reason when a flood letter is marked (J-5, UX part 2 PR 3c; rule 7). */
export const floodLetterOnFile = (kind: FloodLetter): string =>
  `${kind === "loma" ? "a Letter of Map Amendment (LOMA)" : "an elevation certificate"} is on file (your mark): get a copy`;

/** Appended to Satellite internet when internet service is confirmed at the address (J-5; rule 7). */
export const INTERNET_CONFIRMED = "internet service is confirmed at the address (your mark)";

/**
 * The card's view of a parcel (parcelStore's lines and markers, and its driveway choice): every name, the markers, the
 * choice, and each line's "Recorded in" when it says something.
 */
export const drawnOf = (
  markup: readonly ({ id: string; name: string } & (DrawnLineMarkup | Mark))[],
  driveway: string | null = null,
  /** The asking price and the rates in use (step 10): given, the card prices the cost to enjoy. */
  cost?: { askingPrice: number | null; rates: Rates; paving?: Paving },
  /** Each person's adjustments on this parcel, by rubric id (step 12): given, each card applies its own. */
  adjust?: ReadonlyMap<string, readonly Adjustment[]>,
  /** The parcel's facts (J-5): what a document settles, for every member. */
  facts?: Facts,
): Drawn => ({
  ...(adjust?.size ? { adjust } : {}),
  ...(facts && (facts.floodLetter || facts.service) ? { facts } : {}),
  names: lineNamesOf(markup),
  marks: markup.filter((m): m is typeof m & Mark => m.shape !== "line"),
  driveway,
  records: new Map(
    markup.flatMap((m) => (m.shape === "line" && m.recordedIn?.trim() ? [[m.id, m.recordedIn.trim()]] : [])),
  ),
  ...(cost
    ? {
        cost: {
          ...cost,
          lines: markup.flatMap((m): CostLine[] =>
            m.shape === "line" && m.kind && m.condition && m.line
              ? [
                  {
                    id: m.id,
                    kind: m.kind,
                    condition: m.condition,
                    line: m.line,
                    recordedIn: m.recordedIn ?? "",
                  },
                ]
              : [],
          ),
        },
      }
    : {}),
});

/** A drawn line as the parcel keeps it: the card reads its "recorded in", the cost its kind, condition and points. */
interface DrawnLineMarkup {
  shape: "line";
  recordedIn?: string;
  kind?: CostLine["kind"];
  condition?: CostLine["condition"];
  line?: readonly LatLon[];
}

const xy = ([lat, lon]: LatLon): [number, number] => [lon, lat];

/** The area as a closed GeoJSON polygon. */
export const areaPolygon = (ring: readonly LatLon[]) => polygon([[...ring.map(xy), xy(ring[0]!)]]);

/** How far a marker is from a place, ft: to a point, or to an area's nearest edge (0 inside it). */
export function feetTo(m: Mark, ll: LatLon): number {
  const p = point(xy(ll));
  if (m.shape === "point") return distance(p, point(xy(m.ll)), { units: "feet" });
  if (booleanPointInPolygon(p, areaPolygon(m.ring))) return 0;
  return pointToLineDistance(p, lineString([...m.ring.map(xy), xy(m.ring[0]!)]), { units: "feet" });
}

/** The nearest of these markers to a place, ft; null when there are none. */
export const nearestFt = (marks: readonly Mark[], ll: LatLon): number | null =>
  marks.length ? Math.min(...marks.map((m) => feetTo(m, ll))) : null;

/** Appended to the Septic gate's reason when a permit is marked (owner, #128; rule 7). */
export const PERMIT_ON_FILE =
  "a septic permit is on file (your marker): get a copy, and check it hasn't expired";

/** Appended when the nearest permit is farther from the build site than K.marks.permitFarFt (owner, #128; rule 7). */
export const permitFar = (ft: number, from: string): string =>
  `the permit is ${Math.round(ft).toLocaleString("en-US")} ft from ${from}; it covers the spot that was tested`;

/** Appended to the Garden row when a spring is marked near the garden it names (owner, #128; rule 7). */
export const SPRING_MARKED = "a spring is marked (your marker)";
