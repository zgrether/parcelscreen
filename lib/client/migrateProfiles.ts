/**
 * The move into the first profile (step 1 plan §3.5, approval C): the browser's pre-profile localStorage keys become
 * the profile's documents, and every kept screen is stamped with it, in one transaction. Only after it completes are
 * the keys renamed to `ps.legacy.*` (never deleted here: roadmap step 2's first PR deletes them), so a failure part-way
 * leaves today's data untouched and the move retries on the next open, and a second run finds no pre-profile key and
 * does nothing. Tested on a recorded store in migrateProfiles.test.ts.
 */
import { defaultRubric, rubricFromWeights } from "@/lib/rubric/default";
import { MINE, type RowKey } from "@/lib/rubric/types";
import { PROFILE_KEYS } from "./profileKv";
import type { ProfileDoc, ProfileStorage } from "./profileStore";

export const LEGACY_PREFIX = "ps.legacy.";

/**
 * What the browser kept before profiles, in the order it's moved: the profile keys of the time (`ps.person`, the weight
 * switch, became `ps.rubricView`; the rubrics are new).
 */
export const LEGACY_KEYS: readonly string[] = [
  ...[...PROFILE_KEYS].filter((k) => k !== "ps.rubricView" && k !== "ps.rubrics"),
  "ps.person",
];

/**
 * The second weight set the app shipped with (config `card.weights.julie` until step 1): the migration carries it as an
 * "other" rubric of the first profile, named as it was, so the switch and the list's second column keep working from
 * data (owner, step 1 plan §8 Q3). Step 5 deletes this with its name, once rubric import exists.
 */
export const LEGACY_SECOND_WEIGHTS: Record<RowKey, number> = {
  elevation: 10,
  homesite: 15,
  sky: 10,
  room: 10,
  trails: 25,
  town: 10,
  garden: 20,
};
export const LEGACY_SECOND_NAME = "Julie";
export const LEGACY_SECOND_ID = "legacy-second";

export interface LegacyStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The pre-profile keys still in the browser's localStorage, with their values. */
export function legacyEntries(ls: LegacyStore): { key: string; value: string }[] {
  const out: { key: string; value: string }[] = [];
  for (const key of LEGACY_KEYS) {
    const value = ls.getItem(key);
    if (value !== null) out.push({ key, value });
  }
  return out;
}

/**
 * The pre-profile data as this profile's documents: the keys as they were (the weight switch becomes the rubric view),
 * plus the profile's rubrics: its own is the default, and the second weight set rides along as another's.
 */
export function legacyDocs(ls: LegacyStore, profile: string): ProfileDoc[] {
  const entries = legacyEntries(ls);
  if (!entries.length) return [];
  const person = entries.find((e) => e.key === "ps.person")?.value;
  const docs: ProfileDoc[] = entries.filter((e) => e.key !== "ps.person").map((e) => ({ profile, ...e }));
  docs.push({
    profile,
    key: "ps.rubrics",
    value: JSON.stringify({
      mine: defaultRubric(),
      others: [
        { id: LEGACY_SECOND_ID, name: LEGACY_SECOND_NAME, rubric: rubricFromWeights(LEGACY_SECOND_WEIGHTS) },
      ],
    }),
  });
  docs.push({ profile, key: "ps.rubricView", value: person === "julie" ? LEGACY_SECOND_ID : MINE });
  return docs;
}

/** Moves the pre-profile data into `profile`. Resolves true when something moved; throws when storage refused it. */
export async function migrateLegacy(
  storage: ProfileStorage,
  profile: string,
  ls: LegacyStore | null,
): Promise<boolean> {
  if (!ls) return false;
  const entries = legacyEntries(ls);
  if (!entries.length) return false;
  await storage.adopt(profile, legacyDocs(ls, profile));
  for (const e of entries) {
    ls.setItem(LEGACY_PREFIX + e.key, e.value);
    ls.removeItem(e.key);
  }
  return true;
}
