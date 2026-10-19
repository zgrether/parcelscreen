/**
 * The parcel's one action, "Grade this parcel", and its one-line log (step 4c, docs/plans/step-4c-map-layout.md §2):
 * what the button says, if anything, and what the folded log says. Pure, so every state is Node-tested.
 *
 * - Before the first run: "Grade this parcel". While one runs: "Grading…". A run that stopped on an error (the
 *   re-screen on open, say): "Try again".
 * - After a run, the button shows only with a reason, the first that applies in this order: the boundary changed; the
 *   house moved and no live session can re-assess it; the lines changed; the settings changed; steps failed ("Try again:
 *   N sources didn't load"). With none, there's no button: the old permanent "Run again" is gone.
 * - The log, folded after a run: "Graded in 66 s". The failed count joins it only when the button doesn't carry it
 *   (owner, 10/19: the count appears once).
 */
import type { Freshness } from "./screenKeys";

export type GradeReason = "boundary" | "house" | "lines" | "settings";

export type GradeButton =
  | { kind: "first" }
  | { kind: "running" }
  | { kind: "stopped" }
  | { kind: "again"; reason: GradeReason }
  | { kind: "retry"; failed: number };

export interface GradeState {
  /** A run is in progress for this parcel. */
  running: boolean;
  /** This parcel has a kept run. */
  graded: boolean;
  /** How the kept run's inputs differ from now's (null without one). */
  fresh: Freshness | null;
  /** The worker's session is this parcel's kept run: a moved house is re-assessed without a run. */
  sessionLive: boolean;
  /** The kept run's failed steps (`result.failed`). */
  failed: number;
  /** This parcel's last run stopped on an error. */
  stopped?: boolean;
}

export function gradeButton(s: GradeState): GradeButton | null {
  if (s.running) return { kind: "running" };
  if (s.stopped) return { kind: "stopped" };
  if (!s.graded) return { kind: "first" };
  const f = s.fresh;
  if (f?.boundary) return { kind: "again", reason: "boundary" };
  if (f?.house && !s.sessionLive) return { kind: "again", reason: "house" };
  if (f?.lines) return { kind: "again", reason: "lines" };
  if (f?.settings) return { kind: "again", reason: "settings" };
  if (s.failed > 0) return { kind: "retry", failed: s.failed };
  return null;
}

const REASON_WORDS: Record<GradeReason, string> = {
  boundary: "boundary changed",
  house: "house moved",
  lines: "lines changed",
  settings: "settings changed",
};

export const sourcesDidntLoad = (n: number): string => `${n} source${n === 1 ? "" : "s"} didn't load`;

export function gradeLabel(b: GradeButton): string {
  switch (b.kind) {
    case "first":
      return "Grade this parcel";
    case "running":
      return "Grading…";
    case "stopped":
      return "Try again";
    case "again":
      return `Grade again: ${REASON_WORDS[b.reason]}`;
    case "retry":
      return `Try again: ${sourcesDidntLoad(b.failed)}`;
  }
}

/** The steps' times as the page saw them: when each started, and how long it took once it ended. */
export interface StepTime {
  startedAt?: number;
  ms?: number;
}

/** The run's length, from its first step's start to its last step's end, in whole seconds; null before any step ended. */
export function runSeconds(steps: readonly (StepTime | undefined)[]): number | null {
  let start = Infinity;
  let end = -Infinity;
  for (const s of steps) {
    if (s?.startedAt === undefined) continue;
    start = Math.min(start, s.startedAt);
    if (s.ms !== undefined) end = Math.max(end, s.startedAt + s.ms);
  }
  return end > -Infinity && start < Infinity ? Math.round((end - start) / 1000) : null;
}

/** The folded log's line: "Graded in 66 s", with the failed count unless the button already says it. */
export function logLine(seconds: number | null, failed: number, button: GradeButton | null): string {
  const graded = seconds === null ? "Graded" : `Graded in ${seconds} s`;
  return failed > 0 && button?.kind !== "retry" ? `${graded} · ${sourcesDidntLoad(failed)}` : graded;
}
