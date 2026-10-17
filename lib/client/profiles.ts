/**
 * The current profile (roadmap step 1; docs/plans/step-1-profiles-grading.md §3.4): booted before the app renders
 * (components/Profile/ProfileGate.tsx). The device remembers which profile is current (localStorage `ps.profile`);
 * without one, the most recently opened profile is current, and with none at all a first one is created ("Profile 1",
 * renamed from the picker). The first boot moves the browser's pre-profile data into that profile (migrateProfiles.ts).
 * Where IndexedDB is refused, the profile lives in memory and nothing outlives the page; the menu says so.
 */
import { debugOn } from "./debugHandle";
import { openDb } from "./db";
import { migrateLegacy, type LegacyStore } from "./migrateProfiles";
import { activeKv, ProfileKv, setActiveKv, type KvHandle } from "./profileKv";
import { idbProfileStorage, memoryProfileStorage, type Profile, type ProfileStorage } from "./profileStore";

/** The device's current profile, by id. */
export const CURRENT_PROFILE_KEY = "ps.profile";
/** The name a profile gets when it's created without one (owner, step 1 plan §8 Q4). */
export const FIRST_PROFILE_NAME = "Profile 1";

let current: Profile | null = null;
let storage: ProfileStorage | null = null;
let unavailable = false;

export const currentProfile = (): Profile | null => current;
export const currentProfileId = (): string | null => current?.id ?? null;
/** Whether the browser refused IndexedDB: the profile is in memory and nothing is kept. */
export const storageUnavailable = (): boolean => unavailable;
/** The storage the boot chose; null before the boot. */
export const profileStorage = (): ProfileStorage | null => storage;

export function newProfile(name: string, now: string = new Date().toISOString()): Profile {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return { id, name, createdAt: now, openedAt: now };
}

function localStore(): LegacyStore | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export interface BootOptions {
  storage?: ProfileStorage;
  ls?: LegacyStore | null;
  now?: string;
}

export interface Booted {
  profile: Profile;
  kv: ProfileKv;
  /** Whether this boot moved pre-profile data into the profile. */
  migrated: boolean;
  /** Whether the profile was created on this boot (a first visit). */
  created: boolean;
}

/**
 * Chooses or creates the current profile, moves pre-profile data into it on the first boot, loads its documents and
 * makes them the prefs' store. Never throws: storage failures leave an in-memory profile.
 */
export async function bootProfiles(opts: BootOptions = {}): Promise<Booted> {
  const now = opts.now ?? new Date().toISOString();
  const ls = opts.ls === undefined ? localStore() : opts.ls;
  if (opts.storage) storage = opts.storage;
  else {
    const db = typeof indexedDB === "undefined" ? null : await openDb();
    unavailable = !db;
    storage = db ? idbProfileStorage() : memoryProfileStorage();
  }
  const s = storage;
  const profiles = await s.profiles().catch((): Profile[] => []);
  const wanted = ls?.getItem(CURRENT_PROFILE_KEY) ?? null;
  let profile =
    profiles.find((p) => p.id === wanted) ??
    [...profiles].sort((a, b) => b.openedAt.localeCompare(a.openedAt))[0] ??
    null;
  const created = !profile;
  if (!profile) profile = newProfile(FIRST_PROFILE_NAME, now);
  let migrated = false;
  try {
    migrated = await migrateLegacy(s, profile.id, ls);
  } catch {
    /* storage refused the move: today's data stays where it was, and the next boot tries again */
  }
  profile = { ...profile, openedAt: now };
  await s.putProfile(profile).catch(() => undefined);
  try {
    ls?.setItem(CURRENT_PROFILE_KEY, profile.id);
  } catch {
    /* the device won't remember which profile is current */
  }
  const docs = await s.docs(profile.id).catch(() => []);
  const kv = new ProfileKv(profile.id, s, docs);
  setActiveKv(kv);
  current = profile;
  publishKv(kv);
  return { profile, kv, migrated, created };
}

/** Makes another profile current and starts over (the picker, PR 5): the page reloads, so no state carries over. */
export function switchProfile(id: string): void {
  localStore()?.setItem(CURRENT_PROFILE_KEY, id);
  if (typeof location !== "undefined") location.reload();
}

/** The e2e's handle on the current profile's documents (debug mode only): a write resolves once it's in storage. */
export interface KvDebugHandle {
  readonly profile: string;
  getItem(key: string): string | null;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

declare global {
  interface Window {
    __psKv?: KvDebugHandle;
  }
}

function publishKv(kv: ProfileKv): void {
  if (typeof window === "undefined" || !debugOn()) return;
  const handle: KvDebugHandle = {
    profile: kv.profile,
    getItem: (k) => kv.getItem(k),
    setItem: async (k, v) => {
      kv.setItem(k, v);
      await kv.flush();
    },
    removeItem: async (k) => {
      kv.removeItem(k);
      await kv.flush();
    },
  };
  window.__psKv = handle;
}

/** For tests: forgets the booted profile. */
export function resetProfilesForTests(): void {
  current = null;
  storage = null;
  unavailable = false;
  setActiveKv(null);
}

export type { KvHandle };
export { activeKv };
