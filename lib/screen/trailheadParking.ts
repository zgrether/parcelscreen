/**
 * A trailhead's parking (follow-up 54, by follow-up 39's rule; owner, #81 review): an OpenStreetMap amenity=parking
 * within drive.parkingWithinM of the trailhead, tagged for it: its name matching the trailhead's after follow-up 24's
 * normalisation, or a trailhead or hiking tag. The drive goes there when one exists, else to the trailhead point.
 * Since step 14d the lots come from the baked places (every lot within drive.parkingWithinM of a baked trailhead,
 * lib/places/bake.ts, which asks Overpass with `parkingQuery`), not from an Overpass query per grade.
 */
import { distance } from "@turf/turf";
import { SCREEN_CONSTANTS } from "./config";
import { cellsWithin, type PlacesSource } from "./placeData";
import { normalizeTrailheadName } from "./trailheads";
import type { LatLon } from "./util";

const K = SCREEN_CONSTANTS.drive;

export interface ParkingLot {
  ll: LatLon;
  tags: Record<string, string>;
}

/** The query (the bake's, lib/places/bake.ts): every amenity=parking (node, way or relation) within the radius of any of the points. */
export function parkingQuery(points: readonly LatLon[], radiusM: number = K.parkingWithinM): string {
  const near = points.map(
    ([lat, lon]) => `nwr["amenity"="parking"](around:${radiusM},${lat.toFixed(6)},${lon.toFixed(6)});`,
  );
  return `[out:json][timeout:25];(${near.join("")});out center tags;`;
}

const TAGGED = /\b(trailhead|hiking)\b/i;

/** A tag other than the name says trailhead or hiking (the baked lots keep just this, lib/screen/placeData.ts). */
export function hikingTagged(tags: Record<string, string>): boolean {
  const { name: _name, ...rest } = tags;
  return Object.entries(rest).some(([k, v]) => TAGGED.test(k) || TAGGED.test(v));
}

/** The lot is tagged for this trailhead: by name (both normalised; one holding the other), or a trailhead/hiking tag. */
function taggedFor(name: string, lot: ParkingLot): boolean {
  const lotName = lot.tags.name;
  if (hikingTagged(lot.tags)) return true;
  if (!lotName) return false;
  const a = normalizeTrailheadName(name),
    b = normalizeTrailheadName(lotName);
  if (!a || !b) return false;
  const words = (s: string) => ` ${s} `;
  return words(a).includes(words(b)) || words(b).includes(words(a));
}

/** The trailhead's parking: the nearest lot within drive.parkingWithinM that's tagged for it; null when none is. */
export function parkingFor(
  trailhead: { name: string; ll: LatLon },
  lots: readonly ParkingLot[],
): LatLon | null {
  const [lat, lon] = trailhead.ll;
  const m = (l: ParkingLot) => distance([lon, lat], [l.ll[1], l.ll[0]], { units: "meters" });
  const best = lots
    .filter((l) => m(l) <= K.parkingWithinM && taggedFor(trailhead.name, l))
    .sort((a, b) => m(a) - m(b))[0];
  return best ? best.ll : null;
}

export type ParkingSource = (points: readonly LatLon[], signal?: AbortSignal) => Promise<ParkingLot[]>;

/** The baked lots near the points (the OSM cells within a kilometre of each), as the Overpass answer read. */
export function parkingFromPlaces(places: PlacesSource): ParkingSource {
  return async (points, signal) => {
    const cells = [...new Set(points.flatMap((p) => cellsWithin(p, 1)))];
    const lots = await places("osm", cells, signal);
    return lots.flatMap((l): ParkingLot[] =>
      l.kind === "parking"
        ? [
            {
              ll: l.ll,
              tags: { ...(l.name ? { name: l.name } : {}), ...(l.hiking ? { hiking: "yes" } : {}) },
            },
          ]
        : [],
    );
  };
}
