/**
 * Still unknown (step 7 plan §1.5): each Must the screen couldn't settle as a plain question for the listing agent,
 * with Copy on each and Copy all. Data that didn't load isn't the agent's to answer: it's listed apart, with Try again.
 */
"use client";
import { useState } from "react";
import { agentQuestions, copyAllText } from "@/lib/report/agent";
import { lowerFirst, type Card } from "@/lib/report/card";

/** "a", "a and b", "a, b and c". */
const listOf = (xs: readonly string[]): string =>
  xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`;

/** How long "Copied" shows, as Copy summary's hint does. */
const SAID_MS = 1500;

export function AgentQuestions({
  card,
  name,
  onRetry,
  showChecklist,
}: {
  card: Card;
  /** The parcel's name, for Copy all's first line. */
  name: string;
  /** Runs the screen again, for what didn't load. */
  onRetry?: () => void;
  /** Opens Full report at its Still unknown checklist. */
  showChecklist(): void;
}) {
  const qs = agentQuestions(card);
  const [said, setSaid] = useState<string | null>(null);
  const copy = (key: string, text: string) => {
    const say = (msg: string) => {
      setSaid(`${key}:${msg}`);
      setTimeout(() => setSaid((s) => (s === `${key}:${msg}` ? null : s)), SAID_MS);
    };
    navigator.clipboard.writeText(text).then(
      () => say("Copied"),
      () => say("The browser didn't allow copying"),
    );
  };
  const status = (key: string) => (said?.startsWith(`${key}:`) ? said.slice(key.length + 1) : null);
  return (
    <section className="ask-agent" aria-label="Still unknown">
      <div className="ask-head">
        <h3 className="card-sub">Still unknown</h3>
        {qs.length > 1 && (
          <button className="btn small secondary" onClick={() => copy("all", copyAllText(name, qs))}>
            {status("all") ?? "Copy all"}
          </button>
        )}
      </div>
      {qs.length > 0 ? (
        <>
          <p className="tiny muted">Ask the listing agent:</p>
          <ol className="ask-list">
            {qs.map((q) => (
              <li key={q.key}>
                <p className="ask-q">{q.question}</p>
                <p className="tiny muted ask-why">Why we ask: {lowerFirst(q.why)}.</p>
                <button className="btn small secondary ask-copy" onClick={() => copy(q.key, q.question)}>
                  {status(q.key) ?? "Copy"}
                </button>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="tiny muted">Nothing to ask the agent: the screen answered every must.</p>
      )}
      {card.incomplete.length > 0 && (
        <p className="ask-failed" role="status">
          <span>Didn&apos;t load: {listOf(card.incomplete)}.</span>
          {onRetry && (
            <button className="btn small secondary" onClick={onRetry}>
              Try again
            </button>
          )}
        </p>
      )}
      <button className="link-btn tiny" onClick={showChecklist}>
        What no dataset answers
      </button>
    </section>
  );
}
