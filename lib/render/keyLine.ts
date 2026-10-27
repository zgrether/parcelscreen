/**
 * The map's key line (UX part 2 PR 3b2; the audit's P-2 and its finding 21, unexplained marks after a grade): one line
 * under the map naming what a graded parcel draws, "1 Best homesite · The app's driveway · Skyline rays", then "All map
 * marks", which opens the full key. The other pins (more sites, shelves, gardens, road entrances) stay off until the
 * full key's "Every pin" turns them on. Pure: which entries show, from what's drawn.
 */

export type KeyEntry =
  "best" | "standHere" | "driveway" | "yourRoute" | "second" | "over" | "direct" | "fan" | "allPins";

export const KEY_WORDS: Record<KeyEntry, string> = {
  best: "Best homesite",
  // Polish 2 (M2, M3): each mark the map draws is named as it shows; Stand here's words are its pin's title.
  standHere: "the view from there",
  driveway: "The app's driveway",
  yourRoute: "Your route",
  second: "Second choice",
  over: "Over your grade limit",
  direct: "Straight 4×4 track",
  // "Horizon fan" until polish 2 (M1).
  fan: "Skyline rays",
  allPins: "Every pin",
};
export const ALL_MARKS = "All map marks";

export interface KeyInputs {
  /** The pins overlay is on, and a best site is inked (none when a house is marked). */
  bestPin: boolean;
  /** The Stand here pin shows (the ground view can open). */
  standHere?: boolean;
  /** The driveway overlay is on and the result has a route (or the least-steep one). */
  route: boolean;
  /** The route drawn is the household's chosen line (WF5), not the app's pick. */
  yourRoute: boolean;
  /** The driveway overlay draws a dashed alternative, the over-limit route, or the straight track. */
  second?: boolean;
  over?: boolean;
  direct?: boolean;
  /** The fan overlay is on and the live session can draw it. */
  fan: boolean;
  /** Every pin is on: the line says so, as the full key's toggle does. */
  allPins: boolean;
}

export function keyEntries(i: KeyInputs): KeyEntry[] {
  const out: KeyEntry[] = [];
  if (i.bestPin) out.push("best");
  if (i.standHere) out.push("standHere");
  if (i.route) out.push(i.yourRoute ? "yourRoute" : "driveway");
  if (i.second) out.push("second");
  if (i.over) out.push("over");
  if (i.direct) out.push("direct");
  if (i.fan) out.push("fan");
  if (i.allPins) out.push("allPins");
  return out;
}
