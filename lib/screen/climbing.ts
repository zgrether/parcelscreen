/**
 * Climbing (roadmap step 17, docs/plans/step-17-climbing.md §3): from where the driveway meets the road, the drive to
 * the nearest rope area (sport or trad) and the nearest bouldering area, from the curated climbing areas
 * (lib/screen/data/crags.json, baked into the places' `curated/` folder), and how many rope areas are within the hour.
 * One OSRM table of its own, as the paddling drive has (paddling.ts).
 */
import { distance } from "@turf/turf";
import { CancelledError } from "../http";
import { SCREEN_CONSTANTS } from "./config";
import { driveTable, type DriveDeps } from "./drive";
import { cellsWithin, isRopeArea, type BakedCrag, type PlacesSource } from "./placeData";
import type { ScreenResult } from "./types";
import type { LatLon } from "./util";

const K = SCREEN_CONSTANTS.climbing;

/** What didn't answer when the climbing areas or their table failed (a noResponse entry): the row is unknown. */
export const CLIMB_DRIVES = "Climbing area drive times";

export type Climbing = NonNullable<ScreenResult["climbing"]>;

const kmFrom = (from: LatLon, ll: LatLon): number =>
  distance([from[1], from[0]], [ll[1], ll[0]], { units: "kilometers" });

/**
 * The climbing areas to time: the climbing.ropePoints nearest rope areas and the climbing.boulderPoints nearest
 * bouldering areas within climbing.maxKm in a straight line, each once (an area with both can be in both lists).
 */
export function cragsToTime(from: LatLon, crags: readonly BakedCrag[]): BakedCrag[] {
  const near = crags
    .map((c) => ({ c, km: kmFrom(from, c.ll) }))
    .filter((x) => x.km <= K.maxKm)
    .sort((a, b) => a.km - b.km || (a.c.id < b.c.id ? -1 : 1))
    .map((x) => x.c);
  const rope = near.filter((c) => isRopeArea(c.types)).slice(0, K.ropePoints);
  const boulder = near.filter((c) => c.types.includes("bouldering")).slice(0, K.boulderPoints);
  return near.filter((c) => rope.includes(c) || boulder.includes(c));
}

/**
 * The row's figures from each area's drive (null where OSRM routed to none): the nearest rope area and bouldering
 * area by road, the rope areas within climbing.countWithinMin, and every area timed. Pure; the tests feed it.
 */
export function climbingFrom(
  crags: readonly BakedCrag[],
  legs: readonly ({ min: number; mi: number } | null)[],
): Climbing {
  let rope: Climbing["rope"] = null;
  let boulder: Climbing["boulder"] = null;
  let ropeWithin = 0;
  const timed: Climbing["timed"] = [];
  crags.forEach((c, i) => {
    const leg = legs[i];
    if (!leg) return;
    const id = c.id.replace(/^crag:/, "");
    timed.push({ id, min: leg.min });
    if (isRopeArea(c.types)) {
      if (leg.min <= K.countWithinMin) ropeWithin++;
      if (!rope || leg.min < rope.min) rope = { id, name: c.name, types: [...c.types], ...leg };
    }
    if (c.types.includes("bouldering") && (!boulder || leg.min < boulder.min))
      boulder = { id, name: c.name, ...leg };
  });
  return { rope, boulder, ropeWithin, timed };
}

/**
 * The climbing drives; undefined when the climbing areas or the table didn't answer (unknown, not "none"). With no
 * area within reach the figures are null and the count 0, and no table is asked.
 */
export async function climbingNear(
  from: LatLon,
  places: PlacesSource,
  deps: DriveDeps,
): Promise<Climbing | undefined> {
  try {
    const crags = (await places("curated", cellsWithin(from, K.maxKm), deps.signal)).filter(
      (p): p is BakedCrag => p.kind === "crag",
    );
    const toTime = cragsToTime(from, crags);
    if (!toTime.length) return climbingFrom([], []);
    const table = await driveTable(
      from,
      toTime.map((c) => c.ll),
      deps,
    );
    if (!table) return undefined;
    return climbingFrom(toTime, table.legs);
  } catch (e) {
    if (e instanceof CancelledError) throw e;
    return undefined;
  }
}
