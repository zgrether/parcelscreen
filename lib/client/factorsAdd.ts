/**
 * Step 11's new factors, added once to the current profile's saved priorities (docs/plans/step-11-new-data.md §1;
 * lib/rubric/factorsAdd.ts): at boot, with one notice on What matters, "New factors to place: …", and its Undo. The
 * interview's own list (`base`) gets them too, so a card's why line still reads against it. Another member's priorities
 * get them in memory (household.ts) until their own device saves them. Driveway's add (drivewayAdd.ts) stays as it was.
 */
import {
  NEW_FACTORS,
  NEW_QUESTION,
  placedAgain,
  withNewFactors,
  withoutFactor,
  type NewFactor,
} from "@/lib/rubric/factorsAdd";
import type { InterviewAnswers } from "@/lib/rubric/interview/answers";
import type { ProfileRubrics } from "@/lib/rubric/schema";
import { EDITOR_TITLES } from "@/lib/rubric/words";
import { getPref, setPref } from "./prefs";

/** The notice: "New factors to place: Hospital", or several, in the order they shipped. */
export const factorsNote = (fs: readonly NewFactor[]): string =>
  `New factors to place: ${fs.map((f) => EDITOR_TITLES[f]).join(", ")}`;

/** The rubrics with every factor not yet added added, each marked "new"; null when there's nothing to do. */
export function factorsAddedTo(stored: ProfileRubrics | null, answers?: InterviewAnswers) {
  if (!stored) return null;
  const marks = stored.factorsAdded ?? {};
  const { rubric, added } = withNewFactors(stored.mine, marks, answers);
  if (!added.length) return null;
  return {
    rubrics: {
      ...stored,
      mine: rubric,
      factorsAdded: { ...marks, ...Object.fromEntries(added.map((f) => [f, "new" as const])) },
    },
    added,
  };
}

/** At boot, for the current profile: add them once, and to the interview's list. True when it wrote. */
export function addFactorsOnce(): boolean {
  const interview = getPref("ps.interview");
  const next = factorsAddedTo(getPref("ps.rubrics"), interview?.answers);
  if (!next) return false;
  setPref("ps.rubrics", next.rubrics);
  if (interview?.base) {
    // The interview's list takes the same factors, whatever it already had (it may be older than the saved list).
    const base = withNewFactors(interview.base, {}, interview.answers).rubric;
    setPref("ps.interview", { ...interview, base });
  }
  return true;
}

/** The new questions behind these factors (plan §1), for the notice's link; none when they were placed without one. */
export const newQuestionsOf = (fs: readonly NewFactor[]): (keyof InterviewAnswers)[] => [
  ...new Set(fs.map((f) => NEW_QUESTION[f]).filter((q): q is keyof InterviewAnswers => !!q)),
];

/** Where the notice's "Answer the new questions" goes: the first of them, on its own. */
export const newQuestionsHref = (fs: readonly NewFactor[]): string | null => {
  const q = newQuestionsOf(fs)[0];
  return q ? `/interview?ask=${q}` : null;
};

/**
 * After the new questions are answered (the interview's ask mode): each factor they place is placed again from the
 * answers, in the saved list and the interview's own, and nothing else moves.
 */
export function placeFromAnswers(fs: readonly NewFactor[]): void {
  const stored = getPref("ps.rubrics");
  const interview = getPref("ps.interview");
  if (!stored || !interview) return;
  const answers = interview.answers;
  setPref("ps.rubrics", { ...stored, mine: fs.reduce((r, f) => placedAgain(r, f, answers), stored.mine) });
  if (interview.base)
    setPref("ps.interview", {
      ...interview,
      base: fs.reduce((r, f) => placedAgain(r, f, answers), interview.base),
    });
}

/** The factors the notice lists: added and not shown yet. */
export function pendingFactors(): NewFactor[] {
  const marks = getPref("ps.rubrics")?.factorsAdded ?? {};
  return NEW_FACTORS.filter((f) => marks[f] === "new");
}

/** The notice was shown: it won't be again. */
export function markFactorsSeen(): void {
  const stored = getPref("ps.rubrics");
  const marks = stored?.factorsAdded;
  if (!stored || !marks) return;
  const seen = Object.fromEntries(Object.entries(marks).map(([f, m]) => [f, m === "new" ? "seen" : m]));
  setPref("ps.rubrics", { ...stored, factorsAdded: seen });
}

/**
 * The notice's Undo: the factors it listed back to Don't care, marked undone (never added again). Returns the rubric
 * for What matters to save as any other change (useMyRubric keeps the marks: it saves over the stored rubrics).
 */
export function undoFactorsAdd(fs: readonly NewFactor[]) {
  const stored = getPref("ps.rubrics");
  if (!stored) return null;
  setPref("ps.rubrics", {
    ...stored,
    factorsAdded: { ...stored.factorsAdded, ...Object.fromEntries(fs.map((f) => [f, "undone" as const])) },
  });
  return fs.reduce(withoutFactor, stored.mine);
}
