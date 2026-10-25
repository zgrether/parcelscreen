/**
 * The map's key line (UX part 2 PR 3b2; the audit's P-2 and its finding 21, unexplained marks after a grade): one line
 * under the map naming what a graded parcel draws, "1 Best homesite · The app's driveway · Horizon fan", then "All map
 * marks", which opens the full key. The other pins (more sites, shelves, gardens, road entrances) stay off until the
 * full key's "Every pin" turns them on. Pure: which entries show, from what's drawn.
 */

export type KeyEntry = "best" | "driveway" | "yourRoute" | "fan" | "allPins";

export const KEY_WORDS: Record<KeyEntry, string> = {
  best: "Best homesite",
  driveway: "The app's driveway",
  yourRoute: "Your route",
  fan: "Horizon fan",
  allPins: "Every pin",
};
export const ALL_MARKS = "All map marks";

export interface KeyInputs {
  /** The pins overlay is on, and a best site is inked (none when a house is marked). */
  bestPin: boolean;
  /** The driveway overlay is on and the result has a route (or the least-steep one). */
  route: boolean;
  /** The route drawn is the household's chosen line (WF5), not the app's pick. */
  yourRoute: boolean;
  /** The fan overlay is on and the live session can draw it. */
  fan: boolean;
  /** Every pin is on: the line says so, as the full key's toggle does. */
  allPins: boolean;
}

export function keyEntries(i: KeyInputs): KeyEntry[] {
  const out: KeyEntry[] = [];
  if (i.bestPin) out.push("best");
  if (i.route) out.push(i.yourRoute ? "yourRoute" : "driveway");
  if (i.fan) out.push("fan");
  if (i.allPins) out.push("allPins");
  return out;
}
