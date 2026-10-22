"use client";
/**
 * Ways to raise this grade (step 12, docs/plans/step-12-raise-the-grade.md §2): after the card, at most three changes
 * that raise the person's letter or verdict, each as cause and effect with its cost, and the action that makes it.
 * Nothing changes until the person acts.
 */
import { RAISE_WORDS as W, type RaiseAction, type Suggestion } from "@/lib/report/raise";

export function RaiseSection({
  suggestions,
  act,
  extra = null,
}: {
  suggestions: readonly Suggestion[];
  act(a: RaiseAction): void;
  /** What follows the suggestions (later PRs: the neighbour's button). */
  extra?: React.ReactNode;
}) {
  return (
    <section className="card-group raise" aria-labelledby="raise-title" data-card-key="raise">
      <h3 id="raise-title" className="card-sub">
        {W.title}
      </h3>
      {suggestions.length === 0 && !extra && <p className="tiny muted">{W.none}</p>}
      {suggestions.length > 0 && (
        <ul className="raise-list">
          {suggestions.map((x) => (
            <li key={x.kind} className={`raise-item raise-${x.kind}`}>
              <p className="raise-text">
                {x.text}
                {x.cost && <span className="raise-cost"> · {x.cost}</span>}
              </p>
              <button type="button" className="btn secondary raise-act" onClick={() => act(x.action)}>
                {x.action.kind === "house"
                  ? W.house
                  : x.action.kind === "adjust"
                    ? x.action.choice === "pass"
                      ? W.pass
                      : W.setAside
                    : null}
              </button>
            </li>
          ))}
        </ul>
      )}
      {extra}
    </section>
  );
}
