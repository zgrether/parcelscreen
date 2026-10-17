/**
 * Local profiles (roadmap step 1; docs/plans/step-1-profiles-grading.md §3.4): anyone opening the link gets one, and
 * every piece of a person's data is scoped to it. A profile is a row; its documents are its parcels (History, the open
 * parcel, lines, markers, notes), its settings, its rubric and its views, each kept as the string the prefs module
 * writes (lib/client/prefs.ts), under the pref's key. Kept screens are stamped with their profile.
 *
 * `ProfileStorage` is what the storage does; IndexedDB does it in the browser (idbProfileStorage, over lib/client/db.ts)
 * and memory does it in tests and where storage is refused (memoryProfileStorage). No new dependency.
 */
import { BY_PROFILE, DOCS, done, openDb, PROFILES, result, SCREENS } from "./db";

export interface Profile {
  id: string;
  name: string;
  createdAt: string;
  /** When it was last the current profile; the picker lists the most recent first. */
  openedAt: string;
}

/** One of a profile's documents: a pref's value as the prefs module writes it. */
export interface ProfileDoc {
  profile: string;
  key: string;
  value: string;
}

export interface ProfileStorage {
  profiles(): Promise<Profile[]>;
  putProfile(p: Profile): Promise<void>;
  /** The profile, its documents and its screens, in one transaction. */
  deleteProfile(id: string): Promise<void>;
  docs(profile: string): Promise<ProfileDoc[]>;
  putDoc(doc: ProfileDoc): Promise<void>;
  deleteDoc(profile: string, key: string): Promise<void>;
  /** Deletes every kept screen without a profile stamp: screens kept before profiles (step 2 plan §9). */
  dropUnstamped(): Promise<void>;
  /** The ids of the kept screens stamped with this profile. */
  screenIds(profile: string): Promise<string[]>;
}

/** A profile's documents lie between these keys in the docs store. */
const docRange = (profile: string) => IDBKeyRange.bound([profile, ""], [profile, "￿"]);

export function idbProfileStorage(): ProfileStorage {
  const need = async (): Promise<IDBDatabase> => {
    const d = await openDb();
    if (!d) throw new Error("IndexedDB is unavailable");
    return d;
  };
  return {
    async profiles() {
      const d = await need();
      return result(d.transaction(PROFILES).objectStore(PROFILES).getAll() as IDBRequest<Profile[]>);
    },
    async putProfile(p) {
      const d = await need();
      const tx = d.transaction(PROFILES, "readwrite");
      tx.objectStore(PROFILES).put(p);
      await done(tx);
    },
    async deleteProfile(id) {
      const d = await need();
      const tx = d.transaction([PROFILES, DOCS, SCREENS], "readwrite");
      tx.objectStore(PROFILES).delete(id);
      tx.objectStore(DOCS).delete(docRange(id));
      const byProfile = tx.objectStore(SCREENS).index(BY_PROFILE).openKeyCursor(IDBKeyRange.only(id));
      byProfile.onsuccess = () => {
        const c = byProfile.result;
        if (!c) return;
        tx.objectStore(SCREENS).delete(c.primaryKey);
        c.continue();
      };
      await done(tx);
    },
    async docs(profile) {
      const d = await need();
      return result(
        d.transaction(DOCS).objectStore(DOCS).getAll(docRange(profile)) as IDBRequest<ProfileDoc[]>,
      );
    },
    async putDoc(doc) {
      const d = await need();
      const tx = d.transaction(DOCS, "readwrite");
      tx.objectStore(DOCS).put(doc);
      await done(tx);
    },
    async deleteDoc(profile, key) {
      const d = await need();
      const tx = d.transaction(DOCS, "readwrite");
      tx.objectStore(DOCS).delete([profile, key]);
      await done(tx);
    },
    async dropUnstamped() {
      const d = await need();
      const tx = d.transaction(SCREENS, "readwrite");
      const cursor = tx.objectStore(SCREENS).openCursor();
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (!c) return;
        if ((c.value as { profile?: string }).profile === undefined) c.delete();
        c.continue();
      };
      await done(tx);
    },
    async screenIds(profile) {
      const d = await need();
      const keys = await result(
        d.transaction(SCREENS).objectStore(SCREENS).index(BY_PROFILE).getAllKeys(IDBKeyRange.only(profile)),
      );
      return keys.map(String);
    },
  };
}

/**
 * Storage in memory: for tests, and for a browser that refuses IndexedDB (then nothing outlives the page).
 * `delayWrites`: each document write lands after that many milliseconds, as IndexedDB's do, for tests of the order
 * between a write and what follows it.
 */
export function memoryProfileStorage(opts: { delayWrites?: number } = {}): ProfileStorage & {
  readonly state: {
    profiles: Map<string, Profile>;
    docs: Map<string, ProfileDoc>;
    screens: Map<string, { profile?: string }>;
  };
} {
  const state = {
    profiles: new Map<string, Profile>(),
    docs: new Map<string, ProfileDoc>(),
    screens: new Map<string, { profile?: string }>(),
  };
  const dk = (profile: string, key: string) => `${profile}\u0000${key}`;
  return {
    state,
    async profiles() {
      return [...state.profiles.values()];
    },
    async putProfile(p) {
      state.profiles.set(p.id, { ...p });
    },
    async deleteProfile(id) {
      state.profiles.delete(id);
      for (const [k, d] of state.docs) if (d.profile === id) state.docs.delete(k);
      for (const [k, s] of state.screens) if (s.profile === id) state.screens.delete(k);
    },
    async docs(profile) {
      return [...state.docs.values()].filter((d) => d.profile === profile).map((d) => ({ ...d }));
    },
    async putDoc(doc) {
      if (opts.delayWrites) await new Promise((r) => setTimeout(r, opts.delayWrites));
      state.docs.set(dk(doc.profile, doc.key), { ...doc });
    },
    async deleteDoc(profile, key) {
      if (opts.delayWrites) await new Promise((r) => setTimeout(r, opts.delayWrites));
      state.docs.delete(dk(profile, key));
    },
    async dropUnstamped() {
      for (const [k, s] of state.screens) if (s.profile === undefined) state.screens.delete(k);
    },
    async screenIds(profile) {
      return [...state.screens].filter(([, s]) => s.profile === profile).map(([k]) => k);
    },
  };
}
