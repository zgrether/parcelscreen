/**
 * What the browser kept before profiles, dropped (roadmap step 2, docs/plans/step-2-tennessee.md §9; the clean-break
 * rule, owner 10/17). Step 1 moved the pre-profile localStorage keys into the first profile and renamed them to
 * `ps.legacy.*`; the boot now deletes both kinds and moves nothing. Pre-profile keys still present mean a browser that
 * never opened step 1: its data is gone, and the menu says so once.
 */
import { PROFILE_KEYS } from "./profileKv";

/** The keys the app kept in localStorage before profiles: the profile keys of the time, and the weight switch. */
export const PRE_PROFILE_KEYS: readonly string[] = [
  "ps.parcels",
  // Keys added since (the rubrics, step 10's costs) were never in localStorage.
  ...[...PROFILE_KEYS].filter((k) => k !== "ps.rubricView" && k !== "ps.rubrics" && k !== "ps.costs"),
  "ps.person",
];

/** Step 1's move kept each moved key under this prefix. */
export const MOVED_PREFIX = "ps.legacy.";

/** The menu's line on the boot that dropped pre-profile data (step 2 plan §8 Q6). */
export const OLD_DATA_DROPPED = "Saved with an older version; screen it again.";

/** The device's localStorage, or a stand-in in tests. */
export interface DeviceStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Deletes the pre-profile keys and step 1's moved copies. True when a pre-profile key was there (data was dropped). */
export function dropOldData(ls: DeviceStore): boolean {
  let dropped = false;
  for (const key of PRE_PROFILE_KEYS) {
    if (ls.getItem(key) !== null) {
      dropped = true;
      ls.removeItem(key);
    }
    ls.removeItem(MOVED_PREFIX + key);
  }
  return dropped;
}
