"use client";
/**
 * One use's row (step 14, plan §8): its name, Yes / Maybe / No and its reason, a tap opening What decides it in place,
 * with each fact's source and date. Uses lists them, and so does each split piece's What you can do here (§5.1).
 */
import { useId, useState, type ReactNode } from "react";
import type { Answer, Fact, UseAnswer } from "@/lib/uses";
import { ANSWER_WORD, USE_WORDS } from "@/lib/uses/words";

/** The gate colours (§8): Yes as pass, Maybe as warn, No as fail; the word is always said too. */
const TONE: Record<Answer, string> = { yes: "pass", maybe: "warn", no: "fail" };

/** `action`: under the row (Divide's Try a split). */
export function UseRow({ name, a, action = null }: { name: string; a: UseAnswer; action?: ReactNode }) {
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
        {action}
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
      {action}
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
export function Facts({ facts }: { facts: readonly Fact[] }) {
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
