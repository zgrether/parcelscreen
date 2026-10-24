/**
 * What Split says (step 14, docs/plans/step-14-land-uses.md §5, §9 Split; CLAUDE.md rule 7: all new, additive). The
 * Divide answer's "Try a split" is DIVIDE.trySplit (lib/uses/words.ts).
 */
import { fmt } from "../format";

export const SPLIT_WORDS = {
  /** §9 Split. */
  section: "Keep this, sell that",
  draw: "Draw where you'd split it",
  grade: "Grade both pieces",
  grading: (i: number) => `Grading piece ${i} of 2…`,
  piece: (side: string, acres: number) => `${side} piece, ${fmt(acres, 1)} ac`,
  passes: "Passes the county's lot size and frontage",
  under: (rule: string) => `Under the county's ${rule}`,
  rename: "Rename",
  remove: "Remove this split",
  adjust: "Adjust the line",
  add: "Add this piece to the list",
  failed: "This piece didn't grade",
  /** Beyond §9's list, each filling one of its slots or naming what it names. */
  defaultName: (n: number) => `Split ${n}`,
  minLot: (acres: number) => `${fmt(acres, acres < 10 ? 2 : 0)} ac minimum lot`,
  frontagePerLot: (feet: number) => `${fmt(feet)} ft of road frontage per lot`,
  /** The county has no frontage rule we could read: the lot size alone is checked. */
  passesLot: "Passes the county's lot size",
  /** The piece kept as a parcel of its own: "Mud Creek, North piece". */
  listName: (parent: string, side: string) => `${parent}, ${side} piece`,
  tryAgain: "Try again",
} as const;

/** A piece's side, by the compass point it faces from the line (8 points). */
export const SIDE_WORD: readonly string[] = [
  "North",
  "Northeast",
  "East",
  "Southeast",
  "South",
  "Southwest",
  "West",
  "Northwest",
];
