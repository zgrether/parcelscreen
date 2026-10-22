/**
 * Mud Creek's red-gate right-of-way (WF5), drawn as an easement carried on to 6273's boundary, as the line tool keeps
 * one: shared by the route-choice and Try it specs (step 12).
 */
import { bearing, destination, nearestPointOnLine, polygon, polygonToLine } from "@turf/turf";
import type { Feature, LineString } from "geojson";
import type { Page } from "@playwright/test";
import { loadFixture } from "../test/support/fixtures";
import roads from "../test/tools/driveway-validation.roads.json";
import { reload } from "./flow";

export const GRAYSON = "grayson-mud-creek-6273" as const;

/** The red gate's drive (the validation study's road C), carried on 5 m into 6273 at the nearest point, [lat, lon]. */
export function redGateToTheBoundary(): [number, number][] {
  const line = (roads.c.coordinates as [number, number][]).map(([lon, lat]): [number, number] => [lat, lon]);
  const end = line[line.length - 1]!;
  const ring = polygonToLine(
    polygon(loadFixture(GRAYSON).input.polygon.geometry.coordinates as number[][][]),
  ) as Feature<LineString>;
  const np = nearestPointOnLine(ring, [end[1], end[0]]).geometry.coordinates;
  const [lon, lat] = destination(np, 5, bearing([end[1], end[0]], np), { units: "meters" }).geometry
    .coordinates;
  return [...line, [lat!, lon!]];
}

/** The parcel open, with the red-gate easement drawn (as the line tool keeps one), named "Red gate". */
export async function withRedGate(page: Page): Promise<void> {
  await page.evaluate(async (line) => {
    const s = JSON.parse(window.__psKv!.getItem("ps.parcels")!) as {
      open: { key: string; markup: unknown[] };
      built: { key: string; markup: unknown[] }[];
    };
    const m = {
      id: "red-gate",
      name: "Red gate",
      shape: "line",
      kind: "easement",
      condition: "uncleared",
      line,
      widthFt: 30,
      note: "listing's 'road right of way into property', unverified",
      recordedIn: "",
      at: "2026-10-15T12:00:00.000Z",
    };
    s.open.markup = [m];
    for (const b of s.built) if (b.key === s.open.key) b.markup = [m];
    await window.__psKv!.setItem("ps.parcels", JSON.stringify(s));
  }, redGateToTheBoundary());
  await reload(page);
}
