"use client";
/**
 * One page (step 9 plan §2): the head, the grades with their answer lines, the report card in the viewer's order, the
 * takes, and the questions for the agent. With `fit`, it measures itself against the Letter print area and shortens,
 * step by step (FIT_STEPS), until it fits: rows first, never a section dropped. Full shows it unshortened.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { COST_WORDS } from "@/lib/report/cost";
import { fmt } from "@/lib/format";
import { VERDICT_WORD, listOf } from "@/lib/report/card";
import { fitSteps, nextFit, REPORT_WORDS as W, takeWords, type ReportContent } from "@/lib/print/report";

/** The map's height on One page, in CSS px: 3.3 in, or 2.4 in at the fit's third step. */
export const MAP_HEIGHT = { full: 317, small: 230 } as const;

export function OnePage({
  content: c,
  fit,
  map,
}: {
  content: ReportContent;
  fit: boolean;
  /** The print map at a height, from the page. */
  map?: (height: number) => ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [level, setLevel] = useState(0);
  // Content or preset changed: start again from nothing shortened.
  const [seen, setSeen] = useState({ c, fit });
  if (seen.c !== c || seen.fit !== fit) {
    setSeen({ c, fit });
    setLevel(0);
  }
  useLayoutEffect(() => {
    if (!fit || !box.current) return;
    const next = nextFit(level, box.current.scrollHeight);
    if (next !== null) setLevel(next);
  }, [fit, level, c]);
  const steps = fitSteps(fit ? level : 0);

  return (
    <div className="rp-one" ref={box} data-fit={fit ? level : undefined}>
      <header className="rp-head">
        <h1>{c.name}</h1>
        <p className="rp-facts">
          {[c.acres !== null ? `${fmt(c.acres, 2)} ac` : null, c.price, c.perAcre, c.graded]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {c.stale && <p className="rp-stale">{W.staleBoundary}</p>}
      </header>

      {map && (
        <div className="rp-map-slot">{map(steps.has("smallerMap") ? MAP_HEIGHT.small : MAP_HEIGHT.full)}</div>
      )}

      <section className="rp-grades" aria-label="Grades">
        {c.grades.map((g) => (
          <p key={g.who} className={steps.has("oneLineAnswers") ? "rp-grade rp-clip" : "rp-grade"}>
            <span className="rp-letter">{g.card.grade ?? "–"}</span> <b>{VERDICT_WORD[g.card.verdict]}</b> ·{" "}
            {g.who}: {g.reason}
            {g.card.heldBy && (
              <>
                {" "}
                Held at {VERDICT_WORD.Maybe} by: {listOf(g.card.heldBy)}.
              </>
            )}
          </p>
        ))}
      </section>

      {/* Step 10: the viewer's cost to enjoy, after the grades. */}
      {c.cost.length > 0 && (
        <section className="rp-cost" aria-label={COST_WORDS.section}>
          {c.cost.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </section>
      )}

      <section className="rp-card" aria-label="Report card">
        {c.tiers.map((t) => (
          <div key={t.name} className="rp-tier">
            <h2>{t.name}</h2>
            <table>
              <tbody>
                {t.rows.map((r) => (
                  <tr key={r.key}>
                    <th scope="row">{r.label}</th>
                    <td className={`rp-mark rp-${r.kind}`} data-tone={r.tone}>
                      {r.kind === "grade" ? <span className="rp-letter">{r.mark}</span> : r.mark}
                    </td>
                    <td>{steps.has("shortRows") ? r.short : r.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>

      {c.takes.length > 0 && (
        <section className="rp-takes">
          <h2>{W.takes}</h2>
          <ul>
            {c.takes.map((t) => (
              <li key={t.who} className={steps.has("oneLineComments") ? "rp-clip" : undefined}>
                <b>{takeWords(t)}</b>
                {t.comment && <>: “{t.comment}”</>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rp-questions">
        <h2>{W.questions}</h2>
        {c.questions.length ? (
          <ol>
            {c.questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ol>
        ) : (
          <p>{W.noQuestions}</p>
        )}
      </section>
    </div>
  );
}
