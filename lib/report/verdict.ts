/** The Verdict section (proto L1455–1459). */
import { STEPS } from "../screen/config";
import type { PartialScreenResult, ScreenResult } from "../screen/types";
import type { Heading } from "./parts";

export const verdictHeading: Heading = { title: "Verdict", slug: "verdict", help: "h-verdict" };

export interface VerdictView {
  /** The box's colour: the verdict, or while the run is going, the worst flag so far. */
  tone: ScreenResult["verdict"];
  lead: string;
  flags: ScreenResult["flags"];
  /** "Incomplete: … didn't run, so this verdict is missing that evidence." */
  incomplete: string | null;
}

/** A result is partial while its run is going: it has no verdict yet. */
export const isPartial = (r: PartialScreenResult): boolean => r.verdict === undefined;

const LEADS = {
  fatal: "Walk away.",
  marginal: "Worth a drive, eyes open.",
  ok: "Nothing in the data kills it.",
} as const;

const stepLabel = (id: string) => STEPS.find(([s]) => s === id)?.[1] ?? id;

export function verdictView(r: PartialScreenResult): VerdictView {
  const interim = r.flags.some((f) => f.lvl === "fatal")
    ? "fatal"
    : r.flags.some((f) => f.lvl === "warn")
      ? "marginal"
      : "ok";
  const partial = isPartial(r);
  return {
    tone: r.verdict ?? interim,
    lead: partial ? "Screening…" : LEADS[r.verdict!] + (r.cancelled ? " (run cancelled)" : ""),
    flags: r.flags,
    incomplete: r.failed.length
      ? `Incomplete: ${r.failed.map(stepLabel).join(", ").toLowerCase()} didn't run, so this verdict is missing that evidence.`
      : null,
  };
}
