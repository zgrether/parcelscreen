/**
 * Bike to a long trail (step 11, docs/plans/step-11-new-data.md §2.6): the drive from where the driveway meets the road
 * to the nearest access point of a long rail-trail or greenway (data/longTrails.ts). One request to OSRM's table
 * service of its own, so the drive step's existing request (and its recording) stays as it was.
 */
import { distance } from "@turf/turf";
import { CancelledError } from "../http";
import { SCREEN_CONSTANTS } from "./config";
import { LONG_TRAILS } from "./data/longTrails";
import { driveTable, type DriveDeps } from "./drive";
import type { LatLon } from "./util";

const K = SCREEN_CONSTANTS.longTrail;

/** What didn't answer when the long-trail table failed (a noResponse entry): the row is unknown, not "none". */
export const LONG_TRAIL_DRIVES = "Long-trail drive times";

/** The drive to the nearest access point: its trail, the access point, minutes and miles. */
export interface LongTrailDrive {
  trail: string;
  point: string;
  min: number;
  mi: number;
}

/** The access points within reach, nearest first in a straight line, at most longTrail.points of them. */
export function accessPointsNear(from: LatLon): { trail: string; point: string; ll: LatLon }[] {
  return LONG_TRAILS.flatMap((t) =>
    t.points.map((p) => ({
      trail: t.name,
      point: p.name,
      ll: [p.lat, p.lon] as LatLon,
      km: distance([from[1], from[0]], [p.lon, p.lat], { units: "kilometers" }),
    })),
  )
    .filter((p) => p.km <= K.maxKm)
    .sort((a, b) => a.km - b.km)
    .slice(0, K.points)
    .map(({ km: _km, ...p }) => p);
}

/**
 * The nearest access point by road; null when none is within reach or OSRM routes to none; undefined when the table
 * didn't answer (unknown, not "none").
 */
export async function longTrailDrive(
  from: LatLon,
  deps: DriveDeps,
): Promise<LongTrailDrive | null | undefined> {
  const near = accessPointsNear(from);
  if (!near.length) return null;
  try {
    const table = await driveTable(
      from,
      near.map((p) => p.ll),
      deps,
    );
    if (!table) return undefined;
    let best: LongTrailDrive | null = null;
    table.legs.forEach((leg, i) => {
      if (leg && (!best || leg.min < best.min))
        best = { trail: near[i]!.trail, point: near[i]!.point, ...leg };
    });
    return best;
  } catch (e) {
    if (e instanceof CancelledError) throw e;
    return undefined;
  }
}
