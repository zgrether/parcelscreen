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
import { climateLimits, walkAwayStarts } from "@/lib/rubric/interview/generate";
import {
  CHIP_WORDS,
  DONT_MATTER_SCENE,
  GLOW_QUESTION,
  LAND_QUESTION,
  QUESTION_COUNT,
  SUMMER_QUESTION,
  WALK_AWAY_SCENE,
  WINTER_QUESTION,
  type Choice,
  type Question,
} from "@/lib/rubric/interview/questions";
import { fmt } from "@/lib/format";
import { EDITOR_TITLES } from "@/lib/rubric/words";

/** How long a pick shows before the next screen, ms: long enough to see, short enough not to wait. */
const BEAT_MS = 300;
const I = SCREEN_CONSTANTS.card.interview;

interface ScreenProps {
  iv: Interview;
  heading: RefObject<HTMLHeadingElement | null>;
  n: number;
  /**
   * The screen held an answer when it opened (Back, or resuming): its pick shows, Next stands in Skip's place, and
   * nothing moves on by itself (owner, 10/18).
   */
  revisit: boolean;
  /** A screen with its own Continue tells Next what to do there: save what's on it, and move on. */
  bindNext(save: () => void): void;
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

/** The hint under a choice: a first answer moves on by itself; an answer already there waits (owner, 10/18). */
const hint = (revisit: boolean) =>
  revisit ? "Tap your pick again, or Next, to go on." : "Tap one to go on.";

export function ChoiceScreen({ iv, question, heading, n, revisit }: ScreenProps & { question: Question }) {
  const sky = question.key === "sky";
  const [value, setValue] = useState(iv.doc.answers[question.key] as string | undefined);
  const [glow, setGlow] = useState(iv.doc.answers.glow);
  const timer = useRef<number | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const advance = () => iv.answer({}, true);
  const later = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = window.setTimeout(advance, BEAT_MS);
  };
  const pick = (id: string) => {
    // On a screen that held an answer, the same pick again moves on; another pick only changes it.
    const again = revisit && id === value;
    setValue(id);
    if (sky) {
      if (again) {
        if (id !== "camera" || glow) advance();
        return;
      }
      // "Out with a camera" asks its follow-up on the same screen; the others clear it.
      iv.answer(
        id === "camera" ? { sky: "camera" } : { sky: id as InterviewAnswers["sky"], glow: undefined },
        false,
      );
      if (id !== "camera") {
        setGlow(undefined);
        if (!revisit) later();
      }
      return;
    }
    if (again) return advance();
    iv.answer({ [question.key]: id } as Partial<InterviewAnswers>, false);
    if (!revisit) later();
  };
  const pickGlow = (id: string) => {
    const first = glow === undefined;
    if (revisit && id === glow) return advance();
    setGlow(id as InterviewAnswers["glow"]);
    iv.answer({ glow: id as InterviewAnswers["glow"] }, false);
    if (!revisit || first) later();
  };
  const showGlow = sky && value === "camera";
  useNumberKeys(showGlow ? GLOW_QUESTION.choices : question.choices, showGlow ? pickGlow : pick);
  return (
    <>
      <Scene heading={heading} n={n} text={question.scene} />
      {/* With question 2's follow-up showing, its own hint says how to go on. */}
      {!showGlow && <p className="iv-hint">{hint(revisit)}</p>}
      <Choices choices={question.choices} value={value} pick={pick} label={question.scene} />
      {showGlow && (
        <div className="iv-follow">
          <p className="iv-follow-q">{GLOW_QUESTION.scene}</p>
          <p className="iv-hint">{revisit && glow ? hint(true) : "One more tap, then the next question."}</p>
          <Choices choices={GLOW_QUESTION.choices} value={glow} pick={pickGlow} label={GLOW_QUESTION.scene} />
        </div>
      )}
    </>
  );
}

/**
 * Question 1 (step 11, plan §2.2): the year, then its two follow-ups on the same screen, preset from the year (config
 * `climatePreset`), so Continue is the one more tap. "Either is fine" has none, and moves on as any choice does.
 * `onDone`: the notice's "Answer the new questions" (plan §1), which returns to What matters instead of going on.
 */
export function ClimateScreen({
  iv,
  question,
  heading,
  n,
  revisit,
  onDone,
}: ScreenProps & { question: Question; onDone?: () => void }) {
  const a = iv.doc.answers;
  const [value, setValue] = useState(a.climate);
  const [winter, setWinter] = useState(a.winter);
  const [summer, setSummer] = useState(a.summer);
  const timer = useRef<number | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const done = onDone ?? (() => iv.answer({}, true));
  const preset = climateLimits({ climate: value });
  const follow = !!value && value !== "either";
  const pick = (id: string) => {
    const climate = id as InterviewAnswers["climate"];
    // On a screen that held an answer, the same pick again moves on, as on every screen.
    if (revisit && id === value) return done();
    setValue(climate);
    if (id !== "either") return iv.answer({ climate }, false);
    // "Either": no limits; it moves on by itself, as any choice does.
    setWinter(undefined);
    setSummer(undefined);
    iv.answer({ climate, winter: undefined, summer: undefined }, false);
    if (!revisit) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = window.setTimeout(done, BEAT_MS);
    }
  };
  const pickWinter = (id: string) => {
    setWinter(id as InterviewAnswers["winter"]);
    iv.answer({ winter: id as InterviewAnswers["winter"] }, false);
  };
  const pickSummer = (id: string) => {
    setSummer(id as InterviewAnswers["summer"]);
    iv.answer({ summer: id as InterviewAnswers["summer"] }, false);
  };
  useNumberKeys(question.choices, pick);
  return (
    <>
      <Scene heading={heading} n={n} text={question.scene} />
      {!follow && <p className="iv-hint">{hint(revisit)}</p>}
      <Choices choices={question.choices} value={value} pick={pick} label={question.scene} />
      {follow && (
        <div className="iv-follow">
          {/* Polish 2 (W4): said before the rows it's about, not after them. */}
          <p className="iv-hint">Set from your answer above: change either if it&apos;s off.</p>
          <p className="iv-follow-q">{WINTER_QUESTION.ask}</p>
          <Choices
            choices={WINTER_QUESTION.choices}
            value={winter ?? preset.winter}
            pick={pickWinter}
            label={WINTER_QUESTION.ask}
          />
          <p className="iv-follow-q">{SUMMER_QUESTION.ask}</p>
          <Choices
            choices={SUMMER_QUESTION.choices}
            value={summer ?? preset.summer}
            pick={pickSummer}
            label={SUMMER_QUESTION.ask}
          />
          {(!revisit || onDone) && (
            <button type="button" className="btn iv-continue" onClick={done}>
              Continue
            </button>
          )}
        </div>
      )}
    </>
  );
}

/** Question 7 (owner, 10/18): two single-choice rows on one screen; Continue once both are answered. */
export function PairScreen({ iv, question, heading, n, revisit }: ScreenProps & { question: Question }) {
  const second = question.second!;
  const [first, setFirst] = useState(iv.doc.answers[question.key] as string | undefined);
  const [other, setOther] = useState(iv.doc.answers[second.key] as string | undefined);
  const pickFirst = (id: string) => {
    if (revisit && id === first && other) return iv.answer({}, true);
    setFirst(id);
    iv.answer({ [question.key]: id } as Partial<InterviewAnswers>, false);
  };
  const pickOther = (id: string) => {
    if (revisit && id === other && first) return iv.answer({}, true);
    setOther(id);
    iv.answer({ [second.key]: id } as Partial<InterviewAnswers>, false);
  };
  // Step 14d: a first answer that makes the second row moot ("Rarely" paddling) hides it.
  const needsOther = first === undefined || first !== question.skipSecondIf;
  return (
    <>
      <Scene heading={heading} n={n} text={question.scene} />
      <p className="iv-follow-q">{question.ask}</p>
      <Choices
        choices={question.choices}
        value={first}
        pick={pickFirst}
        label={question.ask ?? question.scene}
      />
      {needsOther && (
        <div className="iv-follow">
          <p className="iv-follow-q">{second.ask}</p>
          <Choices choices={second.choices} value={other} pick={pickOther} label={second.ask} />
        </div>
      )}
      {!revisit && first && (other || !needsOther) && (
        <button type="button" className="btn iv-continue" onClick={() => iv.answer({}, true)}>
          Continue
        </button>
      )}
    </>
  );
}

/** Question 13: the acres, and two optional budgets. */
export function LandScreen({ iv, heading, n, revisit, bindNext }: ScreenProps) {
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
  // Next, when the screen held an answer, saves what's on it now.
  useEffect(() => bindNext(save));
  return (
    <>
      <Scene heading={heading} n={n} text={LAND_QUESTION.scene} />
      <Choices
        choices={LAND_QUESTION.acres}
        value={acres}
        pick={(id) => setAcres(id as typeof acres)}
        label="How much land"
      />
      <Budget id="iv-camp" lead={LAND_QUESTION.camp} value={camp} set={setCamp} />
      <Budget id="iv-build" lead={LAND_QUESTION.build} value={build} set={setBuild} />
      {!revisit && (
        <button type="button" className="btn iv-continue" onClick={save}>
          Continue
        </button>
      )}
    </>
  );
}

/**
 * One of question 13's budgets (owner, #240): the sentence says what it covers, and the box's own label asks for the
 * number. A screen reader hears both, the label first.
 */
function Budget({ id, lead, value, set }: { id: string; lead: string; value: string; set(v: string): void }) {
  return (
    <div className="iv-field">
      <p id={`${id}-lead`} className="iv-field-lead">
        {lead}
      </p>
      <label className="iv-field-label">
        <span id={`${id}-label`}>{LAND_QUESTION.most}</span>
        <span className="iv-money">
          <span aria-hidden="true">$</span>
          <input
            inputMode="numeric"
            aria-labelledby={`${id}-label ${id}-lead`}
            value={value}
            onChange={(e) => set(e.target.value)}
          />
        </span>
      </label>
    </div>
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

/**
 * Question 14: walk away (14a), then doesn't matter (14b, without 14a's chips, and without "Drive to an ER" once the ER
 * question has its answer: polish #27). 14b's See my priorities is the nav row's.
 */
export function ChipsScreen({
  iv,
  heading,
  n,
  half,
  revisit,
  bindNext,
}: ScreenProps & { half: "walkAway" | "dontMatter" }) {
  const a = iv.doc.answers;
  const starts = walkAwayStarts(a);
  const walk = a.walkAway?.chips ?? [];
  const [picked, setPicked] = useState<Chip[]>(half === "walkAway" ? walk : (a.dontMatter ?? []));
  const [belowFt, setBelowFt] = useState(a.walkAway?.belowFt ?? starts.belowFt);
  const [erOverMin, setErOverMin] = useState(a.walkAway?.erOverMin ?? starts.erOverMin);
  const chips =
    half === "walkAway"
      ? CHIPS
      : CHIPS.filter((c) => !walk.includes(c) && !(c === "erOver" && a.er !== undefined));
  const toggle = (c: Chip) => setPicked((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));
  // 14b has no numbers to set: its two number chips say what they are. In 14a a picked one shows its number beside it.
  const label = (c: Chip) => {
    if (half === "dontMatter")
      return c === "belowFt"
        ? "Elevation"
        : c === "erOver"
          ? "Drive to an ER"
          : c === "sharedDriveway"
            ? EDITOR_TITLES.easement
            : CHIP_WORDS[c].label;
    if (picked.includes(c) && c === "belowFt") return "Elevation below";
    if (picked.includes(c) && c === "erOver") return "ER over";
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
          // A chip can't be in both halves; 14b stays unanswered until it's answered (so it opens with its Continue).
          ...(a.dontMatter ? { dontMatter: a.dontMatter.filter((c) => !picked.includes(c)) } : {}),
        })
      : iv.answer({ dontMatter: CHIPS.filter((c) => picked.includes(c)) });
  useEffect(() => bindNext(save));
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
      {!revisit && half === "walkAway" && (
        <button type="button" className="btn iv-continue" onClick={save}>
          Continue
        </button>
      )}
    </>
  );
}
