/**
 * Starting, joining and leaving a synced space (step 5, docs/plans/step-5-sync.md §1–§3).
 *
 * - **Start:** a new code; the space is made; everything on this device goes up as its first copy (profiles, their
 *   parcels, then their screens, in batches under the server's limit); the device is joined.
 * - **Join:** the space's profiles and parcels replace this device's own (a clean break: nothing is merged), and its
 *   screens come as they're opened. The device stays joined.
 * - **Leave:** the device forgets the code and keeps its copy as it is. The space and the other devices aren't touched.
 */
import { getPref } from "@/lib/client/prefs";
import { activeKv, CURRENT_PROFILE_KEY, profileStorage } from "@/lib/client/profiles";
import { sharedKv, SPACE_ID } from "@/lib/client/profileKv";
import type { Profile } from "@/lib/client/profileStore";
import { getScreens } from "@/lib/client/screenStore";
import { createSpace, fetchChanges } from "./client";
import { generateCode } from "./code";
import { sendAll } from "./engine";
import { PARCELS_DOC, parseParcels, profileRecord, SYNCED_DOCS, type ProfileRecord } from "./records";
import { NO_UNSAVED, readSyncState, writeSyncState } from "./state";
import type { Changes, ParcelSave, ProfileSave, ScreenSave } from "./wire";

export interface Progress {
  /** "profiles" while the profiles and parcels go up, then "screens" with a count. */
  stage: "profiles" | "screens";
  done: number;
  total: number;
}

/** What this device holds: whether joining would replace anything, and how much. */
export interface LocalData {
  profiles: number;
  parcels: number;
}

async function docsOf(profile: string): Promise<Map<string, string>> {
  const docs =
    (await profileStorage()
      ?.docs(profile)
      .catch(() => [])) ?? [];
  return new Map(docs.map((d) => [d.key, d.value]));
}

export async function localData(): Promise<LocalData> {
  const profiles =
    (await profileStorage()
      ?.profiles()
      .catch(() => [])) ?? [];
  // The household's one list (step 6).
  const parcels = parseParcels((await docsOf(SPACE_ID)).get(PARCELS_DOC) ?? null).built.length;
  return { profiles: profiles.length, parcels };
}

/** A device with no parcels has nothing to lose by joining: its one empty profile is replaced quietly. */
export const holdsData = (d: LocalData): boolean => d.parcels > 0 || d.profiles > 1;

/** Starts syncing this device: resolves to the new code once everything is up. */
export async function startSyncing(progress: (p: Progress) => void): Promise<string> {
  const storage = profileStorage();
  if (!storage) throw new Error("This browser keeps no data, so there's nothing to sync.");
  // The household's parcels as the app keeps them once read (ranked in My order, named from their notes), written back
  // before the upload: otherwise the first read after joining would rewrite them all, and that automatic save could
  // land after another device's real edit and undo it (later save wins, whole). The read itself ranks, names and
  // writes back.
  getPref("ps.parcels");
  // The last writes reach storage first: the upload reads storage, not memory.
  await activeKv()?.flush();
  await sharedKv()?.flush();
  let code = generateCode();
  if ((await createSpace(code)) === "taken") {
    code = generateCode(); // 130 random bits: a second clash isn't going to happen
    if ((await createSpace(code)) === "taken") throw new Error("Couldn't make a new code. Try again.");
  }
  const profiles: ProfileSave[] = [];
  const parcels: ParcelSave[] = [];
  const screenIds: string[] = [];
  for (const p of await storage.profiles()) {
    const docs = await docsOf(p.id);
    const record: ProfileRecord = profileRecord(p, (k) => docs.get(k) ?? null);
    profiles.push({ id: p.id, record: { ...record } });
  }
  // The household's list and its screens (step 6): the space's, under SPACE_ID.
  for (const parcel of parseParcels((await docsOf(SPACE_ID)).get(PARCELS_DOC) ?? null).built)
    if (typeof parcel.key === "string") parcels.push({ key: parcel.key, profile: SPACE_ID, record: parcel });
  screenIds.push(...(await storage.screenIds(SPACE_ID)));
  progress({ stage: "profiles", done: 0, total: profiles.length + parcels.length });
  await sendAll(code, profiles, parcels, []);
  const screens: ScreenSave[] = (await getScreens(screenIds))
    .filter((r) => r.profile)
    .map((r) => ({
      id: r.id,
      profile: r.profile!,
      schemaVersion: r.result.schemaVersion,
      record: r as unknown as Record<string, unknown>,
    }));
  progress({ stage: "screens", done: 0, total: screens.length });
  await sendAll(code, [], [], screens, (done, total) => progress({ stage: "screens", done, total }));
  writeSyncState({ code, cursor: null, unsaved: NO_UNSAVED });
  return code;
}

/** The space this code opens, or null when no space has it. */
export const peekSpace = (code: string): Promise<Changes | null> => fetchChanges(code, null);

/**
 * Joins: this device's profiles, documents and screens are deleted, and the space's profiles and its list take their
 * place. Then the page loads Who's this? (step 6), where the person picks their profile or makes one.
 */
export async function joinSpace(code: string, space: Changes): Promise<void> {
  const storage = profileStorage();
  if (!storage) throw new Error("This browser keeps no data, so it can't join.");
  const now = new Date().toISOString();
  // A space always has someone in it. Joining one with no profile would leave this device to make one at its next
  // boot, which would then join the space as a new person: refuse instead, before anything here is replaced.
  if (!space.profiles.some((p) => !p.deleted && p.record))
    throw new Error("That synced space has no profiles in it yet. Start syncing on your other device again.");
  for (const p of await storage.profiles()) await storage.deleteProfile(p.id);
  // The household's shared documents and screens go too: SPACE_ID has no profile row, but the same delete clears them.
  await storage.deleteProfile(SPACE_ID);
  await storage.dropUnstamped().catch(() => undefined);
  const live = space.profiles.filter((p) => !p.deleted && p.record);
  const newest = [...live].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  for (const p of live) {
    const r = p.record as unknown as ProfileRecord;
    const profile: Profile = {
      id: p.id,
      name: r.name,
      createdAt: r.createdAt,
      openedAt: p.id === newest?.id ? now : r.createdAt,
    };
    await storage.putProfile(profile);
    for (const k of SYNCED_DOCS) {
      const v = r.docs?.[k];
      if (v !== undefined) await storage.putDoc({ profile: p.id, key: k, value: v });
    }
  }
  // The household's list: the space's parcels under SPACE_ID (rows from before step 6, kept per profile, are left).
  const built = space.parcels
    .filter((x) => x.profile === SPACE_ID && !x.deleted && x.record)
    .map((x) => x.record!);
  await storage.putDoc({
    profile: SPACE_ID,
    key: PARCELS_DOC,
    value: JSON.stringify({ v: 2, open: null, built }),
  });
  // They come as the other device keeps them, already named: the once-only naming from notes has nothing to do here.
  await storage.putDoc({ profile: SPACE_ID, key: "ps.namesFromNotes", value: "1" });
  writeSyncState({ code, cursor: space.cursor, unsaved: NO_UNSAVED });
  try {
    if (newest) localStorage.setItem(CURRENT_PROFILE_KEY, newest.id);
  } catch {
    /* the boot opens the most recently opened profile, which is this one */
  }
  // A full load, not a router push: the boot reads the joined profiles afresh. Then the person says who they are.
  location.replace(new URL("/who", location.origin).href);
}

/** Stops syncing on this device. It keeps its copy, and the page reloads to work unjoined. */
export async function leaveSync(): Promise<void> {
  if (!readSyncState()) return;
  writeSyncState(null);
  location.reload();
}
