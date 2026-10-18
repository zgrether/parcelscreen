"use client";
/**
 * The interview's screens (step 4 plan §1, §3, §7): a forced choice (questions 1–6 and 8–12; question 2's follow-up on
 * the same screen), pick any (question 7), the land (question 13) and question 14's chips, walk away (14a) and doesn't
 * matter (14b). Large tap targets; the choices are a radio group the arrows and 1–4 move through.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import type { Interview } from "@/lib/client/useInterview";
import { SCREEN_CONSTANTS } from "@/lib/screen/config";
import { CHIPS, type Chip, type InterviewAnswers } from "@/lib/rubric/interview/answers";
import { walkAwayStarts } from "@/lib/rubric/interview/generate";
import {
  CHIP_WORDS,
  DONT_MATTER_SCENE,
  GLOW_QUESTION,
  LAND_QUESTION,
  QUESTION_COUNT,
  QUESTIONS,
  WALK_AWAY_SCENE,
  type Choice,
  type Question,
} from "@/lib/rubric/interview/questions";
import { fmt } from "@/lib/format";

/** How long a pick shows before the next screen, ms: long enough to see, short enough not to wait. */
const BEAT_MS = 300;
const I = SCREEN_CONSTANTS.card.interview;

interface ScreenProps {
  iv: Interview;
  heading: RefObject<HTMLHeadingElement | null>;
  n: number;
}

function Scene({ heading, n, text }: { heading: ScreenProps["heading"]; n: number; text: string }) {
  return (
    <h1
      className="iv-scene"
      ref={heading}
      tabIndex={-1}
      aria-label={`Question ${n} of ${QUESTION_COUNT}: ${text}`}
    >
      {text}
    </h1>
  );
}

/** A radio group of big buttons: the arrows move, 1–4 pick, Enter or Space picks the focused one. */
function Choices({
  choices,
  value,
  pick,
  label,
}: {
  choices: readonly Pick<Choice, "id" | "label">[];
  value: string | undefined;
  pick(id: string): void;
  label: string;
}) {
  const group = useRef<HTMLDivElement>(null);
  const move = (e: KeyboardEvent) => {
    const keys = ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const buttons = [...(group.current?.querySelectorAll<HTMLButtonElement>("[role=radio]") ?? [])];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1;
    buttons[(i + step + buttons.length) % buttons.length]?.focus();
  };
  return (
    <div className="iv-choices" role="radiogroup" aria-label={label} ref={group} onKeyDown={move}>
      {choices.map((c, i) => (
        <button
          key={c.id}
          type="button"
          role="radio"
          aria-checked={value === c.id}
          tabIndex={value ? (value === c.id ? 0 : -1) : i === 0 ? 0 : -1}
          className={`iv-choice${value === c.id ? " picked" : ""}`}
          onClick={() => pick(c.id)}
        >
          <span className="iv-key" aria-hidden="true">
            {i + 1}
          </span>
          {c.label}
        </button>
      ))}
    </div>
  );
}

/** 1–4 pick the matching choice, outside a text field. */
function useNumberKeys(choices: readonly { id: string }[], pick: (id: string) => void) {
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.altKey || e.ctrlKey || e.metaKey) return;
      const d = Number(e.key);
      if (Number.isInteger(d) && d >= 1 && d <= choices.length) pick(choices[d - 1]!.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [choices, pick]);
}

export function ChoiceScreen({ iv, question, heading, n }: ScreenProps & { question: Question }) {
  const sky = question.key === "sky";
  const [value, setValue] = useState(iv.doc.answers[question.key] as string | undefined);
  const [glow, setGlow] = useState(iv.doc.answers.glow);
  const timer = useRef<number | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const later = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = window.setTimeout(() => iv.answer({}, true), BEAT_MS);
  };
  const pick = (id: string) => {
    setValue(id);
    if (sky) {
      // "Out with a camera" asks its follow-up on the same screen; the others clear it.
      iv.answer(
        id === "camera" ? { sky: "camera" } : { sky: id as InterviewAnswers["sky"], glow: undefined },
        false,
      );
      if (id !== "camera") later();
      return;
    }
    iv.answer({ [question.key]: id } as Partial<InterviewAnswers>, false);
    later();
  };
  const pickGlow = (id: string) => {
    setGlow(id as InterviewAnswers["glow"]);
    iv.answer({ glow: id as InterviewAnswers["glow"] }, false);
    later();
  };
  const showGlow = sky && value === "camera";
  useNumberKeys(showGlow ? GLOW_QUESTION.choices : question.choices, showGlow ? pickGlow : pick);
  return (
    <>
      <Scene heading={heading} n={n} text={question.scene} />
      <Choices choices={question.choices} value={value} pick={pick} label={question.scene} />
      {showGlow && (
        <div className="iv-follow">
          <p className="iv-follow-q">{GLOW_QUESTION.scene}</p>
          <Choices choices={GLOW_QUESTION.choices} value={glow} pick={pickGlow} label={GLOW_QUESTION.scene} />
        </div>
      )}
    </>
  );
}

/** Question 7: pick any, then Continue; "Neither" clears the rest. */
export function WorkScreen({ iv, heading, n }: ScreenProps) {
  const q = QUESTIONS.find((x) => x.key === "work")!;
  const [picked, setPicked] = useState<string[]>(iv.doc.answers.work ?? []);
  const [neither, setNeither] = useState(iv.doc.answers.work?.length === 0);
  const toggle = (id: string) => {
    setNeither(false);
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };
  return (
    <>
      <Scene heading={heading} n={n} text={q.scene} />
      <p className="iv-hint">Pick any.</p>
      <div className="iv-choices" role="group" aria-label={q.scene}>
        {q.choices.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={picked.includes(c.id)}
            className={`iv-choice${picked.includes(c.id) ? " picked" : ""}`}
            onClick={() => toggle(c.id)}
          >
            {c.label}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={neither}
          className={`iv-choice${neither ? " picked" : ""}`}
          onClick={() => {
            setPicked([]);
            setNeither(true);
          }}
        >
          Neither
        </button>
      </div>
      <button
        type="button"
        className="btn iv-continue"
        disabled={!picked.length && !neither}
        onClick={() => iv.answer({ work: picked as NonNullable<InterviewAnswers["work"]> })}
      >
        Continue
      </button>
    </>
  );
}

/** Question 13: the acres, and two optional budgets. */
export function LandScreen({ iv, heading, n }: ScreenProps) {
  const land = iv.doc.answers.land ?? {};
  const [acres, setAcres] = useState(land.acres);
  const [camp, setCamp] = useState(land.campBudget?.toString() ?? "");
  const [build, setBuild] = useState(land.buildBudget?.toString() ?? "");
  const dollars = (s: string) => {
    const v = Number(s.replace(/[$,\s]/g, ""));
    return s.trim() && Number.isFinite(v) && v >= 0 ? v : undefined;
  };
  const save = () =>
    iv.answer({
      land: {
        ...(acres ? { acres } : {}),
        ...(dollars(camp) !== undefined ? { campBudget: dollars(camp) } : {}),
        ...(dollars(build) !== undefined ? { buildBudget: dollars(build) } : {}),
      },
    });
  return (
    <>
      <Scene heading={heading} n={n} text={LAND_QUESTION.scene} />
      <Choices
        choices={LAND_QUESTION.acres}
        value={acres}
        pick={(id) => setAcres(id as typeof acres)}
        label="How much land"
      />
      <label className="iv-field">
        <span>{LAND_QUESTION.camp}</span>
        <input inputMode="numeric" placeholder="$" value={camp} onChange={(e) => setCamp(e.target.value)} />
      </label>
      <label className="iv-field">
        <span>{LAND_QUESTION.build}</span>
        <input inputMode="numeric" placeholder="$" value={build} onChange={(e) => setBuild(e.target.value)} />
      </label>
      <button type="button" className="btn iv-continue" onClick={save}>
        Continue
      </button>
    </>
  );
}

/** A number with − and + (14a's two numbers), within the priorities page's slider range. */
function Stepper({
  label,
  value,
  set,
  range,
  unit,
}: {
  label: string;
  value: number;
  set(v: number): void;
  range: { min: number; max: number; step: number };
  unit: string;
}) {
  const clamp = (v: number) => Math.min(range.max, Math.max(range.min, v));
  return (
    <span className="iv-stepper" role="group" aria-label={label}>
      <button
        type="button"
        className="btn secondary"
        aria-label={`Less: ${label}`}
        onClick={() => set(clamp(value - range.step))}
      >
        −
      </button>
      <span className="iv-stepper-value" aria-live="polite">
        {fmt(value)} {unit}
      </span>
      <button
        type="button"
        className="btn secondary"
        aria-label={`More: ${label}`}
        onClick={() => set(clamp(value + range.step))}
      >
        +
      </button>
    </span>
  );
}

/** Question 14: walk away (14a), then doesn't matter (14b, without 14a's chips). */
export function ChipsScreen({ iv, heading, n, half }: ScreenProps & { half: "walkAway" | "dontMatter" }) {
  const a = iv.doc.answers;
  const starts = walkAwayStarts(a);
  const walk = a.walkAway?.chips ?? [];
  const [picked, setPicked] = useState<Chip[]>(half === "walkAway" ? walk : (a.dontMatter ?? []));
  const [belowFt, setBelowFt] = useState(a.walkAway?.belowFt ?? starts.belowFt);
  const [erOverMin, setErOverMin] = useState(a.walkAway?.erOverMin ?? starts.erOverMin);
  const chips = half === "walkAway" ? CHIPS : CHIPS.filter((c) => !walk.includes(c));
  const toggle = (c: Chip) => setPicked((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));
  // 14b has no numbers to set: its two number chips say what they are. In 14a a picked one shows its number beside it.
  const label = (c: Chip) => {
    if (half === "dontMatter")
      return c === "belowFt" ? "Elevation" : c === "erOver" ? "Drive to an ER" : CHIP_WORDS[c].label;
    if (picked.includes(c) && c === "belowFt") return "Below";
    if (picked.includes(c) && c === "erOver") return "Over";
    return CHIP_WORDS[c].label;
  };
  const save = () =>
    half === "walkAway"
      ? iv.answer({
          walkAway: {
            chips: CHIPS.filter((c) => picked.includes(c)),
            ...(picked.includes("belowFt") ? { belowFt } : {}),
            ...(picked.includes("erOver") ? { erOverMin } : {}),
          },
          // A chip can't be in both halves.
          dontMatter: (a.dontMatter ?? []).filter((c) => !picked.includes(c)),
        })
      : iv.answer({ dontMatter: CHIPS.filter((c) => picked.includes(c)) });
  return (
    <>
      <Scene heading={heading} n={n} text={half === "walkAway" ? WALK_AWAY_SCENE : DONT_MATTER_SCENE} />
      <p className="iv-hint">
        {half === "walkAway" ? "Pick any. Then the ones that don't matter." : "Pick any."}
      </p>
      <div
        className="iv-chips"
        role="group"
        aria-label={half === "walkAway" ? "Walk away from" : "Doesn't matter"}
      >
        {chips.map((c) => (
          <span key={c} className="iv-chip-wrap">
            <button
              type="button"
              aria-pressed={picked.includes(c)}
              className={`iv-chip${picked.includes(c) ? " picked" : ""}`}
              onClick={() => toggle(c)}
            >
              {label(c)}
            </button>
            {half === "walkAway" && c === "belowFt" && picked.includes(c) && (
              <Stepper
                label="Below this elevation"
                value={belowFt}
                set={setBelowFt}
                range={SCREEN_CONSTANTS.card.editor.elevationFt}
                unit="ft"
              />
            )}
            {half === "walkAway" && c === "erOver" && picked.includes(c) && (
              <Stepper
                label="Over this drive to an ER"
                value={erOverMin}
                set={setErOverMin}
                range={SCREEN_CONSTANTS.card.editor.erMin}
                unit="min to an ER"
              />
            )}
          </span>
        ))}
      </div>
      {half === "walkAway" && picked.length > I.mustNoteAbove && (
        <p className="iv-note" role="status">
          That will rule out most land.
        </p>
      )}
      <button type="button" className="btn iv-continue" onClick={save}>
        {half === "walkAway" ? "Continue" : "See my priorities"}
      </button>
    </>
  );
}
