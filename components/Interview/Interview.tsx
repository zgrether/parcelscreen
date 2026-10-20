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
import { useCallback, useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { currentProfile, renameProfile } from "@/lib/client/profiles";
import { useInterview, type Interview } from "@/lib/client/useInterview";
import { QUESTION_COUNT, QUESTIONS } from "@/lib/rubric/interview/questions";
import { questionNumber, STEPS, type Step } from "@/lib/rubric/interview/doc";
import type { InterviewAnswers } from "@/lib/rubric/interview/answers";
import { ChipsScreen, ChoiceScreen, LandScreen, PairScreen } from "./Screens";
import { InterviewResult } from "./Result";
import { JoinFirst } from "@/components/Sync/JoinFirst";
import { readSyncState } from "@/lib/sync/state";

/** The answers' fields a step sets: what Skip leaves out. */
function keysOf(step: Step): (keyof InterviewAnswers)[] {
  switch (step.kind) {
    case "choice": {
      const q = QUESTIONS[step.index]!;
      if (q.key === "sky") return ["sky", "glow"];
      return q.second ? [q.key, q.second.key] : [q.key];
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

/** Whether a screen holds an answer: then it opens with its pick shown, and Next in Skip's place (owner, 10/18). */
export function isAnswered(step: Step, a: InterviewAnswers): boolean {
  switch (step.kind) {
    case "choice": {
      const q = QUESTIONS[step.index]!;
      if (q.second) return a[q.key] !== undefined && a[q.second.key] !== undefined;
      return a[q.key] !== undefined;
    }
    case "land":
      return a.land !== undefined;
    case "walkAway":
      return a.walkAway !== undefined;
    case "dontMatter":
      return a.dontMatter !== undefined;
    case "result":
      return false;
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
          {/* Polish: "part 2" said nothing; this half asks what doesn't matter. */}
          {step.kind === "dontMatter" && ": what doesn't matter"}
        </p>
      </header>
      <div className="iv-bar" aria-hidden="true">
        {/* 14b, the last screen: the bar full. */}
        <span style={{ width: `${((step.kind === "dontMatter" ? n : n - 1) / QUESTION_COUNT) * 100}%` }} />
      </div>

      <StepView key={iv.doc.at} iv={iv} step={step} heading={heading} n={n} notNow={notNow} />
    </main>
  );
}

/** One screen and its Back / Not now / Skip-or-Next row; remade for each screen, so it knows how it opened. */
function StepView({
  iv,
  step,
  heading,
  n,
  notNow,
}: {
  iv: Interview;
  step: Step;
  heading: RefObject<HTMLHeadingElement | null>;
  n: number;
  notNow(): void;
}) {
  // Held an answer when it opened (Back, or resuming): Next stands in Skip's place, and nothing moves on by itself.
  const [revisit] = useState(() => isAnswered(step, iv.doc.answers));
  // A screen with its own Continue tells Next how to save it; the others are saved as they're picked.
  const saveRef = useRef<(() => void) | null>(null);
  const bindNext = useCallback((save: () => void) => {
    saveRef.current = save;
  }, []);
  const next = () => (saveRef.current ? saveRef.current() : iv.answer({}, true));
  const props = { iv, heading, n, revisit, bindNext };
  return (
    <>
      <section className="iv-screen">
        {step.kind === "choice" &&
          (QUESTIONS[step.index]!.second ? (
            <PairScreen {...props} question={QUESTIONS[step.index]!} />
          ) : (
            <ChoiceScreen {...props} question={QUESTIONS[step.index]!} />
          ))}
        {step.kind === "land" && <LandScreen {...props} />}
        {(step.kind === "walkAway" || step.kind === "dontMatter") && (
          <ChipsScreen {...props} half={step.kind} />
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
        {/* 14b, the last screen (polish #27): one row, the same however it was reached; Skip would only do what an
            empty pick does. */}
        {step.kind === "dontMatter" ? (
          <button type="button" className="btn" onClick={next}>
            See my priorities
          </button>
        ) : revisit ? (
          <button type="button" className="btn" onClick={next}>
            Next
          </button>
        ) : (
          <button
            type="button"
            className="btn secondary"
            title="Skip leaves this one out"
            onClick={() => iv.skip(keysOf(step))}
          >
            Skip
          </button>
        )}
      </nav>
    </>
  );
}

/**
 * A new profile's first screen: its name, then question 1. Polish #30: the name is asked for, so no profile is left as
 * "Profile 1" by a Continue; Not now still puts the whole interview off.
 */
function NameScreen({ begin, notNow }: { begin(): void; notNow(): void }) {
  const [name, setName] = useState("");
  const [synced] = useState(() => readSyncState() !== null);
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
          What should we call you?
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
        <button type="submit" className="btn iv-continue" disabled={!name.trim()}>
          Continue
        </button>
      </form>
      {/* A device not synced yet may belong to someone who already uses Parcel Screen: join, don't start anew. */}
      {!synced && <JoinFirst />}
      <nav className="iv-nav" aria-label="Interview">
        <button type="button" className="btn secondary" onClick={notNow}>
          {NOT_NOW}
        </button>
      </nav>
    </main>
  );
}
