/**
 * The report sheet's top level (value-ranking.md §6.1; VR5; step 7 plan §1): the answer first (the grade and verdict
 * with one line of reason from the person's priorities, and what didn't load), then what the panel puts
 * between (Best homesite and the alternatives, on the map's panel), then the report card in priority order: Must
 * have, Really want, Nice to have, and Cost to enjoy (pending until VR4). Don't care rows are hidden. Every line opens
 * its slide-in panel, where today's report sections live; the card's old reason line is in the Grade and verdict one.
 */
import type { ReactNode } from "react";
import { answerReason, incompleteLine } from "@/lib/report/answer";
import { lowerFirst, type Card, type GateStatus, type Row } from "@/lib/report/card";
import type { PanelKey } from "@/lib/report/cardPanels";
import { thresholdStatus, thresholdWords, type MustStatus } from "@/lib/rubric/musts";
import type { NamedRubric } from "@/lib/rubric/types";
import { FACTOR_LABELS, TIER_NAMES } from "@/lib/rubric/words";
import { fmt } from "@/lib/format";
import type { PartialScreenResult } from "@/lib/screen/types";
import { RubricSwitch } from "./RubricSwitch";

const MARK: Record<GateStatus, string> = { pass: "✓", warn: "!", fail: "✗", unknown: "?" };
/** A Must's status in words (plan §1.4): a warning is something to check first. */
const STATUS_WORD: Record<GateStatus, string> = {
  pass: "Pass",
  warn: "Check first",
  fail: "Fail",
  unknown: "Unknown",
};
/**
 * The banner when the drawn lines changed since the screen: the results stay, no re-run. The owner's wording (A,
 * 2026-10-13; an approved replacement of #116's "Your drawn lines changed since this screen. Run again.").
 */
export const LINES_CHANGED = "You drew or changed a line after this screen.";
/** Its action until follow-up 56's "Score it as the driveway" exists: today's Run again (owner, A). */
export const LET_THE_APP_CONSIDER_IT = "Let the app consider it";

/** A banner saying the results no longer match an input, with what can be done about it. */
export interface StaleBanner {
  text: string;
  actions: { label: string; onClick(): void }[];
}

/** One Must on the card: a gate the person keeps, or a limit on a row with its measure. */
interface MustLine {
  key: PanelKey;
  label: string;
  status: GateStatus;
  detail: string;
  /** The data that didn't load, when that's why it's unknown. */
  missing?: string;
}

const LIMIT_STATUS: Record<MustStatus, GateStatus> = { pass: "pass", fail: "fail", unknown: "unknown" };

/** The card's Must have lines: the gates the person keeps, then each limit, in the rubric's order. */
export function mustLines(card: Card): MustLine[] {
  const R = card.rubric.rubric;
  const gates = card.gates
    .filter((g) => R.musts.some((m) => m.factor === g.key && m.threshold === undefined))
    .map(
      (g): MustLine => ({
        key: g.key,
        label: g.label,
        status: g.status,
        detail: g.reason,
        ...(g.missing ? { missing: g.missing } : {}),
      }),
    );
  const limits = R.musts.flatMap((must): MustLine[] => {
    if (must.threshold === undefined) return [];
    const row = card.rows.find((x) => x.key === must.factor);
    const measured = row?.short ?? row?.detail;
    return [
      {
        key: must.factor,
        label: FACTOR_LABELS[must.factor],
        status: LIMIT_STATUS[thresholdStatus(must, row?.measure)],
        detail: `${thresholdWords(must, (n) => fmt(n))}${measured ? ` · ${measured}` : ""}`,
        ...(row?.missing ? { missing: row.missing } : {}),
      },
    ];
  });
  return [...gates, ...limits];
}

/** The ranked rows by tier, in rank order (plan §1.4). */
export function rankedRows(card: Card): { should: Row[]; could: Row[] } {
  const by = (tier: "should" | "could") =>
    card.rubric.rubric.ranked
      .filter((c) => c.tier === tier)
      .flatMap((c) => card.rows.filter((x) => x.key === c.factor));
  return { should: by("should"), could: by("could") };
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
  /** A banner under the header saying the results no longer match an input (LINES_CHANGED). */
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
    <li key={r.key}>
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
      <div className="card-answer">
        <div className="card-head">
          <button className="card-verdict" onClick={() => onOpen("verdict")}>
            <span className={`card-grade g-${card.grade ?? "none"}`}>{card.grade ?? "–"}</span>
            <span className={`card-word v-${running ? "running" : card.verdict.toLowerCase()}`}>
              {running ? "Screening…" : card.verdict}
            </span>
          </button>
          <RubricSwitch
            rubrics={rubrics}
            current={card.rubric.id}
            setRubric={setRubric}
            label="Whose weights grade the parcel"
          />
        </div>
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
        {reason && <p className="card-reason">{reason}</p>}
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
      {between}
      {musts.length > 0 && (
        <div className="card-group" role="group" aria-label={TIER_NAMES.must}>
          <h3 className="card-sub">{TIER_NAMES.must}</h3>
          <ul className="card-rows">
            {musts.map((m) => {
              const wait = pending(m.missing);
              return (
                <li key={`${m.key}-${m.label}`}>
                  <button
                    className={`card-row must-row ${wait ? "pending" : m.status}`}
                    title={m.detail}
                    aria-label={`${m.label}: ${wait ? "pending" : m.status}`}
                    onClick={() => onOpen(m.key)}
                  >
                    <span className="row-label">{m.label}</span>
                    <span className="must-mark" title={wait ? undefined : STATUS_WORD[m.status]}>
                      <span className="mark" aria-hidden="true">
                        {wait ? "…" : MARK[m.status]}
                      </span>
                    </span>
                    <span className="row-detail">
                      {wait ? "…" : m.status === "pass" ? m.detail : `${STATUS_WORD[m.status]}: ${lowerFirst(m.detail)}`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {group(TIER_NAMES.should, should)}
      {group(TIER_NAMES.could, could)}
      <ul className="card-rows card-cost">
        <li>
          <button className="card-row" onClick={() => onOpen("cost")}>
            <span className="row-label">Cost to enjoy</span>
            <span className="card-grade small g-none">–</span>
            <span className="row-detail">pending</span>
          </button>
        </li>
      </ul>
    </section>
  );
}
