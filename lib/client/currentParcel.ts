/**
 * The parcel being worked on, kept across a page refresh (step 13d, new in the port: the prototype lost it).
 * Stored as JSON under `ps.current` and validated on the way back in, since anything in localStorage can be
 * stale or edited by hand; an unreadable value is simply dropped.
 */
import { z } from "zod";
import type { ParcelRecord } from "@/lib/geo/parcels";
import type { LatLon } from "@/lib/geo/types";

export interface CurrentParcel {
  parcel: ParcelRecord | null;
  house: LatLon | null;
}

const LatLonSchema = z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]);
const Ring = z.array(z.tuple([z.number(), z.number()]).rest(z.number())).min(4);
const PolygonFeature = z.object({
  type: z.literal("Feature"),
  properties: z.record(z.string(), z.unknown()).nullable().optional(),
  geometry: z.object({ type: z.literal("Polygon"), coordinates: z.array(Ring).min(1) }),
});
const Record_ = z.object({
  geo: PolygonFeature,
  props: z.record(z.string(), z.unknown()),
  source: z.string(),
  multiPart: z.boolean(),
});
const ParcelSchema = Record_.extend({ members: z.array(Record_).optional() });
const CurrentSchema = z.object({
  v: z.literal(1),
  parcel: ParcelSchema.nullable(),
  house: LatLonSchema.nullable(),
});

export function readCurrentParcel(raw: string): CurrentParcel | null {
  const r = CurrentSchema.safeParse(JSON.parse(raw));
  return r.success ? { parcel: r.data.parcel as ParcelRecord | null, house: r.data.house } : null;
}

export function writeCurrentParcel(c: CurrentParcel | null): string {
  return JSON.stringify(c ? { v: 1, ...c } : null);
}
