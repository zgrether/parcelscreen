/**
 * What the Mark picker offers (owner, after #136): every kind of thing marked on a parcel, the house site and the lines
 * among them, in four groups, with the last three used first ("Recent", per browser). The kind sets the tool: a point
 * is one tap, a line its points then Finish, an area its corners then Finish; a septic permit is a point with one tap,
 * or its field's outline with more. Pure: the picker renders it, the controller starts the tool.
 */
import type { LineKind } from "./parcelStore";
import type { AreaKind, PointKind } from "@/lib/report/marks";

/** A picker choice: the house site, a line's kind, a point's kind, or a clearing (septic permits are either). */
export type MarkChoice = "house" | LineKind | PointKind | Exclude<AreaKind, "septic">;

/** How a choice is drawn: the house tool, a line, a point, an area, or a septic permit's point-or-field. */
export type MarkTool = "house" | "line" | "point" | "area" | "septic";

export const TOOL: Record<MarkChoice, MarkTool> = {
  house: "house",
  track: "line",
  drive: "line",
  easement: "line",
  spring: "point",
  stream: "point",
  well: "point",
  septic: "septic",
  power: "point",
  building: "point",
  campsite: "point",
  gate: "point",
  note: "point",
  clearing: "area",
};

/** Each choice's label in the picker. */
export const CHOICE_LABEL: Record<MarkChoice, string> = {
  house: "House site",
  track: "Track",
  drive: "Existing drive",
  easement: "Easement",
  spring: "Spring",
  stream: "Stream",
  well: "Well",
  septic: "Septic permit",
  power: "Power",
  building: "Building",
  campsite: "Campsite",
  clearing: "Clearing",
  gate: "Gate",
  note: "Note",
};

/** The picker's groups, in order (owner). */
export const CHOICE_GROUPS: readonly { title: string; choices: readonly MarkChoice[] }[] = [
  { title: "Build", choices: ["house"] },
  { title: "Ways in", choices: ["track", "drive", "easement"] },
  { title: "Water & utilities", choices: ["spring", "stream", "well", "septic", "power"] },
  { title: "On the land", choices: ["building", "campsite", "clearing", "gate", "note"] },
];

/** How many recent choices the picker shows above the groups. */
export const RECENT_MAX = 3;

const ALL = new Set<string>(Object.keys(TOOL));
export const isMarkChoice = (x: unknown): x is MarkChoice => typeof x === "string" && ALL.has(x);

/** The recent list after a choice: it moves to the front, each once, the oldest dropped past RECENT_MAX. */
export const withRecent = (recent: readonly MarkChoice[], c: MarkChoice): MarkChoice[] =>
  [c, ...recent.filter((x) => x !== c)].slice(0, RECENT_MAX);

/** A stored recent list: known choices only, each once, at most RECENT_MAX; anything else reads as none. */
export function readRecent(raw: string): MarkChoice[] {
  const v: unknown = JSON.parse(raw);
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter(isMarkChoice))].slice(0, RECENT_MAX);
}
