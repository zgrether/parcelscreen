/**
 * Where synced spaces live (step 5, docs/plans/step-5-sync.md §4): the routes call a `SyncStore`, keyed by the space
 * key (the code's SHA-256, lib/sync/code.ts), never the code. Production uses the Supabase store
 * (lib/server/supabaseSyncStore.ts); the unit tests and the e2e use `MemorySyncStore`, so CI never touches the
 * production database.
 *
 * The rules every store keeps:
 *   - a save stamps each profile and parcel with the store's own time, so the save that arrives last wins, whole;
 *   - a screen is inserted once and never changed; saving it again is ignored;
 *   - deleting a profile marks it and its parcels deleted (so other devices learn of it) and deletes its screens;
 *   - `changes` lists only the screens of the current schema version.
 */
import type { Changes, SaveBatch, StoredParcel, StoredProfile, StoredScreen } from "./wire";

export interface SyncStore {
  /** Makes a space; false if it already exists. */
  createSpace(space: string): Promise<boolean>;
  spaceExists(space: string): Promise<boolean>;
  /** What changed after `since` (an ISO time on the store's clock), or everything without it. */
  changes(space: string, since: string | null, schemaVersion: number): Promise<Changes>;
  save(space: string, batch: SaveBatch): Promise<void>;
  screen(space: string, id: string): Promise<StoredScreen | null>;
  /** One tiny read, for the keep-alive. Throws if the store can't be reached. */
  health(): Promise<void>;
}

interface MemorySpace {
  profiles: Map<string, StoredProfile>;
  parcels: Map<string, StoredParcel>;
  screens: Map<string, StoredScreen>;
}

/** The store in memory, for tests. `now` is its clock; each read of it must be later than the last. */
export class MemorySyncStore implements SyncStore {
  private readonly spaces = new Map<string, MemorySpace>();
  private last = 0;

  constructor(private readonly clock: () => number = Date.now) {}

  /** A strictly increasing time, so two saves in the same millisecond still have an order. */
  private stamp(): string {
    this.last = Math.max(this.last + 1, this.clock());
    return new Date(this.last).toISOString();
  }

  async createSpace(space: string): Promise<boolean> {
    if (this.spaces.has(space)) return false;
    this.spaces.set(space, { profiles: new Map(), parcels: new Map(), screens: new Map() });
    return true;
  }

  async spaceExists(space: string): Promise<boolean> {
    return this.spaces.has(space);
  }

  async changes(space: string, since: string | null, schemaVersion: number): Promise<Changes> {
    const s = this.spaces.get(space);
    if (!s) return { profiles: [], parcels: [], screens: [], cursor: null };
    const after = (t: string) => since === null || t > since;
    const profiles = [...s.profiles.values()].filter((p) => after(p.updatedAt));
    const parcels = [...s.parcels.values()].filter((p) => after(p.updatedAt));
    const screens = [...s.screens.values()].filter(
      (x) => x.schemaVersion === schemaVersion && after(x.createdAt),
    );
    const times = [
      ...profiles.map((p) => p.updatedAt),
      ...parcels.map((p) => p.updatedAt),
      ...screens.map((x) => x.createdAt),
    ];
    return {
      profiles: structuredClone(profiles),
      parcels: structuredClone(parcels),
      screens: screens.map(({ id, profile }) => ({ id, profile })),
      cursor: times.length ? times.reduce((a, b) => (b > a ? b : a)) : since,
    };
  }

  async save(space: string, batch: SaveBatch): Promise<void> {
    const s = this.spaces.get(space);
    if (!s) throw new Error("no such space");
    for (const p of batch.profiles) {
      const updatedAt = this.stamp();
      s.profiles.set(p.id, {
        id: p.id,
        record: structuredClone(p.record),
        deleted: p.record === null,
        updatedAt,
      });
      if (p.record !== null) continue;
      for (const parcel of s.parcels.values())
        if (parcel.profile === p.id)
          s.parcels.set(parcel.key, { ...parcel, record: null, deleted: true, updatedAt });
      for (const screen of s.screens.values()) if (screen.profile === p.id) s.screens.delete(screen.id);
    }
    for (const p of batch.parcels)
      s.parcels.set(p.key, {
        key: p.key,
        profile: p.profile,
        record: structuredClone(p.record),
        deleted: p.record === null,
        updatedAt: this.stamp(),
      });
    for (const x of batch.screens)
      if (!s.screens.has(x.id)) s.screens.set(x.id, { ...structuredClone(x), createdAt: this.stamp() });
  }

  async screen(space: string, id: string): Promise<StoredScreen | null> {
    const x = this.spaces.get(space)?.screens.get(id);
    return x ? structuredClone(x) : null;
  }

  async health(): Promise<void> {}
}
