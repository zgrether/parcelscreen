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
export function lineOutcome(r: PartialScreenResult, index: number, name: string): string | null {
  const line = r.lines?.[index];
  if (!line) return null;
  const d = r.driveway;
  const rt = d ? scoredRoute(d) : undefined;
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
