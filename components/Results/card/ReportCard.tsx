/**
 * The report sheet's top level (value-ranking.md §6.1; VR5; step 7 plan §1): the answer first (the grade and verdict
 * with one line of reason from the person's priorities, and what didn't load), then what the panel puts
 * between (Best homesite and the alternatives, on the map's panel), then the report card in priority order: Must
 * have, Really want, Nice to have. Cost to enjoy (step 10) sits after the answer: Ready to camp and Ready to build, each
 * against its budget. Don't care rows are hidden. Every line opens
 * its slide-in panel, where today's report sections live; the card's old reason line is in the Grade and verdict one.
 */
import Link from "next/link";
import { GRADES_ID, GRADES_TITLE } from "@/lib/client/help";
import type { ReactNode } from "react";
import { answerReason, incompleteLine } from "@/lib/report/answer";
import { listOf, lowerFirst, VERDICT_WORD, type Card, type Row } from "@/lib/report/card";
import type { PanelKey } from "@/lib/report/cardPanels";
import {
  GATE_MARK as MARK,
  MUST_STATUS_WORD as STATUS_WORD,
  mustLines,
  rankedRows,
  type MustLine,
} from "@/lib/report/cardLines";
import type { NamedRubric } from "@/lib/rubric/types";
import { TIER_NAMES } from "@/lib/rubric/words";
import type { PartialScreenResult } from "@/lib/screen/types";
import { RubricSwitch } from "./RubricSwitch";
import { costSummary } from "@/lib/report/costLines";
import { COST_WORDS } from "@/lib/report/cost";

/**
 * Cost to enjoy (step 10 plan §4): the two lines after the answer, each with its budget's mark and words; a tap opens the
 * breakdown. Nothing until the driveway is routed.
 */
function CostSection({ card, onOpen }: { card: Card; onOpen(key: PanelKey): void }) {
  const s = costSummary(card.cost, card.rubric.rubric.budgets);
  if (!s) return null;
  return (
    <div className="card-group card-cost" role="group" aria-label={COST_WORDS.section}>
      <h3 className="card-sub">{COST_WORDS.section}</h3>
      <p className="tiny muted cost-note">{COST_WORDS.howRead}</p>
      <ul className="card-rows">
        {s.kind === "noWay" ? (
          <li>
            <button className="card-row" onClick={() => onOpen("cost")}>
              <span className="row-label">{s.text}</span>
            </button>
          </li>
        ) : (
          s.lines.map((l) => (
            <li key={l.which} data-card-key={`cost-${l.which}`}>
              <button
                className={`card-row cost-row ${l.budget?.status ?? ""}`}
                aria-label={`${l.label}: ${l.range}${l.budget ? `, ${l.budget.words}` : ""}`}
                onClick={() => onOpen("cost")}
              >
                <span className="row-label">{l.label}</span>
                <span className="cost-range">{l.range}</span>
                {l.budget && (
                  <span className="cost-budget">
                    <span className="mark" aria-hidden="true">
                      {l.budget.mark}
                    </span>{" "}
                    {l.budget.words}
                  </span>
                )}
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

/**
 * A Must's detail: "Check first: …" unless it passes. When its reason has a first clause and more (Legal road access's
 * frontage, then the road in), the more goes on its own line, so what made it a warning reads plainly (polish #7).
 */
function MustDetail({ m }: { m: MustLine }) {
  const say = (s: string) => (m.status === "pass" ? s : `${STATUS_WORD[m.status]}: ${lowerFirst(s)}`);
  if (!m.first || !m.detail.startsWith(`${m.first}; `)) return <>{say(m.detail)}</>;
  return (
    <>
      {say(m.first)};<span className="row-why">{m.detail.slice(m.first.length + 2)}</span>
    </>
  );
}

/**
 * The banner when the drawn lines changed since the screen: the results stay, no re-run. The owner's wording (A,
 * 2026-10-13; an approved replacement of #116's "Your drawn lines changed since this screen. Run again.").
 */
export const LINES_CHANGED = "You drew or changed a line after this screen.";
/** The banner when the boundary changed since the screen (the panel's old red note, less its "Grade again."). */
export const EARLIER_BOUNDARY = "These results are for an earlier boundary.";
/** The banner when the house moved and no live session can re-assess it (the panel's old note, shortened). */
export const HOUSE_CHANGED = "The house changed since this run.";

/** A banner saying the results no longer match an input, with what can be done about it. */
export interface StaleBanner {
  text: string;
  actions: { label: string; onClick(): void }[];
}

export function ReportCard({
  card,
  result,
  running,
  rubrics,
  setRubric,
  onOpen,
  between = null,
  stale = null,
  note = null,
}: {
  card: Card;
  /** The result the card grades: the answer's reason reads a drive time from it. */
  result: PartialScreenResult;
  /** A run in progress: data still to come reads "…", not "didn't load". */
  running: boolean;
  /** The profile's rubrics (step 1): the switch shows only when it holds more than its own. */
  rubrics: readonly NamedRubric[];
  setRubric(id: string): void;
  onOpen(key: PanelKey): void;
  /** What goes between the answer and the rows (the map's panel: Best homesite and the alternatives). */
  between?: ReactNode;
  /**
   * The one banner saying the results no longer match an input (polish #1): the first of the boundary, the house and the
   * lines, under the reason, so the answer comes first (#2).
   */
  stale?: StaleBanner | null;
  /** A line from the parcel's own facts, under the reason (WF1: the listing's acres when they differ). Appended. */
  note?: string | null;
}) {
  const pending = (missing: string | undefined) => running && !!missing;
  const reason = running ? "" : answerReason(card, result);
  const incomplete = running ? null : incompleteLine(card);
  const { should, could } = rankedRows(card);
  const musts = mustLines(card);
  const rowButton = (r: Row) => (
    <li key={r.key} data-card-key={r.key}>
      <button className="card-row" onClick={() => onOpen(r.key)}>
        <span className="row-label">{r.label}</span>
        <span className={`card-grade small g-${r.grade ?? "none"}`}>{r.grade ?? "–"}</span>
        <span className="row-detail">{pending(r.missing) ? "…" : r.detail}</span>
      </button>
    </li>
  );
  const group = (name: string, rows: Row[]) =>
    rows.length > 0 && (
      <div className="card-group" role="group" aria-label={name}>
        <h3 className="card-sub">{name}</h3>
        <ul className="card-rows">{rows.map(rowButton)}</ul>
      </div>
    );
  return (
    <section className="card" aria-label="Report card">
      <div className="card-answer" data-card-key="answer">
        <div className="card-head">
          <button className="card-verdict" onClick={() => onOpen("verdict")}>
            {/* Held until the run ends (polish #9): a grade from half the data would only change. */}
            <span className={`card-grade g-${running ? "none" : (card.grade ?? "none")}`}>
              {running ? "…" : (card.grade ?? "–")}
            </span>
            <span className={`card-word v-${running ? "running" : card.verdict.toLowerCase()}`}>
              {running ? "Grading…" : VERDICT_WORD[card.verdict]}
            </span>
          </button>
          {/* Polish #31: Help's grade rules, beside the grade. */}
          <Link className="link-btn tiny card-how" href={`/help#${GRADES_ID}`}>
            {GRADES_TITLE}
          </Link>
          <RubricSwitch
            rubrics={rubrics}
            current={card.rubric.id}
            setRubric={setRubric}
            label="Whose weights grade the parcel"
          />
        </div>
        {reason && <p className="card-reason">{reason}</p>}
        {!running && card.heldBy && (
          <p className="card-held">
            Held at {VERDICT_WORD.Maybe} by: {listOf(card.heldBy)}.
          </p>
        )}
        {stale && !running && (
          <div className="card-stale" role="status">
            <span>{stale.text}</span>
            {stale.actions.map((a) => (
              <button key={a.label} className="btn small" onClick={a.onClick}>
                {a.label}
              </button>
            ))}
          </div>
        )}
        {/* What didn't load: the grade button beside it is its Try again (plan §1.1); Still unknown has one too. */}
        {incomplete && (
          <p className="answer-incomplete" role="status">
            {incomplete}
          </p>
        )}
        {!running && note && <p className="card-note tiny">{note}</p>}
        {/* WF5: a route chosen from a line this screen has no route from. */}
        {!running && card.routeNote && <p className="card-note tiny">{card.routeNote}</p>}
      </div>
      {!running && <CostSection card={card} onOpen={onOpen} />}
      {between}
      {musts.length > 0 && (
        <div className="card-group" role="group" aria-label={TIER_NAMES.must}>
          <h3 className="card-sub">{TIER_NAMES.must}</h3>
          <ul className="card-rows">
            {musts.map((m) => {
              const wait = pending(m.missing);
              return (
                <li key={`${m.key}-${m.label}`} data-card-key={m.key}>
                  <button
                    className={`card-row must-row ${wait ? "pending" : m.status}`}
                    title={m.detail}
                    aria-label={`${m.label}: ${wait ? "still loading" : m.status}`}
                    onClick={() => onOpen(m.key)}
                  >
                    <span className="row-label">{m.label}</span>
                    <span className="must-mark" title={wait ? undefined : STATUS_WORD[m.status]}>
                      <span className="mark" aria-hidden="true">
                        {wait ? "…" : MARK[m.status]}
                      </span>
                    </span>
                    <span className="row-detail">{wait ? "…" : <MustDetail m={m} />}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {group(TIER_NAMES.should, should)}
      {group(TIER_NAMES.could, could)}
    </section>
  );
}
