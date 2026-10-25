"use client";
/**
 * One page (step 9 plan §2): the head, the grades with their answer lines, the report card in the viewer's order, the
 * takes, and the questions for the agent. With `fit`, it measures itself against the Letter print area and shortens,
 * step by step (FIT_STEPS), until it fits: rows first, never a section dropped. Full shows it unshortened.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { RAISE_WORDS } from "@/lib/report/raise";
import { isAdjusted } from "@/lib/report/adjust";
import { ADJUSTED_TITLE } from "@/lib/report/adjustWords";
import { COST_WORDS } from "@/lib/report/cost";
import { fmt } from "@/lib/format";
import { verdictParts } from "@/lib/report/answer";
import { fitSteps, nextFit, REPORT_WORDS as W, takeWords, type ReportContent } from "@/lib/print/report";

/** The map's height on One page, in CSS px: 3.3 in, or 2.4 in at the fit's third step. */
export const MAP_HEIGHT = { full: 317, small: 230 } as const;

const ADJUSTED_SUFFIX = " ✎";

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
        {c.grades.map((g) => {
          // J-4 (Zach, UX part 2): the verdict first, then the letter, and a joining word when they part.
          const v = verdictParts(g.card);
          return (
            <p key={g.who} className={steps.has("oneLineAnswers") ? "rp-grade rp-clip" : "rp-grade"}>
              <b>{v.verdict}</b> <span className="rp-letter">{v.grade}</span>
              {isAdjusted(g.card) && (
                <span className="adjusted-mark" title={ADJUSTED_TITLE} aria-label={ADJUSTED_TITLE}>
                  ✎
                </span>
              )}
              {v.join && `, ${v.join}`} · {g.who}: {g.reason}
            </p>
          );
        })}
      </section>

      {/* Step 10: the viewer's cost to enjoy, after the grades. */}
      {c.cost.length > 0 && (
        <section className="rp-cost" aria-label={COST_WORDS.section}>
          {c.cost.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </section>
      )}

      {/* Step 12: the top way to raise the viewer's grade (the design's One page). */}
      {c.raise.length > 0 && (
        <p className="rp-raise">
          <b>{RAISE_WORDS.title}:</b> {c.raise[0]}
        </p>
      )}

      {/* Step 14 (plan §7): one line on dividing it, after the Raise line, where the county is covered. */}
      {c.divide && <p className="rp-divide">{c.divide}</p>}

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
                      {r.kind === "grade" ? (
                        <>
                          {/* The letter in its box, the ✎ beside it (it wrapped inside the box). */}
                          <span className="rp-letter">{r.mark.replace(ADJUSTED_SUFFIX, "")}</span>
                          {r.mark.endsWith(ADJUSTED_SUFFIX) && (
                            <span
                              className="adjusted-mark"
                              title={ADJUSTED_TITLE}
                              aria-label={ADJUSTED_TITLE}
                            >
                              ✎
                            </span>
                          )}
                        </>
                      ) : (
                        r.mark
                      )}
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
