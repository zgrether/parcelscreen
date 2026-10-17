/**
 * The nine Tennessee counties with no lines on the state's public-use parcel layer: they keep their own assessment
 * systems (step 2 plan §6.4). Outlines from lib/geo/data/tn-own-records.json (`pnpm data:tn-counties`), simplified.
 */
import { booleanPointInPolygon, point } from "@turf/turf";
import type { MultiPolygon, Polygon } from "geojson";
import data from "./data/tn-own-records.json";
import type { LatLon } from "./types";

const COUNTIES = data.counties as unknown as Record<string, Polygon | MultiPolygon>;

/** The map's hint over one of them; its Draw button sits beside it. */
export const OWN_RECORDS_HINT =
  "No Tennessee parcel lines here; this county keeps its own records. Draw the boundary instead.";

/** The county the point is in, if it's one of the nine; null otherwise. */
export function ownRecordsCountyAt([lat, lon]: LatLon): string | null {
  const pt = point([lon, lat]);
  for (const [name, geo] of Object.entries(COUNTIES)) if (booleanPointInPolygon(pt, geo)) return name;
  return null;
}
