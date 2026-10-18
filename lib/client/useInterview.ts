"use client";
/**
 * The interview's state (step 4, docs/plans/step-4-interview.md §1, §6): the profile's `ps.interview`, saved as every
 * answer is picked, so leaving halfway and coming back resumes on the same screen. A finished interview opened again
 * starts at question 1 with its answers picked, so it reads as a redo. Arriving at the result saves the list the
 * answers make, unless the person has changed their priorities since: then the result screen asks first (owner Q7).
 */
import { useCallback, useRef, useState } from "react";
import { defaultRubric } from "@/lib/rubric/default";
import type { InterviewAnswers } from "@/lib/rubric/interview/answers";
import { freshDoc, RESULT_AT, type InterviewDoc } from "@/lib/rubric/interview/doc";
import { rubricFromAnswers } from "@/lib/rubric/interview/generate";
import type { Rubric } from "@/lib/rubric/types";
import { getPref, setPref } from "./prefs";
import { effectiveRubrics, setProfileRubrics } from "./rubrics";

const same = (a: Rubric | null | undefined, b: Rubric | null | undefined): boolean =>
  !!a && !!b && JSON.stringify(a) === JSON.stringify(b);

/** The doc as the interview opens it: begun, resuming where it was left, or a redo from question 1. */
export function openDoc(stored: InterviewDoc | null): InterviewDoc {
  if (!stored) return freshDoc();
  if (stored.state === "done") return { ...stored, state: "inProgress", at: 0 };
  return { ...stored, state: "inProgress", at: Math.min(stored.at, RESULT_AT) };
}

/** Whether the profile's own list is still the starting list or the one its last interview made: safe to replace. */
export function untouched(mine: Rubric, base: Rubric | null): boolean {
  return same(mine, defaultRubric()) || same(mine, base);
}

/** What arriving at the result did: saved the answers' list, asks first, or (after "Keep mine") kept the old one. */
export type Outcome = "saved" | "ask" | "kept";

/** Finishes `d`: the answers' list saved as the profile's own (or not), and the doc marked done with its `base`. */
function finish(d: InterviewDoc, useAnswers: boolean): InterviewDoc {
  const made = rubricFromAnswers(d.answers).rubric;
  if (useAnswers) setProfileRubrics({ ...effectiveRubrics(), mine: made });
  const done: InterviewDoc = {
    ...d,
    state: "done",
    at: RESULT_AT,
    base: made,
    doneAt: new Date().toISOString(),
  };
  setPref("ps.interview", done);
  return done;
}

/** At the result: save if the list is the starting list or the last interview's, else ask. */
function arrive(d: InterviewDoc): { doc: InterviewDoc; outcome: Outcome } {
  if (!untouched(effectiveRubrics().mine, d.base)) return { doc: d, outcome: "ask" };
  return { doc: finish(d, true), outcome: "saved" };
}

export interface Interview {
  doc: InterviewDoc;
  /** Set when the result is reached. */
  outcome: Outcome | null;
  /** Sets answers and, by default, moves to the next screen. */
  answer(patch: Partial<InterviewAnswers>, next?: boolean): void;
  /** Leaves this screen's answers out and moves on. */
  skip(keys: (keyof InterviewAnswers)[]): void;
  back(): void;
  /** The answer to "Replace the priorities you changed?": "Use my answers" (true) or "Keep mine" (false). */
  decide(useAnswers: boolean): void;
  /** The list the profile had when the interview opened: "before" for Try it. */
  before: Rubric;
}

export function useInterview(): Interview {
  const [opened] = useState(() => {
    const doc = openDoc(getPref("ps.interview"));
    return doc.at === RESULT_AT ? arrive(doc) : { doc, outcome: null };
  });
  const [doc, setDoc] = useState<InterviewDoc>(opened.doc);
  const [outcome, setOutcome] = useState<Outcome | null>(opened.outcome);
  const [before] = useState<Rubric>(() => effectiveRubrics().mine);
  // The latest doc, for a pick's delayed move to the next screen, which runs after the pick re-rendered.
  const latest = useRef(doc);

  const go = useCallback((next: InterviewDoc) => {
    let shown = next;
    if (next.at === RESULT_AT && latest.current.at !== RESULT_AT) {
      const r = arrive(next);
      shown = r.doc;
      setOutcome(r.outcome);
    } else {
      setPref("ps.interview", next);
      if (next.at !== RESULT_AT) setOutcome(null);
    }
    latest.current = shown;
    setDoc(shown);
  }, []);

  const answer = useCallback(
    (patch: Partial<InterviewAnswers>, next = true) => {
      const d = latest.current;
      go({ ...d, answers: { ...d.answers, ...patch }, at: next ? Math.min(d.at + 1, RESULT_AT) : d.at });
    },
    [go],
  );

  const skip = useCallback(
    (keys: (keyof InterviewAnswers)[]) => {
      const d = latest.current;
      const answers = { ...d.answers };
      for (const k of keys) delete answers[k];
      go({ ...d, answers, at: Math.min(d.at + 1, RESULT_AT) });
    },
    [go],
  );

  const back = useCallback(() => {
    const d = latest.current;
    go({ ...d, state: "inProgress", at: Math.max(0, d.at - 1) });
  }, [go]);

  const decide = useCallback((useAnswers: boolean) => {
    const done = finish(latest.current, useAnswers);
    latest.current = done;
    setDoc(done);
    setOutcome(useAnswers ? "saved" : "kept");
  }, []);

  return { doc, outcome, answer, skip, back, decide, before };
}
