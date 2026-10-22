/**
 * The synced spaces in Supabase (step 5; supabase/migrations/0001_sync.sql). Server-only: it uses the project's secret
 * key, which bypasses row-level security. The tables have RLS on with no policies, so the public key reads and writes
 * nothing, and these routes are the only way in.
 *
 * The database keeps the rules lib/sync/store.ts lists: a trigger stamps each profile and parcel's `updated_at` as
 * it's saved, and another refuses any update of a screen.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { SyncStore } from "../sync/store";
import { isConfigError, SyncConfigError } from "./syncConfig";
import type {
  HouseholdKind,
  Changes,
  SaveBatch,
  StoredHousehold,
  StoredParcel,
  StoredProfile,
  StoredScreen,
} from "../sync/wire";

/** Rows per upsert: a batch is at most 4 MB, so this only splits a batch of many small parcels. */
const CHUNK = 200;
const chunks = <T>(xs: T[]): T[][] =>
  Array.from({ length: Math.ceil(xs.length / CHUNK) }, (_, i) => xs.slice(i * CHUNK, (i + 1) * CHUNK));

/** A store error: a SyncConfigError when it can only be the server's setup (syncConfig.ts). */
const failure = (e: { code?: string; message: string }): Error =>
  isConfigError(e)
    ? new SyncConfigError(`sync store: the server's setup: ${e.message}`)
    : new Error(`sync store: ${e.message}`);

function check<T>(r: { data: T; error: { code?: string; message: string } | null }): T {
  if (r.error) throw failure(r.error);
  return r.data;
}

interface ProfileRow {
  id: string;
  record: Record<string, unknown> | null;
  deleted: boolean;
  updated_at: string;
}
interface ParcelRow extends Omit<ProfileRow, "id"> {
  key: string;
  profile: string;
}
interface HouseholdRow {
  key: string;
  kind: HouseholdKind;
  record: Record<string, unknown> | null;
  deleted: boolean;
  updated_at: string;
}
interface ScreenRow {
  id: string;
  profile: string;
  schema_version: number;
  record: Record<string, unknown>;
  created_at: string;
}

const profileOf = (r: ProfileRow): StoredProfile => ({
  id: r.id,
  record: r.record,
  deleted: r.deleted,
  updatedAt: r.updated_at,
});
const parcelOf = (r: ParcelRow): StoredParcel => ({
  key: r.key,
  profile: r.profile,
  record: r.record,
  deleted: r.deleted,
  updatedAt: r.updated_at,
});

export class SupabaseSyncStore implements SyncStore {
  private readonly db: SupabaseClient;

  /** `url` is the project's origin (syncConfig.ts supabaseOrigin): supabase-js adds `/rest/v1` itself. */
  constructor(url: string, secretKey: string) {
    this.db = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async createSpace(space: string): Promise<boolean> {
    const { error } = await this.db.from("sync_spaces").insert({ space });
    if (!error) return true;
    if (error.code === "23505") return false; // unique violation: the code is taken
    throw failure(error);
  }

  async spaceExists(space: string): Promise<boolean> {
    const r = await this.db.from("sync_spaces").select("space").eq("space", space).maybeSingle();
    return check(r) !== null;
  }

  async changes(space: string, since: string | null, schemaVersion: number): Promise<Changes> {
    let profilesQ = this.db
      .from("sync_profiles")
      .select("id, record, deleted, updated_at")
      .eq("space", space);
    let parcelsQ = this.db
      .from("sync_parcels")
      .select("key, profile, record, deleted, updated_at")
      .eq("space", space);
    let screensQ = this.db
      .from("sync_screens")
      .select("id, profile, created_at")
      .eq("space", space)
      .eq("schema_version", schemaVersion);
    // Step 6's asks and takes (0002_household.sql).
    let householdQ = this.db
      .from("sync_household")
      .select("key, kind, record, deleted, updated_at")
      .eq("space", space);
    // Step 12's adjustments (0003_adjustments.sql): read as the household's "adjust" records.
    let adjustQ = this.db
      .from("sync_adjustments")
      .select("key, record, deleted, updated_at")
      .eq("space", space);
    if (since) {
      adjustQ = adjustQ.gt("updated_at", since);
      profilesQ = profilesQ.gt("updated_at", since);
      parcelsQ = parcelsQ.gt("updated_at", since);
      screensQ = screensQ.gt("created_at", since);
      householdQ = householdQ.gt("updated_at", since);
    }
    const [profiles, parcels, screens, household, adjusts] = await Promise.all([
      profilesQ,
      parcelsQ,
      screensQ,
      householdQ,
      adjustQ,
    ]);
    const p = check(profiles) as ProfileRow[];
    const q = check(parcels) as ParcelRow[];
    const s = check(screens) as Pick<ScreenRow, "id" | "profile" | "created_at">[];
    const h = [
      ...(check(household) as HouseholdRow[]),
      ...(check(adjusts) as Omit<HouseholdRow, "kind">[]).map((r): HouseholdRow => ({
        ...r,
        kind: "adjust",
      })),
    ];
    const times = [
      ...p.map((r) => r.updated_at),
      ...q.map((r) => r.updated_at),
      ...s.map((r) => r.created_at),
      ...h.map((r) => r.updated_at),
    ];
    const cursor = times.length ? times.reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a)) : since;
    return {
      profiles: p.map(profileOf),
      parcels: q.map(parcelOf),
      screens: s.map(({ id, profile }) => ({ id, profile })),
      household: h.map((r): StoredHousehold => ({
        key: r.key,
        kind: r.kind,
        record: r.record,
        deleted: r.deleted,
        updatedAt: r.updated_at,
      })),
      cursor,
    };
  }

  async save(space: string, batch: SaveBatch): Promise<void> {
    // Profiles first, so a profile deleted in this batch takes its parcels with it before anything else lands.
    for (const rows of chunks(batch.profiles)) {
      check(
        await this.db.from("sync_profiles").upsert(
          rows.map((p) => ({ space, id: p.id, record: p.record, deleted: p.record === null })),
          { onConflict: "space,id" },
        ),
      );
      const gone = rows.filter((p) => p.record === null).map((p) => p.id);
      if (!gone.length) continue;
      check(
        await this.db
          .from("sync_parcels")
          .update({ record: null, deleted: true })
          .eq("space", space)
          .in("profile", gone),
      );
      check(await this.db.from("sync_screens").delete().eq("space", space).in("profile", gone));
    }
    for (const rows of chunks(batch.parcels))
      check(
        await this.db.from("sync_parcels").upsert(
          rows.map((p) => ({
            space,
            key: p.key,
            profile: p.profile,
            record: p.record,
            deleted: p.record === null,
          })),
          { onConflict: "space,key" },
        ),
      );
    for (const rows of chunks(batch.household.filter((x) => x.kind === "adjust")))
      check(
        await this.db.from("sync_adjustments").upsert(
          rows.map((x) => ({ space, key: x.key, record: x.record, deleted: x.record === null })),
          { onConflict: "space,key" },
        ),
      );
    for (const rows of chunks(batch.household.filter((x) => x.kind !== "adjust")))
      check(
        await this.db.from("sync_household").upsert(
          rows.map((x) => ({
            space,
            key: x.key,
            kind: x.kind,
            record: x.record,
            deleted: x.record === null,
          })),
          { onConflict: "space,kind,key" },
        ),
      );
    for (const rows of chunks(batch.screens))
      check(
        await this.db.from("sync_screens").upsert(
          rows.map((x) => ({
            space,
            id: x.id,
            profile: x.profile,
            schema_version: x.schemaVersion,
            record: x.record,
          })),
          { onConflict: "space,id", ignoreDuplicates: true },
        ),
      );
  }

  async screen(space: string, id: string): Promise<StoredScreen | null> {
    const r = await this.db
      .from("sync_screens")
      .select("id, profile, schema_version, record, created_at")
      .eq("space", space)
      .eq("id", id)
      .maybeSingle();
    const row = check(r) as ScreenRow | null;
    return row
      ? {
          id: row.id,
          profile: row.profile,
          schemaVersion: row.schema_version,
          record: row.record,
          createdAt: row.created_at,
        }
      : null;
  }

  async health(): Promise<void> {
    check(await this.db.from("sync_spaces").select("space").limit(1));
  }
}
