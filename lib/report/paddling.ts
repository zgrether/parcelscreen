/**
 * Paddling's words (roadmap step 14d, docs/plans/step-14d-places.md §4.2, §9): the card row's line and detail, the
 * report section's heading and sources. Pure; the card (card.ts paddling) and the Paddling block read it.
 */
import { fmt } from "../format";
import { SCREEN_CONSTANTS } from "../screen/config";
import type { Paddling } from "../screen/paddling";
import type { Heading } from "./parts";

export const paddlingHeading: Heading = { title: "Paddling", slug: "paddling", help: "h-paddle" };

/** Where the launches come from (plan §2.3). */
export const PADDLE_SOURCES =
  "Launches: OpenStreetMap contributors (slipways, put-ins and access points) and the US Forest Service; lakes and rivers from USGS's National Hydrography Dataset.";

/** River put-ins are listed with this, never graded (owner's brief, 10/25). */
export const RIVER_CAUTION = "check the river's class before paddling";

const KM_PER_MI = 1.609344;

/** "18 min to Watauga Lake, Rat Branch"; the water left out when NHD has no name for it. */
export function flatLine(f: NonNullable<Paddling["flat"]>): string {
  return `${fmt(f.min)} min to ${f.water ? `${f.water}, ${f.name}` : f.name}`;
}

export const NO_FLATWATER = `No lake or reservoir launch within ${fmt(SCREEN_CONSTANTS.paddling.maxKm)} km`;

/** "Watauga River: Guy Ford access, 6.0 mi — check the river's class before paddling". */
export function riverLine(r: Paddling["rivers"][number]): string {
  return `${r.river ? `${r.river}: ` : ""}${r.name}, ${fmt(r.km / KM_PER_MI, 1)} mi — ${RIVER_CAUTION}`;
}

/** "And a pond on the land you could paddle (1.4 ac)". */
export function pondLine(p: NonNullable<Paddling["pond"]>): string {
  return `And a pond on the land you could paddle (${fmt(p.acres, 1)} ac)`;
}

/** What the section says about its reach. */
export const PADDLE_REACH = `The ${SCREEN_CONSTANTS.paddling.points} nearest lake and reservoir launches within ${fmt(SCREEN_CONSTANTS.paddling.maxKm / KM_PER_MI)} mi in a straight line are timed by road; river put-ins within ${fmt(SCREEN_CONSTANTS.paddling.riverKm / KM_PER_MI)} mi are listed, not timed or graded.`;
