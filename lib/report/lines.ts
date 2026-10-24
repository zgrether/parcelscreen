/**
 * The lines drawn with the parcel, in words (follow-up 34, owner's wording): their labels, a line's length and grades
 * ("938 ft · avg 11% · steepest 17% over 30 m"), and what the gates ask of a route that uses one.
 */
import { fmt } from "../format";
import { SCREEN_CONSTANTS } from "../screen/config";
import type { DrawnLine, PartialScreenResult } from "../screen/types";

/**
 * A drawn line in the report's sentences. The kinds are Track, Easement and Existing drive (owner, #127: no "Existing
 * track" anywhere; phase-0.md §9.38); the screen sees an existing drive as a track, so the report says "Track" for it.
 */
export const LINE_LABEL: Record<DrawnLine["kind"], string> = {
  track: "Track (user-drawn)",
  easement: "Easement (user-drawn)",
};

/** A line the result has that the parcel no longer does (owner, 2026-10-14): by its kind. */
export const DELETED_LINE_LABEL: Record<DrawnLine["kind"], string> = {
  track: "Track (user-drawn, since deleted)",
  easement: "Easement (user-drawn, since deleted)",
};

/**
 * The user's names for the parcel's lines, by id (owner, 2026-10-14): read from the parcel when the report is drawn, so a
 * line renamed after the screen reads by its new name. The screen result keeps only the id; no saved data changes.
 */
export type LineNames = ReadonlyMap<string, string>;

export const lineNamesOf = (markup: readonly { id: string; name: string }[]): LineNames =>
  new Map(markup.map((m) => [m.id, m.name]));

/**
 * A drawn line in a sentence: its current name; "Track (user-drawn, since deleted)" when the parcel no longer has it;
 * "Track (user-drawn)" when the report is drawn without the parcel's lines (`names` absent).
 */
export function lineLabel(l: DrawnLine, names?: LineNames): string {
  if (!names) return LINE_LABEL[l.kind];
  return names.get(l.id) ?? DELETED_LINE_LABEL[l.kind];
}

/** Whether `lineLabel` gives the user's own name, which a sentence keeps as typed (no lower-casing). */
export const isUserName = (l: DrawnLine, names?: LineNames): boolean => !!names?.has(l.id);

/** What the Access and Easement gates say of a drawn line the driveway uses (owner, #110). */
export const VERIFY_RIGHT_OF_WAY = "verify it's a legal right-of-way";

const WINDOW_M = SCREEN_CONSTANTS.driveway.gradeWindowsM.headline;

/** "938 ft · avg 11% · steepest 17% over 30 m"; the length alone when the line wasn't graded. */
export function lineSummary(l: DrawnLine): string {
  const len = `${fmt(l.lengthFt)} ft`;
  if (l.avgGradePct == null || l.maxGradePct == null) return len;
  return `${len} · avg ${Math.round(l.avgGradePct)}% · steepest ${Math.round(l.maxGradePct)}% over ${WINDOW_M} m`;
}

type Driveway = NonNullable<PartialScreenResult["driveway"]>;
type ScoredRoute = Driveway["routes"][number];

/** The route the card reads: the over-limit one when it is scored, else the first. */
export const scoredRoute = (d: Driveway): ScoredRoute | undefined => d.overLimit ?? d.routes[0];

/** The route the router found from a drawn line's end (its entrance away from the road), by the line's id. */
export function routeFromLine(r: PartialScreenResult, lineId: string): ScoredRoute | undefined {
  const d = r.driveway;
  const index = r.lines?.findIndex((l) => l.id === lineId) ?? -1;
  if (!d || index < 0) return undefined;
  const at = d.entrances.findIndex((e) => e.source === "drawn" && e.line === index);
  return at < 0 ? undefined : d.routes.find((x) => x.entranceIndex === at);
}

/**
 * The route the card scores (WF5, docs/plans/parcel-workflow.md §3.4): the one from the line the household chose as
 * its driveway, when this screen has a route from it; else the app's pick (`scoredRoute`). `yours` is the chosen
 * line when its route is scored; `lost`, that a line was chosen and this screen has no route from it.
 */
export interface Driven {
  route: ScoredRoute | undefined;
  pick: ScoredRoute | undefined;
  yours: DrawnLine | null;
  lost: boolean;
}

export function drivenRoute(r: PartialScreenResult, lineId: string | null | undefined): Driven {
  const pick = r.driveway ? scoredRoute(r.driveway) : undefined;
  if (!lineId) return { route: pick, pick, yours: null, lost: false };
  const mine = routeFromLine(r, lineId);
  const line = r.lines?.find((l) => l.id === lineId) ?? null;
  return mine && line
    ? { route: mine, pick, yours: line, lost: false }
    : { route: pick, pick, yours: null, lost: true };
}

/** The driveway the household chose (WF5), whole: the routed part and the drawn drive it starts from. */
export interface ChosenDrive {
  lengthFt: number;
  /** Its steepest: the drawn drive's own and the routed part's over 30 m, whichever is steeper. */
  gradePct: number;
  needsEasement: boolean;
}

/**
 * The chosen driveway as the card's Driveway row, Best homesite and the cost all quote it (owner, #308): the route
 * from the line, plus the existing drive it starts at (the route starts at that drive's end, and the cost upgrades
 * both). Null with no line chosen, or none this screen has a route from: then the app's route is read, as before.
 */
export function chosenDrive(r: PartialScreenResult, lineId: string | null | undefined): ChosenDrive | null {
  const d = drivenRoute(r, lineId);
  if (!d.yours || !d.route) return null;
  const rt = d.route;
  return {
    lengthFt: rt.metrics.lengthFt + (rt.existing?.lengthFt ?? 0),
    gradePct: Math.max(rt.maxGrade, rt.existing?.maxGradePct ?? -Infinity),
    needsEasement: rt.needsEasement,
  };
}

/**
 * Appended where an easement's "verify it's a legal right-of-way" was, when the household says where the easement is
 * recorded (owner, WF5; rule 7): it's no longer a warning, but it's still not the parcel's own land.
 */
export const recordedIn = (ref: string): string =>
  `recorded in ${ref} (your entry): make sure your deed includes this right-of-way`;

/** Appended to Legal road access and Easement needed when the chosen route's raw grade is over the veto (owner, WF5). */
export const steeperThanVeto = (e: NonNullable<ScoredRoute["existing"]>): string =>
  `your route is steeper than your veto (${Math.round(e.maxGradePct)}% vs ${fmt(e.vetoPct)}%)`;

/** The card's note when the chosen route isn't in this screen (owner, WF5). */
export const routeLost = (name: string): string =>
  `Your route from ${name} isn't in this screen: scored on the app's pick.`;

/** Appended to the Town and Trails panels when the chosen route meets the road elsewhere (owner, WF5): until WF6. */
export const DRIVES_FROM_PICK = "Drive times start where the app's pick meets the road.";

/** The drawn line a route starts from (its entrance is a line's end), if any. */
export function startLine(r: PartialScreenResult, rt: ScoredRoute): DrawnLine | null {
  const e = r.driveway?.entrances[rt.entranceIndex];
  return e?.source === "drawn" && e.line != null ? (r.lines?.[e.line] ?? null) : null;
}

/** The drawn lines a route starts from or runs along, in the order drawn. */
export const routeLines = (r: PartialScreenResult, rt: ScoredRoute): DrawnLine[] =>
  rt.lines.flatMap((i) => (r.lines?.[i] ? [r.lines[i]] : []));

/** "$12,400": a difference in dollars, to the hundred. */
const dollars = (n: number): string => `$${fmt(Math.round(n / 100) * 100)}`;

/**
 * What the run made of a drawn line (owner, A, 2026-10-13: the Easement panel says it after every run): "Track 2 was
 * used: …" or "Track 2 was considered but not used: …". `index` is the line's place in the result's `lines`; `name`
 * what the user calls it (owner, #127). Null when the result doesn't have the line (drawn after the screen).
 */
export function lineOutcome(
  r: PartialScreenResult,
  index: number,
  name: string,
  chosen: string | null = null,
): string | null {
  const line = r.lines?.[index];
  if (!line) return null;
  const d = r.driveway;
  // The route the card scores: the chosen line's (WF5), when there's one.
  const rt = drivenRoute(r, chosen).route;
  if (!d || !rt) return `${name} was considered but not used: no driveway was routed.`;
  if (rt.lines.includes(index)) {
    const from = startLine(r, rt)?.id === line.id;
    const how = from
      ? "the driveway starts from its far end, and follows it to the road"
      : line.kind === "easement" && rt.metrics.outsideFt > 0
        ? "the driveway crosses the neighbouring land inside it"
        : "the driveway runs along it";
    return `${name} was used: ${how}.`;
  }
  // The route the router found from the line's own entrance (its end away from the road), if it had one.
  const at = d.entrances.findIndex((e) => e.source === "drawn" && e.line === index);
  if (at < 0)
    return `${name} was considered but not used: neither end comes within ${fmt(
      Math.round(SCREEN_CONSTANTS.driveway.drawn.roadEndM * 3.28084),
    )} ft of a road, so the driveway can't start from it, and the app's route doesn't follow it.`;
  const mine = d.routes.find((x) => x.entranceIndex === at);
  if (!mine) return `${name} was considered but not used: no route from it reached the site.`;
  const why: string[] = [];
  const ex = mine.existing;
  if (ex && ex.maxGradePct > ex.vetoPct)
    why.push(`${fmt(Math.round(ex.maxGradePct))}% on the raw ground is over the ${fmt(ex.vetoPct)}% veto`);
  const extra = mine.cost.mid - rt.cost.mid;
  if (extra > 0)
    why.push(
      `${mine.metrics.lengthFt > rt.metrics.lengthFt ? "longer and " : ""}costlier than the app's pick by ${dollars(extra)}`,
    );
  if (!why.length) why.push("the app's pick scores better on its grade and cost");
  return `${name} was considered but not used: ${why.join("; ")}.`;
}
