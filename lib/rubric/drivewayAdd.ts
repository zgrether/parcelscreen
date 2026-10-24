/**
 * The Driveway row, added once to priorities saved before step 7 (owner, #216): add-only, in the tier question 10's
 * answer implies (Long and gentle's points make it Really want; the other answers, and no answer, Nice to have), at the
 * bottom of that tier, with the answer's edge (the starting list's 15% without one). Nothing else in the rubric moves.
 * Pure; lib/client/drivewayAdd.ts applies it and keeps the note's state.
 */
import { SCREEN_CONSTANTS } from "../screen/config";
import { setBandEdge } from "./edit";
import { places } from "./factorsAdd";
import type { InterviewAnswers } from "./interview/answers";
import type { RankedCard, Rubric } from "./types";

export type DrivewayAnswer = NonNullable<InterviewAnswers["driveway"]>;

/** The tier question 10's answer implies: its points against Really want's floor; Nice to have without an answer. */
export function drivewayTier(a: DrivewayAnswer | undefined, C = SCREEN_CONSTANTS.card): RankedCard["tier"] {
  if (!a) return "could";
  return C.interview.choices.driveway[a].points.driveway >= C.interview.should.minPoints ? "should" : "could";
}

/**
 * The rubric with Driveway added, or null when there's nothing to add: it already places Driveway (ranked, a limit, or
 * Don't care), or it's the starting list's explicit weights (its Driveway weighs 0 and is Don't care by design, step 7
 * plan §3.3). A list saved before step 7 has no Driveway anywhere; one with Driveway in Don't care chose it (the UX
 * audit's B-1: a starting list reordered later had Driveway pulled into Nice to have against the person's own list).
 */
export function withDriveway(
  r: Rubric,
  a: DrivewayAnswer | undefined,
  C = SCREEN_CONSTANTS.card,
): Rubric | null {
  if (r.weights.mode !== "rankSum" || places(r, "driveway")) return null;
  const card: RankedCard = { factor: "driveway", tier: drivewayTier(a, C) };
  const lastShould = r.ranked.findLastIndex((c) => c.tier === "should");
  const ranked =
    card.tier === "should"
      ? [...r.ranked.slice(0, lastShould + 1), card, ...r.ranked.slice(lastShould + 1)]
      : [...r.ranked, card];
  const added: Rubric = {
    ...r,
    ranked,
    wonts: r.wonts.filter((k) => k !== "driveway"),
    bands: { ...r.bands, drivewayPct: [...C.rows.drivewayPct] },
  };
  return a ? setBandEdge(added, "drivewayPct", C.interview.choices.driveway[a].edges.drivewayPct) : added;
}

/** The note's Undo: Driveway back to Don't care, nothing else changed. */
export function withoutDriveway(r: Rubric): Rubric {
  return {
    ...r,
    ranked: r.ranked.filter((c) => c.factor !== "driveway"),
    wonts: r.wonts.includes("driveway") ? r.wonts : [...r.wonts, "driveway"],
  };
}
