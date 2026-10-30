/**
 * Climbing's words (roadmap step 17, docs/plans/step-17-climbing.md §4, §8): the card row's line and its panel note,
 * the report section's heading and sources. The access note is read from the curated list by the area's id, so a
 * corrected note shows on a kept grade too. Pure; the card (card.ts climbing) and the Climbing block read it.
 */
import { fmt } from "../format";
import { parseCrags, type CragEntry } from "../places/crags";
import cragsJson from "../screen/data/crags.json";
import { SCREEN_CONSTANTS } from "../screen/config";
import type { Climbing } from "../screen/climbing";
import type { Heading } from "./parts";

export const climbingHeading: Heading = { title: "Climbing", slug: "climbing", help: "h-climb" };

/** Where the areas come from (plan §2.3). */
export const CLIMB_SOURCES =
  "Climbing areas: Parcel Screen's own list, read from the land managers' and the climbing coalitions' pages; parking © OpenStreetMap contributors.";

/** What a rope area is, once (plan §7). */
export const ROPE_MEANS = "Rope area: sport or trad";

const KM_PER_MI = 1.609344;

export const NO_ROPE = `No sport or trad area within ${fmt(SCREEN_CONSTANTS.climbing.maxKm)} km`;
export const NO_BOULDER = `No bouldering area within ${fmt(SCREEN_CONSTANTS.climbing.maxKm)} km`;

/** "38 min to Hidden Valley (Washington County) (sport, trad, top-rope)". */
export function ropeLine(r: NonNullable<Climbing["rope"]>): string {
  return `${fmt(r.min)} min to ${r.name} (${r.types.join(", ")})`;
}

/** "Bouldering: Grayson Highlands State Park: Massie Gap, 27 min", or that there's none within reach. */
export function boulderLine(b: Climbing["boulder"]): string {
  return b ? `Bouldering: ${b.name}, ${fmt(b.min)} min` : NO_BOULDER;
}

/** "3 rope areas within an hour", "1 rope area within an hour", "No rope area within an hour". */
export function withinLine(n: number): string {
  const hour =
    SCREEN_CONSTANTS.climbing.countWithinMin === 60
      ? "an hour"
      : `${fmt(SCREEN_CONSTANTS.climbing.countWithinMin)} minutes`;
  if (n === 0) return `No rope area within ${hour}`;
  return `${fmt(n)} rope area${n === 1 ? "" : "s"} within ${hour}`;
}

let byId: Map<string, CragEntry> | null = null;

/** The curated area by its id (the result's `rope.id`), if the list still has it. */
export function cragById(id: string): CragEntry | undefined {
  byId ??= new Map(parseCrags(cragsJson).map((c) => [c.id, c]));
  return byId.get(id);
}

/** "Access: South Cumberland State Park: free online climbing registration each visit", without its full stop. */
export function accessLine(id: string): string | null {
  const c = cragById(id);
  return c ? `Access: ${c.access.replace(/\.$/, "")}` : null;
}

/**
 * The row's panel note, read after the row's line and a semicolon (CardPanel): bouldering and the count, then the rope
 * area's access note as the list words it (it names its manager), then what "rope" means.
 */
export function climbingNote(c: Climbing): string {
  const access = c.rope ? cragById(c.rope.id)?.access.replace(/\.$/, "") : undefined;
  const boulder = c.boulder
    ? `bouldering at ${c.boulder.name}, ${fmt(c.boulder.min)} min`
    : NO_BOULDER.replace(/^No/, "no");
  return [boulder, withinLine(c.ropeWithin), ...(access ? [access] : []), ROPE_MEANS].join(". ");
}

/** What the section says about its reach. */
export const CLIMB_REACH = `The ${SCREEN_CONSTANTS.climbing.ropePoints} nearest rope areas and ${SCREEN_CONSTANTS.climbing.boulderPoints} nearest bouldering areas within ${fmt(SCREEN_CONSTANTS.climbing.maxKm / KM_PER_MI)} mi in a straight line are timed by road, from where the driveway meets the road.`;
