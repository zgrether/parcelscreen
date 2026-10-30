/**
 * The nine Tennessee counties with no lines on the state's public-use parcel layer: they keep their own assessment
 * systems (step 2 plan §6.4). Outlines from lib/geo/data/tn-own-records.json (`pnpm data:tn-counties`), simplified.
 *
 * The Tennessee counties mission (docs/plans/tn-counties.md): a county whose own parcel service the app asks
 * (`onlyCounty` in parcelFields.ts, Hamilton's) is asked only over that county's outline; over the others the map
 * names the county and offers Draw.
 */
import {
  bboxPolygon,
  booleanIntersects,
  booleanPointInPolygon,
  point,
  pointToPolygonDistance,
} from "@turf/turf";
import type { MultiPolygon, Polygon } from "geojson";
import data from "./data/tn-own-records.json";
import { fieldsFor } from "./parcelFields";
import type { LatLon } from "./types";

const COUNTIES = data.counties as unknown as Record<string, Polygon | MultiPolygon>;

/** The map's hint over a county with no parcel source; its Draw button sits beside it. */
export const ownRecordsHint = (county: string): string =>
  `No parcel lines in ${county} County: it keeps its own records. Draw a custom parcel?`;

/** Whether a hint is ownRecordsHint's, for any county. */
export const isOwnRecordsHint = (h: string): boolean =>
  h.startsWith("No parcel lines in ") &&
  h.endsWith(" County: it keeps its own records. Draw a custom parcel?");

/** The county the point is in, if it's one of the nine; null otherwise. */
export function ownRecordsCountyAt([lat, lon]: LatLon): string | null {
  const pt = point([lon, lat]);
  for (const [name, geo] of Object.entries(COUNTIES)) if (booleanPointInPolygon(pt, geo)) return name;
  return null;
}

/**
 * The county the point is in, if it's one of the nine and none of these services is its own: where the map has no
 * parcel source at all. Null otherwise.
 */
export function uncoveredCountyAt(ll: LatLon, serviceUrls: readonly string[]): string | null {
  const county = ownRecordsCountyAt(ll);
  return county && !serviceUrls.some((u) => fieldsFor(u).onlyCounty === county) ? county : null;
}

/**
 * The outlines are simplified to 0.001° (about 100 m), so a county's own service is asked this far outside its
 * outline too: a parcel just inside the true county line is never missed.
 */
const NEAR_M = 250;
const NEAR_DEG = 0.003;

/** Whether a service is asked about this point: always, unless it's a county's own and the point is outside it. */
export function servesPoint(serviceUrl: string, [lat, lon]: LatLon): boolean {
  const county = fieldsFor(serviceUrl).onlyCounty;
  const geo = county ? COUNTIES[county] : undefined;
  if (!geo) return true;
  const pt = point([lon, lat]);
  return booleanPointInPolygon(pt, geo) || pointToPolygonDistance(pt, geo, { units: "meters" }) <= NEAR_M;
}

/** Whether a service is asked about this box (a map tile): always, unless it's a county's own and the box misses it. */
export function servesBounds(
  serviceUrl: string,
  b: { west: number; south: number; east: number; north: number },
): boolean {
  const county = fieldsFor(serviceUrl).onlyCounty;
  const geo = county ? COUNTIES[county] : undefined;
  if (!geo) return true;
  const box = bboxPolygon([b.west - NEAR_DEG, b.south - NEAR_DEG, b.east + NEAR_DEG, b.north + NEAR_DEG]);
  return booleanIntersects(box, { type: "Feature", properties: {}, geometry: geo });
}
