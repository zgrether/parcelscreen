/**
 * What the priorities page takes from the profile's interview (step 4 plan §5, §6.3): the why context for its cards,
 * the quiet list, and the list the answers make, for "Reset to my answers".
 */
import { answeredNothing, rubricFromAnswers } from "@/lib/rubric/interview/generate";
import type { InterviewDoc } from "@/lib/rubric/interview/doc";
import type { WhyContext } from "@/lib/rubric/words";

export const hasAnswers = (doc: InterviewDoc | null): doc is InterviewDoc =>
  !!doc && !answeredNothing(doc.answers);

/** The interview's list and its whys, once it has made one. */
export function whyContext(doc: InterviewDoc | null): WhyContext | null {
  if (!doc?.base) return null;
  return { base: doc.base, why: rubricFromAnswers(doc.answers).why };
}

/** "Counts once the app measures it: …": the answers about factors the app doesn't measure yet. */
export const laterOf = (doc: InterviewDoc | null): string[] =>
  hasAnswers(doc) ? rubricFromAnswers(doc.answers).later : [];
