/**
 * Point and area markers (WF4, docs/plans/parcel-workflow.md §3.1): what the household marked on the parcel, a spring,
 * a septic permit, a cleared patch. They're kept with the parcel, never in the screen result: the card reads them when
 * it's drawn, by id, as it reads line names (lines.ts). Pure.
 *
 * Two reach the card today (owner, WF4 review): a Septic permit passes the Septic gate, and a Spring near the garden is
 * noted on the Garden row. The rest wait for their costs (VR4).
 */
import { booleanPointInPolygon, distance, point, pointToLineDistance, lineString, polygon } from "@turf/turf";
import type { LatLon } from "../geo/types";
import { lineNamesOf, type LineNames } from "./lines";

/** What a point marks (owner, WF4: a spring and a well apart, since they cost differently). */
export type PointKind = "spring" | "well" | "septic" | "building" | "power" | "campsite" | "gate" | "note";
/** What an area marks: a septic permit's field, or ground that's already cleared. */
export type AreaKind = "septic" | "clearing";
export type MarkKind = PointKind | AreaKind;

export const POINT_KINDS: readonly PointKind[] = [
  "spring",
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

/** What the card reads from the parcel besides its result: the drawn lines' names, and the markers. */
export interface Drawn {
  names: LineNames;
  marks: readonly Mark[];
}

/** The card's view of a parcel's markup (parcelStore's lines and markers): every name, and the markers. */
export const drawnOf = (
  markup: readonly ({ id: string; name: string } & ({ shape: "line" } | Mark))[],
): Drawn => ({
  names: lineNamesOf(markup),
  marks: markup.filter((m): m is typeof m & Mark => m.shape !== "line"),
});

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
