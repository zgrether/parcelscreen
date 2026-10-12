/**
 * The lines drawn with the parcel, in words (follow-up 34, owner's wording): their labels, a line's length and grades
 * ("938 ft · avg 11% · steepest 17% over 30 m"), and what the gates ask of a route that uses one.
 */
import { fmt } from "../format";
import { SCREEN_CONSTANTS } from "../screen/config";
import type { DrawnLine, PartialScreenResult } from "../screen/types";

export const LINE_LABEL: Record<DrawnLine["kind"], string> = {
  track: "Existing track (user-drawn)",
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
