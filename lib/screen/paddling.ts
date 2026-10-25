/**
 * Paddling (roadmap step 14d, docs/plans/step-14d-places.md §4.1): the drive from where the driveway meets the road to
 * the nearest flatwater launch (a lake or reservoir, classified at bake time: lib/places/bake.ts), from the baked places.
 * One OSRM table of its own, as the long-trail drive has (longTrail.ts). River put-ins and a pond on the parcel are
 * listed, never timed and never graded.
 */
import { distance } from "@turf/turf";
import { CancelledError } from "../http";
import { SCREEN_CONSTANTS } from "./config";
import { driveTable, type DriveDeps } from "./drive";
import { cellsWithin, type BakedLaunch, type PlacesSource } from "./placeData";
import type { Ponds } from "./streams";
import type { ScreenResult } from "./types";
import type { LatLon } from "./util";

const K = SCREEN_CONSTANTS.paddling;

/** What didn't answer when the launches or their table failed (a noResponse entry): the row is unknown, not "none". */
export const PADDLE_DRIVES = "Paddle launch drive times";

export type Paddling = NonNullable<ScreenResult["paddling"]>;

const kmFrom = (from: LatLon, ll: LatLon): number =>
  distance([from[1], from[0]], [ll[1], ll[0]], { units: "kilometers" });

/** The launches within paddling.maxKm, both folders (OSM's and USFS's), nearest first in a straight line. */
async function launchesNear(from: LatLon, places: PlacesSource, signal?: AbortSignal) {
  const cells = cellsWithin(from, K.maxKm);
  const [osm, official] = await Promise.all([
    places("osm", cells, signal),
    places("official", cells, signal),
  ]);
  return [...osm, ...official]
    .filter((p): p is BakedLaunch => p.kind === "launch")
    .map((l) => ({ l, km: kmFrom(from, l.ll) }))
    .filter((x) => x.km <= K.maxKm)
    .sort((a, b) => a.km - b.km);
}

/** A pond of at least paddling.pondMinAc reaching inside the parcel: its acres in all, and its name if it has one. */
export function pondToPaddle(ponds: Ponds | undefined): Paddling["pond"] {
  if (!ponds || !ponds.count || ponds.acres < K.pondMinAc) return null;
  return { acres: +ponds.acres.toFixed(1), name: ponds.names[0] ?? null };
}

/**
 * The nearest flatwater launch by road, the river put-ins near, and the pond; undefined when the launches or the table
 * didn't answer (unknown, not "none"). `flat` is null when no flatwater launch is within reach or OSRM routes to none.
 */
export async function paddlingNear(
  from: LatLon,
  ponds: Ponds | undefined,
  places: PlacesSource,
  deps: DriveDeps,
): Promise<Paddling | undefined> {
  try {
    const near = await launchesNear(from, places, deps.signal);
    const rivers = near
      .filter((x) => x.l.water === "river" && x.km <= K.riverKm)
      .slice(0, K.rivers)
      .map((x) => ({ name: x.l.name, river: x.l.waterName ?? null, km: +x.km.toFixed(1) }));
    const flat = near.filter((x) => x.l.water === "flat").slice(0, K.points);
    let best: Paddling["flat"] = null;
    if (flat.length) {
      const table = await driveTable(
        from,
        flat.map((x) => x.l.ll),
        deps,
      );
      if (!table) return undefined;
      table.legs.forEach((leg, i) => {
        const l = flat[i]!.l;
        if (leg && (!best || leg.min < best.min)) best = { name: l.name, water: l.waterName ?? null, ...leg };
      });
    }
    return { flat: best, rivers, pond: pondToPaddle(ponds) };
  } catch (e) {
    if (e instanceof CancelledError) throw e;
    return undefined;
  }
}
