/**
 * "House already here" (docs/plans/existing-house.md §1): a listing with a house already built. The parcel's house point
 * carries an `existing` flag (Zach, #416 review); with it, the card is graded at the house, and what assumes you'll build
 * is set aside by the app, never failed: Room to build, the Septic Must, the Driveway row when no existing drive is
 * drawn, and Within budget's Ready to build. Each gets a "verify" line instead. Without the flag the house point is a
 * planned site ("House site"), graded as before. Words and the pure test of the flag; card.ts applies them. Pure.
 */
import type { Factor } from "../rubric/types";
import type { Drawn } from "./marks";

/** The reason every app-set-aside row carries. */
export const HOUSE_HERE = "House already here";

/** The answer line's phrase for them: "3 set aside: a house is already here". */
export const houseHereAside = (n: number): string => `${n} set aside: a house is already here`;

/** What to check instead of what's set aside (plan §1b), by factor. */
export const VERIFY: Partial<Record<Factor, string>> = {
  septic:
    "Get the health department's permit and its system type. If it's an alternative system, get the maintenance manual and the operator's log.",
  room: "Not graded: a house is already here. Shelves and garden ground are listed below for a shop or a garden.",
  driveway: "Existing: walk and measure it.",
  budget: "House already here: finishing and repair costs aren't estimated.",
};

/** Cost to enjoy's line in Ready to build's place (plan §1c). */
export const NO_BUILD_COST = "House already here — finishing and repair costs aren't estimated.";

/** Best homesite's spot, and the drawn drive's, in the card's words. */
export const THE_HOUSE = "the house";
export const THE_EXISTING_DRIVE = "the existing drive";

/** The Full report's "House sites found" line with the flag (plan §1b). */
export const SITES_NOT_SEARCHED = "Not searched: a house is already here";

/** The picker's choice and the mark's name with the flag (plan §1a). */
export const HOUSE_HERE_LABEL = "House already here";

/** Questions for the agent, after the list, with the flag (plan §1d). */
export const EXISTING_HOUSE_QUESTIONS = [
  "Permits for the house, and its certificate of occupancy?",
  "The septic permit, and its system type (conventional or alternative)?",
  "The well's yield (gallons a minute), and a recent water test?",
  "The solar and battery specs, and an electrical inspection?",
  "A homeowner's insurance quote for the address?",
] as const;

/** The parcel's facts with the flag: the existing house, and its drawn existing drives' ids (the Driveway row grades one). */
export interface ExistingHouseFact {
  drives: string[];
}

/** Whether the card reads the marked house as already built: the flag set, and a house assessed on the parcel. */
export function isExistingHouse(
  r: { house?: { outside?: true } | object | null },
  drawn: Pick<Drawn, "facts"> | undefined,
): boolean {
  const h = r.house;
  return !!drawn?.facts?.existingHouse && !!h && !("outside" in h);
}
