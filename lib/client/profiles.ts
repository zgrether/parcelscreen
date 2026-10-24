/**
 * The current profile (roadmap step 1; docs/plans/step-1-profiles-grading.md §3.4): booted before the app renders
 * (components/Profile/ProfileGate.tsx). The device remembers which profile is current (localStorage `ps.profile`);
 * without one, the most recently opened profile is current, and with none at all a first one is created ("Profile 1",
 * renamed from the picker). Data from before profiles is dropped, not moved (oldData.ts; the clean-break rule).
 * Where IndexedDB is refused, the profile lives in memory and nothing outlives the page; the menu says so.
 */
import { debugOn } from "./debugHandle";
import { openDb } from "./db";
import { dropOldData, type DeviceStore } from "./oldData";
import {
  activeKv,
  isSharedKey,
  ProfileKv,
  setActiveKv,
  setSharedKv,
  sharedKv,
  SPACE_ID,
  type KvHandle,
} from "./profileKv";
import { idbProfileStorage, memoryProfileStorage, type Profile, type ProfileStorage } from "./profileStore";
import { onboardingDoc, onboardingOn } from "./onboarding";
import { profilesChanged } from "./profileEvents";
import { syncHooks } from "./syncHooks";

/** The device's current profile, by id. */
export const CURRENT_PROFILE_KEY = "ps.profile";
/** The name a profile gets when it's created without one (owner, step 1 plan §8 Q4). */
export const FIRST_PROFILE_NAME = "Profile 1";

let current: Profile | null = null;
let storage: ProfileStorage | null = null;
let unavailable = false;
/** The device's store the boot read `ps.profile` from: what a switch or a delete writes (tests pass a fake). */
let device: DeviceStore | null = null;
/** Whether this page's boot dropped pre-profile data: the menu says so, once. */
let droppedOld = false;

export const currentProfile = (): Profile | null => current;
export const currentProfileId = (): string | null => current?.id ?? null;
/** Whether the browser refused IndexedDB: the profile is in memory and nothing is kept. */
export const storageUnavailable = (): boolean => unavailable;
/** Whether the boot found data from before profiles and dropped it (the menu's one-time line). */
export const oldDataDropped = (): boolean => droppedOld;
/** The storage the boot chose; null before the boot. */
export const profileStorage = (): ProfileStorage | null => storage;

export function newProfile(name: string, now: string = new Date().toISOString()): Profile {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return { id, name, createdAt: now, openedAt: now };
}

function localStore(): DeviceStore | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export interface BootOptions {
  storage?: ProfileStorage;
  ls?: DeviceStore | null;
  now?: string;
}

export interface Booted {
  profile: Profile;
  kv: ProfileKv;
  /** Whether this boot found pre-profile data and dropped it. */
  droppedOld: boolean;
  /** Whether the profile was created on this boot (a first visit). */
  created: boolean;
}

/**
 * Chooses or creates the current profile, drops any data from before profiles, loads the profile's documents and
 * makes them the prefs' store. Never throws: storage failures leave an in-memory profile.
 */
export async function bootProfiles(opts: BootOptions = {}): Promise<Booted> {
  const now = opts.now ?? new Date().toISOString();
  const ls = opts.ls === undefined ? localStore() : opts.ls;
  device = ls;
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
  let dropped = false;
  try {
    dropped = ls ? dropOldData(ls) : false;
  } catch {
    /* localStorage refused: the keys stay, and the next boot tries again */
  }
  // Screens kept before profiles have no profile stamp: no profile can open them, so they go with the keys.
  if (dropped) await s.dropUnstamped().catch(() => undefined);
  profile = { ...profile, openedAt: now };
  await s.putProfile(profile).catch(() => undefined);
  try {
    ls?.setItem(CURRENT_PROFILE_KEY, profile.id);
  } catch {
    /* the device won't remember which profile is current */
  }
  // Step 6's clean break (docs/plans/step-6-household.md §1): the list is the household's now, kept under SPACE_ID.
  // Until there is one, each profile's own list and its screens are dropped, with no converter: the menu says so once,
  // and Export file → Import file brings them back.
  let sharedDocs = await s.docs(SPACE_ID).catch(() => []);
  if (!sharedDocs.some((d) => d.key === "ps.parcels")) {
    let gone = 0;
    for (const p of profiles)
      if ((await s.docs(p.id).catch(() => [])).some((d) => d.key === "ps.parcels")) {
        await s.deleteDoc(p.id, "ps.parcels").catch(() => undefined);
        gone++;
      }
    gone += await s.dropProfileScreens().catch(() => 0);
    if (gone > 0) {
      dropped = true;
      sharedDocs = await s.docs(SPACE_ID).catch(() => []);
    }
  }
  setSharedKv(new ProfileKv(SPACE_ID, s, sharedDocs));
  const docs = await s.docs(profile.id).catch(() => []);
  const kv = new ProfileKv(profile.id, s, docs);
  // A first visit's profile starts with the interview (step 4, owner Q9).
  if (created && onboardingOn()) kv.setItem("ps.interview", JSON.stringify(onboardingDoc()));
  setActiveKv(kv);
  current = profile;
  droppedOld = dropped;
  publishKv(kv);
  return { profile, kv, droppedOld: dropped, created };
}

/**
 * Reloads the page once every write queued so far has reached storage (#154 review): a switch, an add or a delete
 * right after an edit must not lose it. In Node (the tests) there is no page to reload; the wait still happens.
 */
export async function reloadAfterWrites(): Promise<void> {
  await activeKv()?.flush();
  await syncSent();
  if (typeof location !== "undefined") location.reload();
}

/**
 * On a synced device, what's waiting to be saved goes before the page does (the UX audit's B-2): a save the reload cut
 * off left its "unsaved" mark, and the next page said "A change on this device wasn't saved: New member" right after
 * "I'm new here". At most a few seconds; one that fails is kept and said at the next open, as before.
 */
async function syncSent(): Promise<void> {
  const sent = syncHooks()?.flush();
  if (sent)
    await Promise.race([sent.catch(() => undefined), new Promise((r) => setTimeout(r, SYNC_WAIT_MS))]);
}
const SYNC_WAIT_MS = 4000;

/**
 * Makes another profile current and starts over (the picker, PR 5): the page reloads, so no state carries over. The
 * current profile's pending writes land first, then the device's choice is written, then the reload.
 */
export async function switchProfile(id: string, to?: string): Promise<void> {
  await activeKv()?.flush();
  await syncSent();
  try {
    (device ?? localStore())?.setItem(CURRENT_PROFILE_KEY, id);
  } catch {
    /* the device won't remember it: the boot then opens the most recently opened profile */
  }
  // `to`: a page to open instead of reloading this one (a new profile goes to its interview).
  if (typeof location !== "undefined") {
    if (to) location.assign(to);
    else location.reload();
  }
}

/** Every profile, the most recently opened first: the picker's order. The current one alone before the boot. */
export async function listProfiles(): Promise<Profile[]> {
  const s = storage;
  if (!s) return current ? [current] : [];
  const all = await s.profiles().catch((): Profile[] => []);
  return all.sort((a, b) => b.openedAt.localeCompare(a.openedAt));
}

/** A new profile, kept but not current: the picker switches to it next, and it starts with the interview (step 4). */
export async function addProfile(name: string, now: string = new Date().toISOString()): Promise<Profile> {
  const p = newProfile(name, now);
  await storage?.putProfile(p);
  await storage?.putDoc({ profile: p.id, key: "ps.interview", value: JSON.stringify(onboardingDoc()) });
  syncHooks()?.profileChanged(p.id);
  profilesChanged();
  return p;
}

export async function renameProfile(id: string, name: string): Promise<void> {
  const s = storage;
  if (!s) return;
  const p = (await s.profiles()).find((x) => x.id === id);
  if (!p) return;
  const next = { ...p, name };
  await s.putProfile(next);
  if (current?.id === id) current = next;
  syncHooks()?.profileChanged(id);
  profilesChanged();
}

/**
 * Deletes a profile with its documents and its kept screens. Deleting the current one forgets the device's choice;
 * the caller reloads, and the boot opens the most recently opened profile left, or creates a first one again.
 */
export async function deleteProfile(id: string): Promise<{ wasCurrent: boolean }> {
  const s = storage;
  if (!s) return { wasCurrent: false };
  await s.deleteProfile(id);
  // On a joined device it goes everywhere (owner, 10/19, step 5 plan §11 Q5).
  syncHooks()?.profileDeleted(id);
  profilesChanged();
  const wasCurrent = current?.id === id;
  if (wasCurrent) {
    try {
      (device ?? localStore())?.removeItem(CURRENT_PROFILE_KEY);
    } catch {
      /* the stale choice is harmless: the boot falls back when it finds no such profile */
    }
  }
  return { wasCurrent };
}

/** The e2e's handle on the current profile's documents (debug mode only): a write resolves once it's in storage. */
export interface KvDebugHandle {
  readonly profile: string;
  getItem(key: string): string | null;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  /** Resolves once the app's own writes so far are in storage: the e2e flushes before it reloads. */
  flush(): Promise<void>;
}

declare global {
  interface Window {
    __psKv?: KvDebugHandle;
  }
}

function publishKv(kv: ProfileKv): void {
  if (typeof window === "undefined" || !debugOn()) return;
  // The household's shared documents (step 6: the list) go to the shared store, as the prefs module routes them.
  const to = (k: string): ProfileKv => (isSharedKey(k) && sharedKv()) || kv;
  const handle: KvDebugHandle = {
    profile: kv.profile,
    getItem: (k) => to(k).getItem(k),
    setItem: async (k, v) => {
      to(k).setItem(k, v);
      await to(k).flush();
    },
    removeItem: async (k) => {
      to(k).removeItem(k);
      await to(k).flush();
    },
    flush: () => Promise.all([kv.flush(), sharedKv()?.flush()]).then(() => undefined),
  };
  window.__psKv = handle;
}

/** For tests: forgets the booted profile. */
export function resetProfilesForTests(): void {
  current = null;
  storage = null;
  unavailable = false;
  device = null;
  droppedOld = false;
  setActiveKv(null);
  setSharedKv(null);
}

export type { KvHandle };
export { activeKv };
