/**
 * The report sheet's top level (value-ranking.md §6.1; VR5): the parcel grade and verdict with its reason, the
 * dealbreakers, the graded rows one line each, and the cost to enjoy (pending until VR4). Every line opens its
 * slide-in panel, where today's report sections now live.
 */
import type { Card, GateStatus } from "@/lib/report/card";
import type { PanelKey } from "@/lib/report/cardPanels";
import type { NamedRubric } from "@/lib/rubric/types";
import { RubricSwitch } from "./RubricSwitch";

const MARK: Record<GateStatus, string> = { pass: "✓", warn: "!", fail: "✗", unknown: "?" };
const SHORT: Record<string, string> = {
  floodplain: "Flood",
  access: "Access",
  easement: "Easement",
  septic: "Septic",
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

export function ReportCard({
  card,
  running,
  rubrics,
  setRubric,
  onOpen,
  stale = null,
  note = null,
}: {
  card: Card;
  /** A run in progress: data still to come reads "…", not "didn't load". */
  running: boolean;
  /** The profile's rubrics (step 1): the switch shows only when it holds more than its own. */
  rubrics: readonly NamedRubric[];
  setRubric(id: string): void;
  onOpen(key: PanelKey): void;
  /** A banner under the header saying the results no longer match an input (LINES_CHANGED). */
  stale?: StaleBanner | null;
  /** A line from the parcel's own facts, under the reason (WF1: the listing's acres when they differ). Appended. */
  note?: string | null;
}) {
  const pending = (missing: string | undefined) => running && !!missing;
  return (
    <section className="card" aria-label="Report card">
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
      {!running && <p className="card-reason">{card.reason}</p>}
      {!running && note && <p className="card-note tiny">{note}</p>}
      {/* WF5: a route chosen from a line this screen has no route from. */}
      {!running && card.routeNote && <p className="card-note tiny">{card.routeNote}</p>}
      <div className="card-gates">
        <span className="card-sub">Dealbreakers</span>
        {card.gates.map((g) => (
          <button
            key={g.key}
            className={`gate ${pending(g.missing) ? "pending" : g.status}`}
            title={g.reason}
            aria-label={`${g.label}: ${pending(g.missing) ? "pending" : g.status}`}
            onClick={() => onOpen(g.key)}
          >
            <span className="mark" aria-hidden="true">
              {pending(g.missing) ? "…" : MARK[g.status]}
            </span>
            {SHORT[g.key]}
          </button>
        ))}
      </div>
      <ul className="card-rows">
        {card.rows.map((r) => (
          <li key={r.key}>
            <button className="card-row" onClick={() => onOpen(r.key)}>
              <span className="row-label">{r.label}</span>
              <span className={`card-grade small g-${r.grade ?? "none"}`}>{r.grade ?? "–"}</span>
              <span className="row-detail">{pending(r.missing) ? "…" : r.detail}</span>
            </button>
          </li>
        ))}
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
