/**
 * The Verdict section (proto L1455–1459). The verdict and the flags are derived from the stored measurements (v8;
 * lib/screen/flags.ts), so they follow what the result holds: the run's steps so far while it's going, the evaluated
 * point or the marked house after.
 */
import { STEPS } from "../screen/config";
import { flagsOf, verdictOf } from "../screen/flags";
import type { Flag, PartialScreenResult, Verdict } from "../screen/types";
import type { Heading } from "./parts";

export const verdictHeading: Heading = { title: "Verdict", slug: "verdict", help: "h-verdict" };

export interface VerdictView {
  /** The box's colour: the verdict, or while the run is going, the worst flag so far. */
  tone: Verdict;
  lead: string;
  flags: Flag[];
  /** "Incomplete: … didn't run, so this verdict is missing that evidence." */
  incomplete: string | null;
}

/** A result is partial while its run is going: whether it was cancelled is known only when the run ends. */
export const isPartial = (r: PartialScreenResult): boolean => r.cancelled === undefined;

const LEADS = {
  fatal: "Walk away.",
  marginal: "Worth a drive, eyes open.",
  ok: "Nothing in the data kills it.",
} as const;

const stepLabel = (id: string) => STEPS.find(([s]) => s === id)?.[1] ?? id;

export function verdictView(r: PartialScreenResult): VerdictView {
  const flags = flagsOf(r);
  const verdict = verdictOf(flags);
  const partial = isPartial(r);
  return {
    tone: verdict,
    lead: partial ? "Grading…" : LEADS[verdict] + (r.cancelled ? " (run cancelled)" : ""),
    flags,
    incomplete: r.failed.length
      ? `Incomplete: ${r.failed.map(stepLabel).join(", ").toLowerCase()} didn't run, so this verdict is missing that evidence.`
      : null,
  };
}
