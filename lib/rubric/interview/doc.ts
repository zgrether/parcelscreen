/**
 * The interview on the profile (step 4, docs/plans/step-4-interview.md §5–§6): one document, `ps.interview`, holding
 * the answers raw, where to resume, and `base`, the rubric the generator made when the interview was finished (a later
 * step adds a new factor to the person's own rubric against it, without touching their changes: §5). Version 1; a
 * change to its shape takes a new version and drops the old document (CLAUDE.md, clean breaks).
 */
import { z } from "zod";
import { RubricSchema } from "../schema";
import type { Rubric } from "../types";
import { InterviewAnswersSchema, type InterviewAnswers } from "./answers";
import { QUESTIONS } from "./questions";

/**
 * - new: a profile created to start with the interview, not yet begun (step 4 PR 3);
 * - inProgress: begun, not finished; it resumes at `at`;
 * - done: finished, its rubric offered or saved;
 * - notNow: put off from a new profile's start ("Not now"); the menu offers it again.
 */
export type InterviewState = "new" | "inProgress" | "done" | "notNow";

export interface InterviewDoc {
  v: 1;
  state: InterviewState;
  /** The screen to resume on (STEPS). */
  at: number;
  answers: InterviewAnswers;
  /** The rubric the generator made from these answers when the interview was last finished. */
  base: Rubric | null;
  doneAt?: string;
  /** A new profile's own start (§6.1): it opens with the name, every screen offers "Not now", and the app sends the
   * profile here until it's finished or put off. */
  onboarding?: boolean;
}

export const InterviewDocSchema: z.ZodType<InterviewDoc> = z.strictObject({
  v: z.literal(1),
  state: z.enum(["new", "inProgress", "done", "notNow"]),
  at: z.number().int().nonnegative(),
  answers: InterviewAnswersSchema,
  base: RubricSchema.nullable(),
  doneAt: z.string().optional(),
  onboarding: z.boolean().optional(),
}) as z.ZodType<InterviewDoc>;

/**
 * The screens, in order: questions 1–12, question 13 (the land), 14a (walk away), 14b (doesn't matter), the result.
 * A new profile's name screen comes before them (PR 3).
 */
export type Step =
  | { kind: "choice"; index: number }
  | { kind: "land" }
  | { kind: "walkAway" }
  | { kind: "dontMatter" }
  | { kind: "result" };

export const STEPS: readonly Step[] = [
  ...QUESTIONS.map((_, index) => ({ kind: "choice" as const, index })),
  { kind: "land" },
  { kind: "walkAway" },
  { kind: "dontMatter" },
  { kind: "result" },
];

/** The result screen's place in STEPS. */
export const RESULT_AT = STEPS.length - 1;

/** The progress line's number for a step: 1–14 (14a and 14b are both 14). */
export function questionNumber(step: Step): number {
  switch (step.kind) {
    case "choice":
      return QUESTIONS[step.index]!.n;
    case "land":
      return 13;
    default:
      return 14;
  }
}

export const freshDoc = (state: InterviewState = "inProgress"): InterviewDoc => ({
  v: 1,
  state,
  at: 0,
  answers: {},
  base: null,
});

/**
 * The menu's and the priorities page's link to the interview (owner, 10/18): "Answer a few questions (about 4 min)",
 * or, begun and not finished, "Finish your questions (6 of 14)".
 */
export function interviewLabel(doc: InterviewDoc | null): string {
  if (doc && (doc.state === "inProgress" || doc.state === "notNow") && doc.at > 0)
    return `Finish your questions (${questionNumber(STEPS[Math.min(doc.at, RESULT_AT)]!)} of 14)`;
  return "Answer a few questions (about 4 min)";
}
