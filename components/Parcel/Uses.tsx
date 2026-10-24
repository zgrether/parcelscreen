"use client";
/**
 * Uses, the parcel panel's third segment (step 14, docs/plans/step-14-land-uses.md §6 B, §8; ux-audit P-3): What you can
 * do here, each use's name, its Yes / Maybe / No and its reason, a tap opening What decides it in place; then What
 * limits you; then the one not-advice line. Outside the grade: it reads the card's facts and changes nothing on it.
 */
import { useEffect, useId, useRef, useState } from "react";
import type { ScreenIt } from "@/components/Results/panel/ScreenIt";
import { USE_ORDER, type Answer, type Fact, type UseAnswer } from "@/lib/uses";
import { ANSWER_WORD, USE_NAME, USE_WORDS } from "@/lib/uses/words";

/** The gate colours (§8): Yes as pass, Maybe as warn, No as fail; the word is always said too. */
const TONE: Record<Answer, string> = { yes: "pass", maybe: "warn", no: "fail" };

export function Uses({ s }: { s: ScreenIt }) {
  const box = useRef<HTMLElement>(null);
  // The panel's scroll is shared with Grade and Details: Uses starts at its top.
  useEffect(() => {
    box.current?.closest(".explore-scroll")?.scrollTo?.({ top: 0 });
  }, []);
  const graded = !!s.ctl.state.store.open?.screenIds.length;
  const v = s.uses;
  if (!v && !s.runningHere && !(graded && !s.display && !s.error))
    return <p className="muted parcel-ungraded">{USE_WORDS.notGraded}</p>;
  return (
    <section ref={box} className="uses" aria-label={USE_WORDS.tab}>
      <h3 className="uses-head">{USE_WORDS.section}</h3>
      {v ? (
        <ul className="uses-list">
          {v.uses.map((u) => (
            <UseRow key={u.key} name={u.name} a={u.answer} />
          ))}
        </ul>
      ) : (
        // Grading, or the kept grade still loading: the rows by name, their answers to come.
        <ul className="uses-list" aria-busy="true">
          {USE_ORDER.map((k) => (
            <li key={k} className="use loading">
              <div className="use-row">
                <span className="use-name">{USE_NAME[k]}</span>
                <span className="use-chip">…</span>
                <span className="use-reason use-bar" />
              </div>
            </li>
          ))}
        </ul>
      )}
      {v && (
        <>
          <h3 className="uses-head">{USE_NAME.limits}</h3>
          <Facts facts={v.limits} />
        </>
      )}
      {/* Step 15's "How it could pay" goes here: the second panel of Uses, under What limits you and above the one
          not-advice line, which covers both (ux-audit P-3, J-1). */}
      <p className="uses-advice tiny muted">{USE_WORDS.notAdvice}</p>
    </section>
  );
}

function UseRow({ name, a }: { name: string; a: UseAnswer }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const head = (
    <>
      <span className="use-name">{name}</span>
      <span className={`use-chip ${TONE[a.answer]}`}>{ANSWER_WORD[a.answer]}</span>
      <span className="use-reason">{a.reason}</span>
    </>
  );
  // Nothing decides it that can be shown (its data didn't load): the row says so in its reason, and doesn't open.
  if (!a.decides.length)
    return (
      <li className="use">
        <div className="use-row">{head}</div>
      </li>
    );
  return (
    <li className="use">
      <button
        type="button"
        className="use-row"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        {head}
      </button>
      {open && (
        <div id={id} className="use-decides">
          <h4 className="uses-sub">{USE_WORDS.decides}</h4>
          <Facts facts={a.decides} />
        </div>
      )}
    </li>
  );
}

/** A source as named, or an ordinance's address as a link named by its site (a full URL is long on a phone). */
function Source({ text }: { text: string }) {
  if (!/^https?:\/\//.test(text)) return <>{text}</>;
  let host = text;
  try {
    host = new URL(text).hostname.replace(/^www\./, "");
  } catch {
    /* not a URL after all: shown as it is */
  }
  return (
    <a href={text} target="_blank" rel="noreferrer">
      {host}
    </a>
  );
}

/** Facts as label and value, each with its source and date when it has them (as on Climate: tiny, muted). */
function Facts({ facts }: { facts: readonly Fact[] }) {
  return (
    <dl className="use-facts">
      {facts.map((f, i) => (
        <div key={`${i}-${f.label}`} className="use-fact">
          <dt>{f.label}</dt>
          <dd>
            {f.value}
            {(f.source || f.date) && (
              <span className="use-source tiny muted">
                {f.source && <Source text={f.source} />}
                {f.source && f.date && ", "}
                {f.date}
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
