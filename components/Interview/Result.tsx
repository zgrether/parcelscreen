"use client";
/**
 * The interview's result (step 4 plan §6.2): "Your priorities", the answer first. Must have as plain lines, Really want
 * and Nice to have in rank order, Don't care in one line, the quiet list, and "That will rule out most land." when
 * it applies; Try it above, before (the list the profile had) against now. The list is saved on arrival, unless the
 * profile's own list was changed since: then "Replace the priorities you changed?" asks first (owner Q7).
 */
import Link from "next/link";
import { useMemo } from "react";
import { RubricPreview } from "@/components/Rubric/RubricPreview";
import { PAGE_TITLE } from "@/components/Rubric/RubricEditor";
import type { Interview } from "@/lib/client/useInterview";
import { columnsOf } from "@/lib/rubric/edit";
import { rubricFromAnswers } from "@/lib/rubric/interview/generate";
import { PRIORITY_TITLES, minimumLine, plainLine, TIER_NAMES } from "@/lib/rubric/words";
import { AreaBox } from "@/components/Areas/AreaBox";

export const MUST_NOTE = "That will rule out most land.";
/**
 * What each list means, one line under its heading (polish #29): a limit and a ranked row on the same factor read as two
 * things, not one said twice.
 */
export const TIER_NOTES = {
  must: "A parcel that misses one of these is Not for us.",
  should: "In order: the first counts most.",
  could: "In order, each counting less than the ones above.",
} as const;
/** A limit whose factor is ranked too. */
export const ALSO_RANKED = "a limit; it's also ranked below";
export const REPLACE_QUESTION = "Replace the priorities you changed?";
/** Its buttons (owner, 10/18, after the fresh-eyes review: "Use my answers" and "Keep mine" both read as "mine"). */
export const REPLACE_YES = "Replace with the new list";
export const REPLACE_NO = "Keep my changes";

export function InterviewResult({ iv }: { iv: Interview }) {
  const made = useMemo(() => rubricFromAnswers(iv.doc.answers), [iv.doc.answers]);
  const status = iv.outcome;
  const r = made.rubric;
  const cols = columnsOf(r);
  const ranked = (tier: "should" | "could") => cols[tier].filter((c) => c.kind === "factor");
  const rankedFactors = new Set([...ranked("should"), ...ranked("could")].map((c) => c.factor));

  return (
    <div className="iv-result">
      <header className="iv-head">
        <Link className="link-btn" href="/explore">
          ← Map
        </Link>
      </header>
      <h1 className="iv-scene" tabIndex={-1}>
        {PAGE_TITLE}
      </h1>

      {status === "ask" && (
        <section className="iv-ask" role="alertdialog" aria-labelledby="iv-ask-q">
          <p id="iv-ask-q">{REPLACE_QUESTION}</p>
          {/* Polish (step 4's review): which list is shown below. */}
          <p className="tiny muted">The list below is the one your answers make.</p>
          <div className="iv-ask-actions">
            <button
              type="button"
              className="btn"
              onClick={() => {
                iv.decide(true);
              }}
            >
              {REPLACE_YES}
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                iv.decide(false);
              }}
            >
              {REPLACE_NO}
            </button>
          </div>
        </section>
      )}
      {status === "kept" && (
        <p className="iv-hint" role="status">
          Your priorities are as you left them. Your answers are saved.
        </p>
      )}

      <RubricPreview rubric={r} baseline={iv.before} hover={null} />

      <section className="iv-summary" aria-label="Your priorities">
        <h2>{TIER_NAMES.must}</h2>
        <p className="tiny muted iv-tier-note">{TIER_NOTES.must}</p>
        <ul>
          {cols.must.map((c) => (
            <li key={`${c.kind}:${c.factor}`}>
              {c.kind === "minimum"
                ? minimumLine(r.musts.find((m) => m.factor === c.factor && m.threshold !== undefined)!)
                : plainLine(r, c.factor)}
              {c.kind === "minimum" && rankedFactors.has(c.factor) && (
                <span className="tiny muted"> ({ALSO_RANKED})</span>
              )}
            </li>
          ))}
        </ul>
        {made.mustNote && <p className="iv-note">{MUST_NOTE}</p>}
        {(["should", "could"] as const).map(
          (tier) =>
            ranked(tier).length > 0 && (
              <div key={tier}>
                <h2>{TIER_NAMES[tier]}</h2>
                <p className="tiny muted iv-tier-note">{TIER_NOTES[tier]}</p>
                <ol>
                  {ranked(tier).map((c) => (
                    <li key={c.factor}>
                      <strong>{PRIORITY_TITLES[c.factor]}:</strong> {plainLine(r, c.factor)}
                    </li>
                  ))}
                </ol>
              </div>
            ),
        )}
        {cols.wont.length > 0 && (
          <p>
            <strong>{TIER_NAMES.wont}:</strong> {cols.wont.map((c) => PRIORITY_TITLES[c.factor]).join(", ")}
          </p>
        )}
      </section>

      {/* Step 13: the areas that fit what they just said matters. */}
      <AreaBox where="interview" />

      <nav className="iv-done">
        <Link className="btn" href="/priorities">
          Fine-tune in What matters to you
        </Link>
        {/* Polish #29: each button says where it goes. */}
        <Link className="btn secondary" href="/explore">
          Go to the map
        </Link>
        <button type="button" className="btn secondary" onClick={iv.back}>
          Back to the questions
        </button>
      </nav>
    </div>
  );
}
