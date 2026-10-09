/**
 * Reading `ScreenResult.drives`. In schema v2 the list holds destinations (the hospital, the chain grocery, each
 * anchor) and, last, possibly one annotation of the grocery row: the closer non-chain grocery (owner, #81).
 * v2 is frozen, so the annotation is marked rather than given its own field (v3 will: phase-0.md §9 v3 list).
 *
 * The mark: label === CLOSER_GROCERY **and** a non-empty `name`. Anchors are always stored with name "" (drive.ts),
 * so an anchor the user happens to call "Closer grocery" is still a destination; the hospital and grocery labels
 * are fixed. Every consumer goes through `splitDrives`, never `drives` directly.
 */
import type { ScreenResult } from "./types";

export type DriveEntry = NonNullable<ScreenResult["drives"]>[number];

/** The `drives` label of the chain-preferring grocery drive time (proto L1141). */
export const REAL_GROCERY = "Nearest real grocery";
/** The `drives` label of the closer non-chain grocery: an annotation of the REAL_GROCERY row, not a destination. */
export const CLOSER_GROCERY = "Closer grocery";

export const isCloserGrocery = (d: DriveEntry): boolean => d.label === CLOSER_GROCERY && d.name !== "";

/** The destinations, in order, and the closer grocery if there is one. */
export function splitDrives(drives: readonly DriveEntry[]): {
  destinations: DriveEntry[];
  closer: DriveEntry | null;
} {
  return {
    destinations: drives.filter((d) => !isCloserGrocery(d)),
    closer: drives.find(isCloserGrocery) ?? null,
  };
}
