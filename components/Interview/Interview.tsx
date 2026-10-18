"use client";
/**
 * The interview (step 4, docs/plans/step-4-interview.md §1, §7): one question per screen, each a short scene with a
 * forced choice, about four minutes; Back and Skip on every screen, and the progress ("4 of 14"). A single choice moves
 * on by itself after a short beat that shows the pick; question 7, question 13 and the two halves of question 14 have a
 * Continue. Every answer is saved as it's picked (lib/client/useInterview.ts), so leaving halfway resumes here. The
 * keyboard: the arrows and 1–4 pick, Enter continues, Backspace or Alt+← goes back.
 */
import Link from "next/link";
import { useEffect, useRef } from "react";
import { useInterview } from "@/lib/client/useInterview";
import { QUESTION_COUNT, QUESTIONS } from "@/lib/rubric/interview/questions";
import { questionNumber, STEPS, type Step } from "@/lib/rubric/interview/doc";
import type { InterviewAnswers } from "@/lib/rubric/interview/answers";
import { ChipsScreen, ChoiceScreen, LandScreen, WorkScreen } from "./Screens";
import { InterviewResult } from "./Result";

/** The answers' fields a step sets: what Skip leaves out. */
function keysOf(step: Step): (keyof InterviewAnswers)[] {
  switch (step.kind) {
    case "choice": {
      const key = QUESTIONS[step.index]!.key;
      return key === "sky" ? ["sky", "glow"] : [key];
    }
    case "land":
      return ["land"];
    case "walkAway":
      return ["walkAway"];
    case "dontMatter":
      return ["dontMatter"];
    case "result":
      return [];
  }
}

export function Interview() {
  const iv = useInterview();
  const step = STEPS[iv.doc.at]!;
  const heading = useRef<HTMLHeadingElement>(null);
  const n = questionNumber(step);

  // Each screen starts with the focus on its question, which a screen reader announces with its number.
  useEffect(() => heading.current?.focus(), [iv.doc.at]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement;
      if ((e.key === "Backspace" && !typing) || (e.key === "ArrowLeft" && e.altKey)) {
        if (iv.doc.at > 0) {
          e.preventDefault();
          iv.back();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [iv]);

  if (step.kind === "result")
    return (
      <main className="iv">
        <InterviewResult iv={iv} />
      </main>
    );

  return (
    <main className="iv">
      <header className="iv-head">
        <Link className="link-btn" href="/explore">
          ← Map
        </Link>
        <p className="iv-progress" aria-hidden="true">
          {n} of {QUESTION_COUNT}
        </p>
      </header>
      <div className="iv-bar" aria-hidden="true">
        <span style={{ width: `${(Math.max(0, n - 1) / QUESTION_COUNT) * 100}%` }} />
      </div>

      <section className="iv-screen" key={iv.doc.at}>
        {step.kind === "choice" &&
          (QUESTIONS[step.index]!.many ? (
            <WorkScreen iv={iv} heading={heading} n={n} />
          ) : (
            <ChoiceScreen iv={iv} question={QUESTIONS[step.index]!} heading={heading} n={n} />
          ))}
        {step.kind === "land" && <LandScreen iv={iv} heading={heading} n={n} />}
        {(step.kind === "walkAway" || step.kind === "dontMatter") && (
          <ChipsScreen iv={iv} half={step.kind} heading={heading} n={n} />
        )}
      </section>

      <nav className="iv-nav" aria-label="Interview">
        <button type="button" className="btn secondary" disabled={iv.doc.at === 0} onClick={iv.back}>
          Back
        </button>
        <button type="button" className="btn secondary" onClick={() => iv.skip(keysOf(step))}>
          Skip
        </button>
      </nav>
    </main>
  );
}
