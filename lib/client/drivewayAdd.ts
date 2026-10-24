/**
 * The Driveway row, added once to the current profile's saved priorities (owner, #216; lib/rubric/drivewayAdd.ts): at
 * boot, from its answer to question 10, with a one-time note on What matters and its Undo. The interview's own list
 * (`base`) gets it too, so the card's why line quotes the answer. Another member's priorities get it in memory
 * (household.ts) until their own device saves it.
 */
import { withDriveway, withoutDriveway } from "@/lib/rubric/drivewayAdd";
import type { ProfileRubrics } from "@/lib/rubric/schema";
import { getPref, setPref } from "./prefs";

/** What the note says, answered or not. */
export const drivewayNote = (answered: boolean): string =>
  answered
    ? "New: Driveway, placed from your answer about steep drives."
    : "New: Driveway, at the bottom of Nice to have (you skipped the question about steep drives).";

/** The rubrics with Driveway added, once; null when there's nothing to do. */
export function addedTo(stored: ProfileRubrics | null, answer: Parameters<typeof withDriveway>[1]) {
  if (!stored || stored.drivewayAdded) return null;
  const mine = withDriveway(stored.mine, answer);
  return mine ? { ...stored, mine, drivewayAdded: "new" as const } : null;
}

/** At boot, for the current profile: add it once, and to the interview's list. True when it wrote. */
export function addDrivewayOnce(): boolean {
  const interview = getPref("ps.interview");
  const answer = interview?.answers.driveway;
  const next = addedTo(getPref("ps.rubrics"), answer);
  if (!next) return false;
  setPref("ps.rubrics", next);
  const base = interview?.base ? withDriveway(interview.base, answer) : null;
  if (interview && base) setPref("ps.interview", { ...interview, base });
  return true;
}

/** The note What matters shows once: its words while it hasn't been shown, else null. */
export function pendingDrivewayNote(): string | null {
  if (getPref("ps.rubrics")?.drivewayAdded !== "new") return null;
  return drivewayNote(!!getPref("ps.interview")?.answers.driveway);
}

/** The note was shown: it won't be again. */
export function markDrivewayNoteSeen(): void {
  const stored = getPref("ps.rubrics");
  if (stored?.drivewayAdded === "new") setPref("ps.rubrics", { ...stored, drivewayAdded: "seen" });
}

/**
 * The note's Undo: marks it undone (never added again) and returns the rubric with Driveway back in Don't care, for
 * What matters to save as any other change (useMyRubric keeps the mark: it saves over the stored rubrics).
 */
export function undoDrivewayAdd() {
  const stored = getPref("ps.rubrics");
  if (!stored) return null;
  setPref("ps.rubrics", { ...stored, drivewayAdded: "undone" });
  return withoutDriveway(stored.mine);
}
