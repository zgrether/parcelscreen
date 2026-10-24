/**
 * Sync on a joined device (step 5, docs/plans/step-5-sync.md §5). The pages keep reading the profile documents from
 * memory as they always have; this listens under them (lib/client/syncHooks.ts) and keeps the space in step:
 *
 * - **Saving:** a write marks what may have changed; about a second after the last one, the whole records that really
 *   differ from what the space is known to hold (the baseline) are sent in one batch. The save that reaches the server
 *   last wins, whole (owner, 10/19).
 * - **Fetching:** when the app opens, comes back to the front, or switches tabs, and every 30 s while it's visible and
 *   online (step 6b, poll.ts), the changes since the last fetch (with a little overlap) are merged in, except records
 *   changed here and not saved yet: their own save follows. They wait during a My order drag and while a text field
 *   has focus (hold.ts), and are fetched again on the drop or the blur.
 * - **Failing:** a save that fails (offline, the server's error, over 10 s) turns the indicator to Not saved and offers
 *   Try again. Nothing retries by itself. What's unsaved is written to `ps.sync`, so the next open says so once, with
 *   Try again and Discard.
 * - **Screens** are sent once, when kept, and fetched when a parcel needs one this device hasn't got.
 */
import { activeKv, currentProfile, currentProfileId, profileStorage } from "@/lib/client/profiles";
import { sharedKv, SPACE_ID } from "@/lib/client/profileKv";
import { profilesChanged } from "@/lib/client/profileEvents";
import { setPref } from "@/lib/client/prefs";
import { readParcelStore } from "@/lib/client/parcelStore";
import { RUBRICS_CHANGED } from "@/lib/client/rubrics";
import { getScreen, putScreens, type ScreenRecord } from "@/lib/client/screenStore";
import { readHousehold } from "@/lib/client/takes";
import { registerSyncHooks, type SyncHooks } from "@/lib/client/syncHooks";
import type { Profile } from "@/lib/client/profileStore";
import { fetchChanges, fetchScreen, saveBatch } from "./client";
import { onSyncReleased, syncHeld } from "./hold";
import { Poller } from "./poll";
import {
  batches,
  canonical,
  diffParcels,
  isSyncedDoc,
  mergeParcels,
  PARCELS_DOC,
  parcelOf,
  parcelSnapshot,
  HOUSEHOLD_DOC,
  householdId,
  householdRecord,
  householdSnapshot,
  mergeHousehold,
  profileRecord,
  SYNCED_DOCS,
  type ProfileRecord,
} from "./records";
import { hasUnsaved, readSyncState, writeSyncState, type SyncState, type Unsaved } from "./state";
import {
  MAX_BATCH_BYTES,
  type HouseholdSave,
  type ParcelSave,
  type ProfileSave,
  type ScreenSave,
  type StoredHousehold,
  type StoredProfile,
} from "./wire";

/** How long after the last edit a save goes. */
const SAVE_AFTER_MS = 1000;
/** A fetch asks from this far before the last cursor, so a save that committed late isn't missed. */
const OVERLAP_MS = 10_000;
/** A baseline entry that matches nothing the space holds: Discard's way to take the space's copy whatever it is. */
const DISCARDED = "(discarded)";

export type SyncStatus = "off" | "synced" | "failed";
export interface SyncView {
  status: SyncStatus;
  /** The failure was found when the app opened: changes from a page closed before they were saved. */
  atOpen: boolean;
  /** At the open: the names of what wasn't saved (parcels by their name, profiles by theirs), for the line. */
  names?: string[];
}

let view: SyncView = { status: "off", atOpen: false };
const listeners = new Set<() => void>();
function setView(v: SyncView): void {
  view = v;
  for (const l of listeners) l();
}
export const syncView = (): SyncView => view;
export function subscribeSync(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

class Engine implements SyncHooks {
  /** What the space is known to hold: each profile's and each parcel's record, as canonical strings. */
  private readonly profileBase = new Map<string, string>();
  private readonly parcelBase = new Map<string, string>();
  /** Which profile's parcels document holds each parcel. */
  private readonly owner = new Map<string, string>();
  /** The household's asks and takes (step 6), by "<kind>:<key>". */
  private readonly householdBase = new Map<string, string>();
  private readonly dirtyHousehold = new Set<string>();
  /** What may have changed here and isn't saved: checked against the baseline when the save goes. */
  private readonly dirtyProfiles = new Set<string>();
  private readonly dirtyParcels = new Map<string, string>();
  private readonly dirtyScreens = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private saving: Promise<void> | null = null;
  private fetching: Promise<void> | null = null;
  /** True while merging the space's changes in: the writes that makes aren't this device's edits. */
  private applying = false;
  /** Every 30 s while visible and online (step 6b); each fetch, whatever started it, resets it. */
  private readonly poller = new Poller(() => void this.fetch());
  /** A fetch found the changes held (a drag, a focused field): fetch again once released. */
  private deferred = false;
  private unhold: (() => void) | null = null;

  constructor(private state: SyncState) {}

  private persist(): void {
    const unsaved: Unsaved = {
      profiles: [...this.dirtyProfiles],
      parcels: [...this.dirtyParcels].map(([key, profile]) => ({ key, profile })),
      screens: [...this.dirtyScreens],
      household: [...this.dirtyHousehold],
    };
    this.state = { ...this.state, unsaved };
    writeSyncState(this.state);
  }

  // ---------- reading this device's copy ----------

  private async profiles(): Promise<Profile[]> {
    return (
      (await profileStorage()
        ?.profiles()
        .catch(() => [])) ?? []
    );
  }

  /** A document: the household's shared ones (step 6) and the current profile's from memory, another's from storage. */
  private async doc(profile: string, key: string): Promise<string | null> {
    if (profile === SPACE_ID) return sharedKv()?.getItem(key) ?? null;
    if (profile === currentProfileId()) return activeKv()?.getItem(key) ?? null;
    const docs =
      (await profileStorage()
        ?.docs(profile)
        .catch(() => [])) ?? [];
    return docs.find((d) => d.key === key)?.value ?? null;
  }

  private async record(p: Profile): Promise<ProfileRecord> {
    const docs = new Map<string, string | null>();
    for (const k of SYNCED_DOCS) docs.set(k, await this.doc(p.id, k));
    return profileRecord(p, (k) => docs.get(k) ?? null);
  }

  /** The baseline from this device's copy, as the app opens: it's taken to match the space, but for what was unsaved. */
  async init(): Promise<void> {
    for (const p of await this.profiles()) this.profileBase.set(p.id, canonical(await this.record(p)));
    // The household's one list (step 6): its parcels are the space's, under SPACE_ID.
    for (const [key, value] of parcelSnapshot(await this.doc(SPACE_ID, PARCELS_DOC))) {
      this.parcelBase.set(key, value);
      this.owner.set(key, SPACE_ID);
    }
    for (const [id, value] of householdSnapshot(await this.doc(SPACE_ID, HOUSEHOLD_DOC)))
      this.householdBase.set(id, value);
    const u = this.state.unsaved;
    for (const id of u.household) {
      this.householdBase.delete(id);
      this.dirtyHousehold.add(id);
    }
    for (const id of u.profiles) {
      this.profileBase.delete(id);
      this.dirtyProfiles.add(id);
    }
    for (const { key, profile } of u.parcels) {
      this.parcelBase.delete(key);
      this.dirtyParcels.set(key, profile);
    }
    for (const id of u.screens) this.dirtyScreens.add(id);
    setView(
      hasUnsaved(u)
        ? { status: "failed", atOpen: true, names: await this.unsavedNames(u) }
        : { status: "synced", atOpen: false },
    );
    registerSyncHooks(this);
    addEventListener("visibilitychange", this.onVisibility);
    addEventListener("focus", this.onFocus);
    addEventListener("online", this.onNetwork);
    addEventListener("offline", this.onNetwork);
    document.addEventListener("focusout", this.onRelease);
    this.unhold = onSyncReleased(this.onRelease);
    this.poller.start();
    await this.fetch();
  }

  stop(): void {
    clearTimeout(this.timer);
    registerSyncHooks(null);
    removeEventListener("visibilitychange", this.onVisibility);
    removeEventListener("focus", this.onFocus);
    removeEventListener("online", this.onNetwork);
    removeEventListener("offline", this.onNetwork);
    document.removeEventListener("focusout", this.onRelease);
    this.unhold?.();
    this.poller.stop();
  }

  private readonly onVisibility = () => {
    // Hidden: send what's waiting now, in case the page goes. Shown again: fetch.
    if (document.visibilityState === "hidden") {
      void this.save();
      this.poller.changed();
    } else void this.fetch();
  };
  private readonly onFocus = () => void this.fetch();
  private readonly onNetwork = () => this.poller.changed();
  /** A blur or a drop: changes held back meanwhile are fetched now (after the focus has settled on its next element). */
  private readonly onRelease = () =>
    setTimeout(() => {
      if (!this.deferred || syncHeld()) return;
      this.deferred = false;
      void this.fetch();
    }, 0);

  /** What wasn't saved, by name: each parcel's own name (or "a parcel"), each profile's. */
  private async unsavedNames(u: Unsaved): Promise<string[]> {
    const names: string[] = [];
    for (const { key, profile } of u.parcels) {
      const name = parcelOf(await this.doc(profile, PARCELS_DOC), key)?.name;
      names.push(typeof name === "string" && name.trim() ? name.trim() : "a parcel");
    }
    const profiles = new Map((await this.profiles()).map((p) => [p.id, p.name]));
    for (const id of u.profiles) names.push(profiles.get(id) ?? "a profile");
    for (const id of u.household)
      names.push(id.startsWith("ask:") ? "an ask" : id.startsWith("adjust:") ? "an adjustment" : "a take");
    return names;
  }

  // ---------- this device's writes (the hooks) ----------

  docWritten(profile: string, key: string): void {
    if (key === HOUSEHOLD_DOC && profile === SPACE_ID) {
      const now = householdSnapshot(sharedKv()?.getItem(key) ?? null);
      if (this.applying) {
        for (const [id, v] of now) if (!this.dirtyHousehold.has(id)) this.householdBase.set(id, v);
        return;
      }
      const { changed, removed } = diffParcels(this.householdBase, now);
      for (const id of [...changed, ...removed]) this.dirtyHousehold.add(id);
      if (changed.length || removed.length) this.schedule();
      return;
    }
    if (key === PARCELS_DOC) {
      if (profile !== SPACE_ID) return; // the list is the household's (step 6): a profile's own copy isn't synced
      const now = parcelSnapshot(sharedKv()?.getItem(key) ?? null);
      const mine = new Map([...this.parcelBase].filter(([k]) => this.owner.get(k) === profile));
      if (this.applying) {
        // The merge's own write: what the store holds now is what the space holds, as this device writes it.
        for (const [k, v] of now) if (!this.dirtyParcels.has(k)) this.parcelBase.set(k, v);
        return;
      }
      const { changed, removed } = diffParcels(mine, now);
      for (const k of [...changed, ...removed]) this.dirtyParcels.set(k, profile);
      for (const k of changed) this.owner.set(k, profile);
      if (changed.length || removed.length) this.schedule();
      return;
    }
    if (isSyncedDoc(key) && !this.applying) {
      this.dirtyProfiles.add(profile);
      this.schedule();
    }
  }

  profileChanged(id: string): void {
    if (this.applying) return;
    this.dirtyProfiles.add(id);
    this.schedule();
  }

  profileDeleted(id: string): void {
    if (this.applying) return;
    this.profileBase.set(id, "deleted:pending");
    this.dirtyProfiles.add(id);
    for (const [k, p] of this.owner) if (p === id) this.dirtyParcels.delete(k);
    this.schedule();
  }

  screensKept(records: readonly ScreenRecord[]): void {
    if (this.applying) return;
    for (const r of records) this.dirtyScreens.add(r.id);
    this.schedule();
  }

  async fetchScreen(id: string): Promise<ScreenRecord | null> {
    try {
      const s = await fetchScreen(this.state.code, id);
      if (!s) return null;
      const record = s.record as unknown as ScreenRecord;
      this.applying = true;
      try {
        await putScreens([record]);
      } finally {
        this.applying = false;
      }
      return record;
    } catch {
      return null;
    }
  }

  // ---------- saving ----------

  private schedule(): void {
    this.persist();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.save(), SAVE_AFTER_MS);
  }

  /** Sends what's changed. Resolves when it's saved, or has failed (the indicator says which). */
  save(): Promise<void> {
    clearTimeout(this.timer);
    if (this.saving) return this.saving.then(() => this.save());
    const work = this.sendDirty().finally(() => (this.saving = null));
    this.saving = work;
    return work;
  }

  /** SyncHooks' flush: what's changed, sent now (before a profile switch reloads the page). */
  flush(): Promise<void> {
    return this.save();
  }

  private async sendDirty(): Promise<void> {
    const profileIds = [...this.dirtyProfiles];
    const parcelKeys = [...this.dirtyParcels];
    const screenIds = [...this.dirtyScreens];
    const householdIds = [...this.dirtyHousehold];
    if (!profileIds.length && !parcelKeys.length && !screenIds.length && !householdIds.length) {
      if (view.status === "failed" && !view.atOpen) setView({ status: "synced", atOpen: false });
      return;
    }
    const all = new Map((await this.profiles()).map((p) => [p.id, p]));
    const profiles: ProfileSave[] = [];
    const sentProfiles = new Map<string, string>();
    for (const id of profileIds) {
      const p = all.get(id);
      const value = p ? canonical(await this.record(p)) : "deleted";
      if (this.profileBase.get(id) === value) continue;
      profiles.push({ id, record: p ? (JSON.parse(value) as Record<string, unknown>) : null });
      sentProfiles.set(id, value);
    }
    const parcels: ParcelSave[] = [];
    const sentParcels = new Map<string, string | null>();
    for (const [key, profile] of parcelKeys) {
      if (profile !== SPACE_ID && !all.has(profile)) continue; // a deleted profile's own parcels go with it
      const record = parcelOf(await this.doc(profile, PARCELS_DOC), key);
      const value = record ? canonical(record) : null;
      if ((this.parcelBase.get(key) ?? null) === value) continue;
      parcels.push({ key, profile, record });
      sentParcels.set(key, value);
    }
    const household: HouseholdSave[] = [];
    const sentHousehold = new Map<string, string | null>();
    const householdRaw = await this.doc(SPACE_ID, HOUSEHOLD_DOC);
    for (const id of householdIds) {
      const x = householdRecord(householdRaw, id);
      const value = x.record ? canonical(x.record) : null;
      if ((this.householdBase.get(id) ?? null) === value) continue;
      household.push({ key: x.key, kind: x.kind, record: x.record });
      sentHousehold.set(id, value);
    }
    const screens: ScreenSave[] = [];
    for (const id of screenIds) {
      const r = await getScreen(id);
      if (r?.profile)
        screens.push({
          id,
          profile: r.profile,
          schemaVersion: r.result.schemaVersion,
          record: r as unknown as Record<string, unknown>,
        });
    }
    // Taken now: an edit made while this save is out marks its record again, and the next save takes it.
    for (const id of profileIds) this.dirtyProfiles.delete(id);
    for (const [key] of parcelKeys) this.dirtyParcels.delete(key);
    for (const id of screenIds) this.dirtyScreens.delete(id);
    for (const id of householdIds) this.dirtyHousehold.delete(id);
    try {
      await sendAll(this.state.code, profiles, parcels, screens, undefined, household);
      for (const [id, v] of sentHousehold) {
        if (v === null) this.householdBase.delete(id);
        else this.householdBase.set(id, v);
      }
      for (const [id, v] of sentProfiles) this.profileBase.set(id, v);
      for (const [key, v] of sentParcels) {
        if (v === null) this.parcelBase.delete(key);
        else this.parcelBase.set(key, v);
      }
      this.persist();
      setView({ status: hasUnsaved(this.state.unsaved) ? view.status : "synced", atOpen: false });
    } catch {
      for (const id of profileIds) this.dirtyProfiles.add(id);
      for (const [key, profile] of parcelKeys)
        if (!this.dirtyParcels.has(key)) this.dirtyParcels.set(key, profile);
      for (const id of screenIds) this.dirtyScreens.add(id);
      for (const id of householdIds) this.dirtyHousehold.add(id);
      this.persist();
      setView({ status: "failed", atOpen: false });
    }
  }

  /** Discard (the next-open line): this device's unsaved changes give way to the space's copy. */
  async discard(): Promise<void> {
    const profiles = [...this.dirtyProfiles];
    const parcels = [...this.dirtyParcels];
    const household = [...this.dirtyHousehold];
    this.dirtyProfiles.clear();
    this.dirtyParcels.clear();
    this.dirtyScreens.clear();
    this.dirtyHousehold.clear();
    this.persist();
    const changes = await fetchChanges(this.state.code, null).catch(() => null);
    if (!changes) {
      setView({ status: "failed", atOpen: true });
      return;
    }
    // What the space never had goes too: a parcel or profile made here and never saved.
    const held = new Set(changes.parcels.map((p) => p.key));
    const missing = parcels
      .filter(([key]) => !held.has(key))
      .map(([key, profile]) => ({ key, profile, record: null, deleted: true, updatedAt: "" }));
    const heldProfiles = new Set(changes.profiles.map((p) => p.id));
    const goneProfiles = profiles
      .filter((id) => !heldProfiles.has(id))
      .map((id): StoredProfile => ({ id, record: null, deleted: true, updatedAt: "" }));
    // Marked as differing from anything the space holds, so the space's copy of each is taken.
    for (const id of profiles) this.profileBase.set(id, DISCARDED);
    for (const [key] of parcels) this.parcelBase.set(key, DISCARDED);
    for (const id of household) this.householdBase.set(id, DISCARDED);
    const heldHousehold = new Set(changes.household.map((x) => householdId(x.kind, x.key)));
    const goneHousehold = household
      .filter((id) => !heldHousehold.has(id))
      .map((id) => {
        const x = householdRecord(null, id);
        return { key: x.key, kind: x.kind, record: null, deleted: true, updatedAt: "" };
      });
    await this.apply({
      ...changes,
      profiles: [...changes.profiles, ...goneProfiles],
      parcels: [...changes.parcels, ...missing],
      household: [...changes.household, ...goneHousehold],
    });
    setView({ status: "synced", atOpen: false });
  }

  // ---------- fetching ----------

  fetch(): Promise<void> {
    if (this.fetching) return this.fetching;
    const work = this.fetchOnce()
      .then((ok) => this.poller.fetched(ok))
      .finally(() => (this.fetching = null));
    this.fetching = work;
    return work;
  }

  /** One fetch and merge; false when it failed (offline, slow, the server's error), which only the poller counts. */
  private async fetchOnce(): Promise<boolean> {
    if (syncHeld()) {
      this.deferred = true;
      return true;
    }
    const since = this.state.cursor
      ? new Date(Date.parse(this.state.cursor) - OVERLAP_MS).toISOString()
      : null;
    let changes;
    try {
      changes = await fetchChanges(this.state.code, since);
    } catch {
      return false; // offline or slow: the cached copy stands, and saving says so if it fails
    }
    if (!changes) return false;
    // A drag or a field took hold while the fetch was out: apply nothing yet, and fetch again on release.
    if (syncHeld()) {
      this.deferred = true;
      return true;
    }
    await this.apply(changes);
    this.state = { ...this.state, cursor: changes.cursor ?? this.state.cursor };
    writeSyncState(this.state);
    return true;
  }

  /** Merges the space's changes into this device's copy, except what's changed here and not saved. */
  private async apply(changes: {
    profiles: StoredProfile[];
    parcels: { key: string; profile: string; record: Record<string, unknown> | null; deleted: boolean }[];
    household: StoredHousehold[];
  }): Promise<void> {
    const storage = profileStorage();
    if (!storage) return;
    const current = currentProfileId();
    let reload = false;
    let others = false;
    this.applying = true;
    try {
      const local = new Map((await this.profiles()).map((p) => [p.id, p]));
      for (const p of changes.profiles) {
        if (this.dirtyProfiles.has(p.id)) continue;
        if (p.deleted || !p.record) {
          if (local.has(p.id)) {
            await storage.deleteProfile(p.id);
            if (p.id === current) reload = true;
            else others = true;
          }
          this.profileBase.delete(p.id);
          for (const [k, o] of this.owner) if (o === p.id) this.parcelBase.delete(k);
          continue;
        }
        const value = canonical(p.record);
        if (this.profileBase.get(p.id) === value) continue;
        const r = p.record as unknown as ProfileRecord;
        const had = local.get(p.id);
        const profile: Profile = {
          id: p.id,
          name: r.name,
          createdAt: r.createdAt,
          openedAt: had?.openedAt ?? r.createdAt,
        };
        await storage.putProfile(profile);
        if (p.id === current && currentProfile()) Object.assign(currentProfile()!, { name: r.name });
        let rubrics = false;
        for (const k of SYNCED_DOCS) {
          const next = r.docs?.[k] ?? null;
          if ((await this.doc(p.id, k)) === next) continue;
          if (k === "ps.rubrics") rubrics = true;
          if (p.id === current) {
            if (next === null) activeKv()?.removeItem(k);
            else activeKv()?.setItem(k, next);
          } else if (next === null) await storage.deleteDoc(p.id, k);
          else await storage.putDoc({ profile: p.id, key: k, value: next });
        }
        this.profileBase.set(p.id, value);
        if (rubrics && p.id === current) dispatchEvent(new Event(RUBRICS_CHANGED));
        if (p.id !== current) others = true;
      }

      const byProfile = new Map<string, typeof changes.parcels>();
      for (const x of changes.parcels) byProfile.set(x.profile, [...(byProfile.get(x.profile) ?? []), x]);
      for (const [profile, xs] of byProfile) {
        // Only the household's list (step 6); a space's rows from before step 6, kept per profile, are left alone.
        if (profile !== SPACE_ID) continue;
        const keep = new Set([...this.dirtyParcels.keys()]);
        const raw = await this.doc(profile, PARCELS_DOC);
        const fresh = xs.filter(
          (x) =>
            !keep.has(x.key) &&
            (this.parcelBase.get(x.key) ?? null) !== (x.record ? canonical(x.record) : null),
        );
        if (!fresh.length) continue;
        const merged = mergeParcels(
          raw,
          fresh.map((x) => ({ ...x, updatedAt: "" })),
          keep,
        );
        for (const x of fresh) {
          this.owner.set(x.key, profile);
          if (x.record) this.parcelBase.set(x.key, canonical(x.record));
          else this.parcelBase.delete(x.key);
        }
        // Through the prefs module, so the pages holding the parcels hear of it (step 4b's announcement).
        const store = readParcelStore(merged);
        if (store) setPref("ps.parcels", store);
      }

      // The household's asks and takes (step 6), the same way.
      const freshHousehold = changes.household.filter((x) => {
        const id = householdId(x.kind, x.key);
        return (
          !this.dirtyHousehold.has(id) &&
          (this.householdBase.get(id) ?? null) !== (x.record && !x.deleted ? canonical(x.record) : null)
        );
      });
      if (freshHousehold.length) {
        const merged = mergeHousehold(
          await this.doc(SPACE_ID, HOUSEHOLD_DOC),
          freshHousehold,
          this.dirtyHousehold,
        );
        for (const x of freshHousehold) {
          const id = householdId(x.kind, x.key);
          if (x.record && !x.deleted) this.householdBase.set(id, canonical(x.record));
          else this.householdBase.delete(id);
        }
        const h = readHousehold(merged);
        if (h) setPref("ps.household", h);
      }
    } finally {
      this.applying = false;
    }
    if (reload) location.reload();
    // Another member's name, priorities or answers changed: the members, and the grades by them, reload (step 6).
    else if (others) profilesChanged();
  }
}

/** Sends a batch, split to stay under the server's limit; screens go last, a few at a time. */
async function sendAll(
  code: string,
  profiles: ProfileSave[],
  parcels: ParcelSave[],
  screens: ScreenSave[],
  progress?: (done: number, total: number) => void,
  /** The household's asks and takes (step 6). */
  household: HouseholdSave[] = [],
): Promise<void> {
  const size = (x: unknown) => JSON.stringify(x).length + 1;
  type Small = ProfileSave | ParcelSave | HouseholdSave;
  const isHousehold = (x: Small): x is HouseholdSave => "kind" in x;
  if (profiles.length || parcels.length || household.length)
    for (const b of batches<Small>([...profiles, ...parcels, ...household], MAX_BATCH_BYTES, size))
      await saveBatch(code, {
        profiles: b.filter((x): x is ProfileSave => "id" in x),
        parcels: b.filter((x): x is ParcelSave => "key" in x && !isHousehold(x)),
        screens: [],
        household: b.filter(isHousehold),
      });
  let done = 0;
  for (const b of batches(screens, MAX_BATCH_BYTES, size)) {
    await saveBatch(code, { profiles: [], parcels: [], screens: b, household: [] });
    done += b.length;
    progress?.(done, screens.length);
  }
}

let engine: Engine | null = null;

/** Starts sync on a joined device, after the profile has booted; nothing on an unjoined one. */
export async function initSync(): Promise<void> {
  const state = readSyncState();
  if (!state || engine) return;
  engine = new Engine(state);
  await engine.init();
}

/** A tab switch (components/Nav/AppFrame.tsx): fetch, as on open and focus. */
export const syncOnNavigate = (): void => void engine?.fetch();
/** Try again: sends what's unsaved now. */
export const trySaveAgain = (): Promise<void> => engine?.save() ?? Promise.resolve();
/** Discard, from the next-open line. */
export const discardUnsaved = (): Promise<void> => engine?.discard() ?? Promise.resolve();
/** Every write so far sent (or failed): before a reload, and for the e2e. */
export const flushSync = (): Promise<void> => engine?.save() ?? Promise.resolve();

export { sendAll };
