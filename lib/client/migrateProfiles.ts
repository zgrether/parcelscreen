/**
 * The move into the first profile (step 1 plan §3.5, approval C): the browser's pre-profile localStorage keys become
 * the profile's documents, and every kept screen is stamped with it, in one transaction. Only after it completes are
 * the keys renamed to `ps.legacy.*` (never deleted here: roadmap step 2's first PR deletes them), so a failure part-way
 * leaves today's data untouched and the move retries on the next open, and a second run finds no pre-profile key and
 * does nothing. Tested on a recorded store in migrateProfiles.test.ts.
 */
import { PROFILE_KEYS } from "./profileKv";
import type { ProfileDoc, ProfileStorage } from "./profileStore";

export const LEGACY_PREFIX = "ps.legacy.";

/** What the browser kept before profiles, in the order it's moved. */
export const LEGACY_KEYS: readonly string[] = [...PROFILE_KEYS];

export interface LegacyStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The pre-profile documents still in the browser's localStorage, as this profile's. */
export function legacyDocs(ls: LegacyStore, profile: string): ProfileDoc[] {
  const out: ProfileDoc[] = [];
  for (const key of LEGACY_KEYS) {
    const value = ls.getItem(key);
    if (value !== null) out.push({ profile, key, value });
  }
  return out;
}

/** Moves the pre-profile data into `profile`. Resolves true when something moved; throws when storage refused it. */
export async function migrateLegacy(
  storage: ProfileStorage,
  profile: string,
  ls: LegacyStore | null,
): Promise<boolean> {
  if (!ls) return false;
  const docs = legacyDocs(ls, profile);
  if (!docs.length) return false;
  await storage.adopt(profile, docs);
  for (const d of docs) {
    ls.setItem(LEGACY_PREFIX + d.key, d.value);
    ls.removeItem(d.key);
  }
  return true;
}
