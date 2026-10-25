/**
 * A trailhead's parking (follow-up 54, by follow-up 39's rule; owner, #81 review): an OpenStreetMap amenity=parking
 * within drive.parkingWithinM of the trailhead, tagged for it: its name matching the trailhead's after follow-up 24's
 * normalisation, or a trailhead or hiking tag. The drive goes there when one exists, else to the trailhead point. One
 * Overpass query for all the candidates, through the mirrors the places step uses (in the browser, the app's
 * /api/places/overpass route).
 */
import { distance } from "@turf/turf";
import { z } from "zod";
import type { HttpClient } from "../http";
import { SCREEN_CONSTANTS } from "./config";
import { OverpassMirrors, type PlacesDeps } from "./places";
import { normalizeTrailheadName } from "./trailheads";
import type { LatLon } from "./util";

const K = SCREEN_CONSTANTS.drive;

export interface ParkingLot {
  ll: LatLon;
  tags: Record<string, string>;
}

const ElementSchema = z.looseObject({
  lat: z.number().optional(),
  lon: z.number().optional(),
  center: z.strictObject({ lat: z.number(), lon: z.number() }).optional(),
  tags: z.record(z.string(), z.string()).optional(),
});
const AnswerSchema = z.looseObject({ elements: z.array(z.unknown()) });

/** The query: every amenity=parking (node, way or relation) within the radius of any of the points. */
export function parkingQuery(points: readonly LatLon[], radiusM: number = K.parkingWithinM): string {
  const near = points.map(
    ([lat, lon]) => `nwr["amenity"="parking"](around:${radiusM},${lat.toFixed(6)},${lon.toFixed(6)});`,
  );
  return `[out:json][timeout:25];(${near.join("")});out center tags;`;
}

/** Overpass's answer as lots, each at its node or its way's centre; anything else in it is ignored. */
export function parseParking(json: unknown): ParkingLot[] {
  return AnswerSchema.parse(json).elements.flatMap((e) => {
    const p = ElementSchema.safeParse(e);
    if (!p.success) return [];
    const at =
      p.data.center ??
      (p.data.lat != null && p.data.lon != null ? { lat: p.data.lat, lon: p.data.lon } : null);
    return at ? [{ ll: [at.lat, at.lon] as LatLon, tags: p.data.tags ?? {} }] : [];
  });
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

/** Node and the tests: straight to the mirrors. The worker passes its own (the app's route). */
export function parkingFromMirrors(
  deps: PlacesDeps,
  mirrors: OverpassMirrors = new OverpassMirrors(),
): ParkingSource {
  return async (points) => parseParking({ elements: await mirrors.query(parkingQuery(points), deps) });
}

/** The browser's query, through the app's route (no Overpass mirror answers a browser; see places.ts). */
export function parkingViaRoute(routeUrl: string, http: HttpClient): ParkingSource {
  return async (points, signal) => {
    const pts = points.map(([lat, lon]) => `${lat.toFixed(6)},${lon.toFixed(6)}`).join(";");
    const r = await http.fetch(`${routeUrl}?kind=parking&pts=${pts}`, {
      timeoutMs: SCREEN_CONSTANTS.near.overpassRouteTimeoutMs,
      ...(signal ? { signal } : {}),
    });
    const j = (await r.json().catch(() => ({}))) as { elements?: unknown[]; error?: string };
    if (!r.ok) throw new Error(j.error || `Overpass route ${r.status}`);
    return parseParking({ elements: j.elements ?? [] });
  };
}
