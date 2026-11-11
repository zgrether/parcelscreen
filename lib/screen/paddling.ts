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

/**
 * The launches, nearest first, less any within paddling.sameWithinM of a nearer one: one put-in mapped twice (a fifth
 * of the bake's launches have another that close) would list the same river access twice.
 */
export function distinctLaunches<T extends { l: BakedLaunch; km: number }>(nearestFirst: readonly T[]): T[] {
  const kept: T[] = [];
  for (const x of nearestFirst)
    if (!kept.some((k) => kmFrom(k.l.ll, x.l.ll) * 1000 <= K.sameWithinM)) kept.push(x);
  return kept;
}

/** The launches within paddling.maxKm, both folders (OSM's and USFS's), nearest first in a straight line. */
async function launchesNear(from: LatLon, places: PlacesSource, signal?: AbortSignal) {
  const cells = cellsWithin(from, K.maxKm);
  const [osm, official] = await Promise.all([
    places("osm", cells, signal),
    places("official", cells, signal),
  ]);
  return distinctLaunches(
    [...osm, ...official]
      .filter((p): p is BakedLaunch => p.kind === "launch")
      .map((l) => ({ l, km: kmFrom(from, l.ll) }))
      .filter((x) => x.km <= K.maxKm)
      .sort((a, b) => a.km - b.km),
  );
}

/**
 * Each lake's quickest launch, quickest first (a tie to the nearer, as timed): the first is the row's, the rest are the
 * other lakes listed (existing-house plan §2b). A launch with no named water is a lake of its own.
 */
export function quickestByLake<T extends { name: string; water: string | null; min: number }>(
  timed: readonly T[],
): T[] {
  // Each launch's place in the timed list breaks a tie, as the row's single pick always did (the nearer launch).
  const best = new Map<string, { t: T; i: number }>();
  timed.forEach((t, i) => {
    const key = t.water ?? `launch:${t.name}`;
    const was = best.get(key);
    if (!was || t.min < was.t.min) best.set(key, { t, i });
  });
  return [...best.values()].sort((a, b) => a.t.min - b.t.min || a.i - b.i).map((x) => x.t);
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
    let timed: NonNullable<Paddling["flat"]>[] = [];
    if (flat.length) {
      const table = await driveTable(
        from,
        flat.map((x) => x.l.ll),
        deps,
      );
      if (!table) return undefined;
      timed = table.legs.flatMap((leg, i) => {
        const l = flat[i]!.l;
        return leg ? [{ name: l.name, water: l.waterName ?? null, ...leg }] : [];
      });
    }
    const [best = null, ...others] = quickestByLake(timed);
    return { flat: best, others: others.slice(0, K.otherLakes), rivers, pond: pondToPaddle(ponds) };
  } catch (e) {
    if (e instanceof CancelledError) throw e;
    return undefined;
  }
}
