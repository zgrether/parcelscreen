/**
 * Reading the drive times. `ScreenResult.drives` holds the destinations (the hospital, the chain grocery, each
 * anchor); the closer non-chain grocery, an annotation of the grocery row (owner, #81), is `closerGrocery`. Schema
 * v2 kept it last in `drives`, marked by its label; v3 gives it its own field (B2a; phase-0.md §9.20 (d)).
 */
import type { ScreenResult } from "./types";

export type DriveEntry = NonNullable<ScreenResult["drives"]>[number];

/** The `drives` label of the hospital drive time (proto L1141). */
export const NEAREST_HOSPITAL = "Nearest hospital";
/**
 * Appended to the chosen hospital's name when the snapshot doesn't list it with emergency=yes (owner, A2c;
 * rule 7, appended). Since v3 the status is the row's `er` and the name is the hospital's own (phase-0.md §9.20
 * (e)); the report appends this when `er` is "not-listed" (driveName).
 */
export const ER_NOT_LISTED = " — emergency department not listed in OpenStreetMap";

/** A drive's name as the report shows it: the hospital's with the ER note when it isn't listed. */
export const driveName = (d: DriveEntry): string => (d.er === "not-listed" ? d.name + ER_NOT_LISTED : d.name);

/** The `drives` label of the chain-preferring grocery drive time (proto L1141). */
export const REAL_GROCERY = "Nearest real grocery";
/** The label of the closer non-chain grocery: an annotation of the REAL_GROCERY row, not a destination. */
export const CLOSER_GROCERY = "Closer grocery";

/** The destinations, in order, and the closer grocery if there is one. */
export function splitDrives(r: Pick<ScreenResult, "drives" | "closerGrocery">): {
  destinations: DriveEntry[];
  closer: DriveEntry | null;
} {
  return { destinations: r.drives ?? [], closer: r.closerGrocery ?? null };
}

/** In `noResponse` when the parking query didn't answer (follow-up 54): the drives go to the trailhead points. */
export const TRAILHEAD_PARKING = "Overpass (trailhead parking)";

/**
 * In `noResponse` when OSRM routed none of the trailheads it was asked for, though the drive step ran (follow-up 54,
 * #123 testing): the Trails row falls back to the straight line, marked incomplete. Recorded, not inferred: a result
 * with no record of it is never read as a failure.
 */
export const TRAILHEAD_DRIVES = "OSRM (trailhead drives)";
