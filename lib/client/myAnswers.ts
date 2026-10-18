/**
 * What the priorities page takes from the profile's interview (step 4 plan §5, §6.3): the why context for its cards,
 * and whether there are answers to reset to. The answers about factors the app doesn't measure yet are kept (steps 9–10
 * add those factors), not shown (owner, 10/18).
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
