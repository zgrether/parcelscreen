/**
 * What the sync routes take and return (step 5, docs/plans/step-5-sync.md §4), shared by the routes and the device's
 * sync layer. The server checks each record's envelope (ids, profile, size) and stores the record itself as JSON; the
 * device validates a record's content when it reads it, as it validates the local store today.
 */
import { z } from "zod";

/** The request header that carries the code. Never a URL: it would reach the logs. */
export const CODE_HEADER = "x-sync-code";

/** Vercel refuses a request body over 4.5 MB; a batch stays under this, and the device splits its uploads to fit. */
export const MAX_BATCH_BYTES = 4_000_000;

const Id = z.string().min(1).max(100);
const JsonObject = z.record(z.string(), z.unknown());

/** A profile: its name and created time, its settings, priorities and answers. `record: null` deletes it everywhere. */
export const ProfileSave = z.object({ id: Id, record: JsonObject.nullable() });
/** One built parcel, as the parcel store's `built[]` holds it. `record: null` deletes it. */
export const ParcelSave = z.object({ key: Id, profile: Id, record: JsonObject.nullable() });
/** A kept screen: inserted once, never changed. */
export const ScreenSave = z.object({
  id: Id,
  profile: Id,
  schemaVersion: z.number().int(),
  record: JsonObject,
});

export const SaveBatch = z.object({
  profiles: z.array(ProfileSave).default([]),
  parcels: z.array(ParcelSave).default([]),
  screens: z.array(ScreenSave).default([]),
});
export type ProfileSave = z.infer<typeof ProfileSave>;
export type ParcelSave = z.infer<typeof ParcelSave>;
export type ScreenSave = z.infer<typeof ScreenSave>;
export type SaveBatch = z.infer<typeof SaveBatch>;

/** A record as the server holds it: `deleted` rows tell the other devices to drop theirs. */
export interface StoredProfile {
  id: string;
  record: Record<string, unknown> | null;
  deleted: boolean;
  updatedAt: string;
}
export interface StoredParcel {
  key: string;
  profile: string;
  record: Record<string, unknown> | null;
  deleted: boolean;
  updatedAt: string;
}
export interface StoredScreen {
  id: string;
  profile: string;
  schemaVersion: number;
  record: Record<string, unknown>;
  createdAt: string;
}

/**
 * GET /api/sync/changes: what changed after `since` (all of it without one). `cursor` is the latest `updatedAt` among
 * them, on the database's clock, for the next fetch; the device asks from a little before it, so a save that committed
 * late isn't missed.
 */
export interface Changes {
  profiles: StoredProfile[];
  parcels: StoredParcel[];
  /** The space's screens of the current schema version (added after `since`): the device fetches one when it's opened. */
  screens: { id: string; profile: string }[];
  cursor: string | null;
}

export const ChangesSchema: z.ZodType<Changes> = z.object({
  profiles: z.array(
    z.object({ id: z.string(), record: JsonObject.nullable(), deleted: z.boolean(), updatedAt: z.string() }),
  ),
  parcels: z.array(
    z.object({
      key: z.string(),
      profile: z.string(),
      record: JsonObject.nullable(),
      deleted: z.boolean(),
      updatedAt: z.string(),
    }),
  ),
  screens: z.array(z.object({ id: z.string(), profile: z.string() })),
  cursor: z.string().nullable(),
});
