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
// Polish 2 (Z4, owner): what a river's class is, in passing.
export const RIVER_CAUTION = "check the river's class (how hard its rapids are) before paddling";
/** The panel's lead-in to them, after the graded line. */
export const RIVERS_NOT_GRADED = "river put-ins, not graded:";

const KM_PER_MI = 1.609344;

/**
 * "18 min to Watauga Lake, Rat Branch"; the water left out when NHD has no name for it, or when the launch's name
 * already says it (an unnamed launch is "<water> access": "60 min to South Holston Lake access").
 */
export function flatLine(f: NonNullable<Paddling["flat"]>): string {
  const named = !f.water || f.name.includes(f.water);
  return `${fmt(f.min)} min to ${named ? f.name : `${f.water}, ${f.name}`}`;
}

export const NO_FLATWATER = `No lake or reservoir launch within ${fmt(SCREEN_CONSTANTS.paddling.maxKm)} km`;

type PutIn = Paddling["rivers"][number];

/**
 * The put-ins, nearest first, each name on its river once (the nearest kept): OSM often has a river's "<river> access"
 * a few hundred metres apart, as distinct launches with one name.
 */
export function distinctPutIns(rivers: readonly PutIn[]): PutIn[] {
  const seen = new Set<string>();
  return [...rivers]
    .sort((a, b) => a.km - b.km)
    .filter((r) => {
      const key = `${r.river ?? ""}|${r.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/**
 * "Watauga River: Guy Ford access, 6.0 mi straight — check the river's class before paddling"; a river's put-ins
 * together, rivers in the order of their nearest, the caution once: "New River: Fries access, 5.7 mi straight;
 * Byllesby access, 9.1 mi straight; Little River: Riner access, 12.0 mi straight — check the river's class before
 * paddling". Straight-line, as a put-in isn't timed.
 */
export function riversLine(rivers: readonly PutIn[]): string {
  const byRiver = new Map<string, PutIn[]>();
  for (const r of distinctPutIns(rivers))
    byRiver.set(r.river ?? "", [...(byRiver.get(r.river ?? "") ?? []), r]);
  const groups = [...byRiver.entries()].map(
    ([river, rs]) =>
      `${river ? `${river}: ` : ""}${rs.map((r) => `${r.name}, ${fmt(r.km / KM_PER_MI, 1)} mi straight`).join("; ")}`,
  );
  return `${groups.join("; ")} — ${RIVER_CAUTION}`;
}

/** "And a pond on the land you could paddle (1.4 ac)". */
export function pondLine(p: NonNullable<Paddling["pond"]>): string {
  return `And a pond on the land you could paddle (${fmt(p.acres, 1)} ac)`;
}

/** What the section says about its reach. */
export const PADDLE_REACH = `The ${SCREEN_CONSTANTS.paddling.points} nearest lake and reservoir launches within ${fmt(SCREEN_CONSTANTS.paddling.maxKm / KM_PER_MI)} mi in a straight line are timed by road; river put-ins within ${fmt(SCREEN_CONSTANTS.paddling.riverKm / KM_PER_MI)} mi are listed, not timed or graded.`;
