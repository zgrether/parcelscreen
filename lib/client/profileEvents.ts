/**
 * The page's events about profiles and rubrics, in a module of their own so the profiles, the members (household.ts)
 * and the rubrics can all say and hear them without importing each other.
 */

/** After the current profile's rubrics change (an import's "Replace my rubric too", a member's sync): pages re-read. */
export const RUBRICS_CHANGED = "ps:rubrics";
/** After a profile other than this page's changes (an add, a rename, a delete, a sync): the members reload. */
export const PROFILES_CHANGED = "ps:profiles";

export function profilesChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PROFILES_CHANGED));
}
