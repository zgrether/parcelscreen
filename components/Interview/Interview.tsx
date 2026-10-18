"use client";
/**
 * The interview (step 4, docs/plans/step-4-interview.md §1, §7): one question per screen, each a short scene with a
 * forced choice, about four minutes; Back and Skip on every screen, and the progress ("4 of 14"). A single choice moves
 * on by itself after a short beat that shows the pick; question 7, question 13 and the two halves of question 14 have a
 * Continue. Every answer is saved as it's picked (lib/client/useInterview.ts), so leaving halfway resumes here. The
 * keyboard: the arrows and 1–4 pick, Enter continues, Backspace or Alt+← goes back.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { currentProfile, renameProfile } from "@/lib/client/profiles";
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

/** "Not now": a new profile's way out, on every screen of its interview (§6.1). */
export const NOT_NOW = "Not now";

export function Interview() {
  const iv = useInterview();
  const router = useRouter();
  const step = STEPS[iv.doc.at]!;
  const heading = useRef<HTMLHeadingElement>(null);
  const n = questionNumber(step);
  const notNow = () => {
    iv.notNow();
    router.push("/explore");
  };

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

  if (iv.doc.state === "new") return <NameScreen begin={iv.begin} notNow={notNow} />;

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
          {step.kind === "dontMatter" && ", part 2"}
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
        {iv.doc.onboarding && (
          <button type="button" className="btn secondary" onClick={notNow}>
            {NOT_NOW}
          </button>
        )}
        <button type="button" className="btn secondary" onClick={() => iv.skip(keysOf(step))}>
          Skip
        </button>
      </nav>
    </main>
  );
}

/** A new profile's first screen: its name (Skip keeps "Profile 1"), then question 1. */
function NameScreen({ begin, notNow }: { begin(): void; notNow(): void }) {
  const [name, setName] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const go = async (e?: FormEvent) => {
    e?.preventDefault();
    const id = currentProfile()?.id;
    if (id && name.trim()) await renameProfile(id, name.trim());
    begin();
  };
  return (
    <main className="iv">
      <header className="iv-head">
        <span />
        <p className="iv-progress">About 4 minutes</p>
      </header>
      <form className="iv-screen" onSubmit={(e) => void go(e)}>
        <h1 className="iv-scene" ref={heading} tabIndex={-1}>
          What should we call this profile?
        </h1>
        <p className="iv-hint">
          Then a few quick questions about how you&apos;d like to live on the land. Your answers set what
          matters when a parcel is graded, and you can change any of it later.
        </p>
        <label className="iv-field">
          <span>Name</span>
          <input
            autoComplete="nickname"
            placeholder="Your name or a nickname"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button type="submit" className="btn iv-continue">
          Continue
        </button>
      </form>
      <nav className="iv-nav" aria-label="Interview">
        <button type="button" className="btn secondary" onClick={notNow}>
          {NOT_NOW}
        </button>
        <button type="button" className="btn secondary" onClick={() => void go()}>
          Keep &ldquo;{currentProfile()?.name ?? "Profile 1"}&rdquo;
        </button>
      </nav>
    </main>
  );
}
