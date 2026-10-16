/**
 * The drive behind the red gate on Mud Creek Rd beside Grayson 6273 (follow-up 34; owner, 2026-10-12), drawn as an
 * easement: the driveway validation study's road C, 872 ft from the gate to the neighbour's pad, 132 ft short of 6273's
 * boundary (docs/studies/driveway-validation.md).
 */
import { bearing, destination, nearestPointOnLine, polygon, polygonToLine } from "@turf/turf";
import type { Feature, LineString } from "geojson";
import input from "../fixtures/grayson-mud-creek-6273/input.json";
import roads from "../tools/driveway-validation.roads.json";
import type { DrawnInput } from "@/lib/screen/types";
import type { LatLon } from "@/lib/screen/util";

export const redGate: DrawnInput = {
  id: "red-gate",
  kind: "easement",
  line: (roads.c.coordinates as [number, number][]).map(([lon, lat]) => [lat, lon]),
  widthFt: 30,
};

/** The same line carried on from the pad to 5 m inside 6273's boundary, at the nearest point: had the right-of-way gone on. */
export function toTheBoundary(l: DrawnInput): DrawnInput {
  const end = l.line[l.line.length - 1]!;
  const ring = polygonToLine(
    polygon(input.polygon.geometry.coordinates as number[][][]),
  ) as Feature<LineString>;
  const np = nearestPointOnLine(ring, [end[1], end[0]]).geometry.coordinates;
  const [lon, lat] = destination(np, 5, bearing([end[1], end[0]], np), { units: "meters" }).geometry
    .coordinates;
  return { ...l, line: [...l.line, [lat!, lon!] as LatLon] };
}
