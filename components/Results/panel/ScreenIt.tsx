"use client";
/**
 * Screen it (proto L226–233, L994–1180): the run for the open parcel, in two places (owner, after 14d):
 *   - ScreenHeader: one line at the top of the panel (the bottom sheet's peek on phones): the parcel's name
 *     and acres, a dot in the verdict's colour once it's screened, and Run screen / Cancel · Running… /
 *     Run again — the app's main action, always in reach;
 *     On desktop the header is also the floating card (ExploreShell): "Screen it", and once there's a report,
 *     a control that folds the panel back to the card, where a second line gives the verdict;
 *   - ScreenBody: the step list, the notes on whether the results still fit, and the report below in
 *     collapsible sections.
 * Both read one useScreenIt, owned by the shell. Each finished run is kept (IndexedDB, under the parcel's
 * `screenIds`), so a parcel reopened from History shows its last results.
 *
 * Whether the results still fit the open parcel (owner, 14d):
 *   - its boundary changed (pieces or split): the results are stale and say so; a re-run is required;
 *   - its house was added, moved or removed: re-assessed through the worker's setHouse, no notice (after a
 *     reload there's no session to do it with, and a short note asks for a run);
 *   - Settings changed since the run: a softer note, with the run's settings on request.
 */
import { useEffect, useRef, useState } from "react";
import { useScreen } from "@/lib/client/useScreen";
import { freshness, runKeys, type RunKeys } from "@/lib/client/screenKeys";
import { addScreen, getScreen, type ScreenRecord } from "@/lib/client/screenStore";
import { fmt } from "@/lib/format";
import { verdictView } from "@/lib/report/verdict";
import { STEPS } from "@/lib/screen/config";
import { summaryText } from "@/lib/screen/summary";
import type { PartialScreenResult, ScreenResult, UserConfig } from "@/lib/screen/types";
import type { ExploreController, SetHint } from "@/components/Explore/useExploreController";
import { evaluationPoint } from "../blocks/types";
import { REPORT } from "../report";
import { Section } from "./Section";

/** The run the worker's session holds: which parcel it was for (state.serial) and what it was run on. */
interface LiveRun {
  serial: number;
  keys: RunKeys;
}

export type ScreenIt = ReturnType<typeof useScreenIt>;

export function useScreenIt(
  ctl: ExploreController,
  config: UserConfig,
  onFinished: () => void,
  hint: SetHint,
) {
  const screen = useScreen();
  const { serial } = ctl.state;
  const open = ctl.state.store.open;
  const parcel = ctl.parcel;
  const house = open?.house ?? null;
  const [live, setLive] = useState<LiveRun | null>(null);
  const [stored, setStored] = useState<{ serial: number; record: ScreenRecord } | null>(null);
  const [showParams, setShowParams] = useState(false);

  // Handlers and effects read the latest controller and callback.
  const latest = useRef({ ctl, onFinished });
  useEffect(() => {
    latest.current = { ctl, onFinished };
  });

  // The open parcel's last kept screen, read back when it opens (or when a new one is kept).
  const latestId = open?.screenIds.at(-1) ?? null;
  useEffect(() => {
    if (!latestId) return;
    let gone = false;
    void getScreen(latestId).then((record) => {
      if (!gone && record) setStored((s) => (s?.record.id === record.id ? s : { serial, record }));
    });
    return () => {
      gone = true;
    };
  }, [latestId, serial]);

  // Another parcel opened mid-run: that run is no longer wanted.
  const running = screen.state.status === "running";
  useEffect(() => {
    if (running && live && live.serial !== serial) screen.cancel();
  }, [running, live, serial, screen]);

  // A finished run, or a re-assessed house, is kept as a new screen of the parcel it was for.
  const kept = useRef<unknown>(null);
  // The house last asked of the session (kept until the next run, so the same house isn't asked twice
  // while its result is still being kept), and whether that answer is still awaited.
  const askedHouse = useRef<string | null>(null);
  const awaitingHouse = useRef(false);
  const status = screen.state.status;
  const result = screen.state.result;
  useEffect(() => {
    if (status !== "done" || !live || !result || kept.current === result || result.verdict === undefined)
      return;
    kept.current = result;
    const reassessed = awaitingHouse.current ? askedHouse.current : null;
    awaitingHouse.current = false;
    const base = reassessed !== null && stored ? stored.record.keys : live.keys;
    const record: ScreenRecord = {
      id: crypto.randomUUID(),
      keys: reassessed !== null ? { ...base, house: reassessed } : base,
      result: result as ScreenResult,
    };
    void addScreen(record).then(() => setStored({ serial: live.serial, record }));
    latest.current.ctl.screened(record.id, live.serial);
    if (reassessed === null) latest.current.onFinished();
  }, [status, result, live, stored]);

  const now = parcel ? runKeys(parcel.geo.geometry, house, config) : null;
  const shown = stored && stored.serial === serial ? stored.record : null;
  const fresh = shown && now ? freshness(shown.keys, now) : null;
  const stale = !!shown && (!now || !!fresh?.boundary);
  // The worker's session is this parcel's last run, on this boundary: it can re-assess the house.
  const sessionLive = !!live && live.serial === serial && status === "done" && !!shown && !stale;

  // The house changed: re-assess it with the session (no notice), when there is one.
  useEffect(() => {
    if (!sessionLive || !fresh?.house || screen.state.updating || !now) return;
    if (askedHouse.current === now.house) return;
    askedHouse.current = now.house;
    awaitingHouse.current = true;
    screen.setHouse(house);
  }, [sessionLive, fresh?.house, now, house, screen]);

  const run = () => {
    if (!parcel || !now) return;
    setLive({ serial, keys: now });
    askedHouse.current = null;
    awaitingHouse.current = false;
    setShowParams(false);
    screen.run({ polygon: parcel.geo.geometry, config, ...(house ? { house } : {}) });
  };

  // Copy summary (proto L1565): the kept result's plain-text summary; the map's hint says so for 1.5 s.
  const copySummary = () => {
    if (!shown) return;
    const say = (msg: string) => {
      hint(msg);
      setTimeout(() => hint((h) => (h === msg ? "" : h)), 1500);
    };
    navigator.clipboard.writeText(summaryText(shown.result)).then(
      () => say("Summary copied"),
      () => say("The browser didn't allow copying"),
    );
  };

  const runningHere = running && live?.serial === serial;
  const display: PartialScreenResult | null = runningHere ? screen.state.result : (shown?.result ?? null);
  const point = display ? evaluationPoint(display) : null;

  return {
    ctl,
    parcel,
    running,
    runningHere,
    shown,
    stale,
    fresh,
    sessionLive,
    showParams,
    toggleParams: () => setShowParams((v) => !v),
    copySummary,
    run,
    cancel: screen.cancel,
    steps: screen.state.steps,
    showSteps: live?.serial === serial && status !== "idle",
    error: live?.serial === serial ? screen.state.error : null,
    display,
    point,
  };
}

const VERDICT_WORD = {
  fatal: "Walk away",
  marginal: "Worth a drive, eyes open",
  ok: "Nothing in the data kills it",
};

/** Desktop: whether the card is grown into the panel, and how to fold or unfold it (null: nothing to read). */
export interface DeskCard {
  expanded: boolean;
  fold: (() => void) | null;
}

/** The panel's one-line header: the parcel, its acres, the verdict's dot, and the screen button. */
export function ScreenHeader({ s, desk = null }: { s: ScreenIt; desk?: DeskCard | null }) {
  const d = s.ctl.derived;
  if (!s.ctl.state.store.open)
    return <span className="sh-empty">{desk ? "Tap a parcel to begin" : "Tap a parcel to screen it"}</span>;
  const name = s.ctl.layers?.name ?? "Parcel";
  const verdict = !s.runningHere && !s.stale ? s.shown?.result.verdict : undefined;
  const label = s.running ? "Running…" : s.shown ? "Run again" : desk ? "Screen it" : "Run screen";
  const folded = desk && !desk.expanded && desk.fold && s.display;
  return (
    <>
      <span className="sh-parcel">
        <span className="sh-name">{name}</span>
        {d?.ok && <span className="sh-acres"> · {fmt(d.acres, 2)} ac</span>}
        {verdict && (
          <span
            className={`sh-dot ${verdict}`}
            role="img"
            aria-label={`Verdict: ${VERDICT_WORD[verdict]}`}
            title={VERDICT_WORD[verdict]}
          />
        )}
      </span>
      <span className="sh-actions">
        {s.runningHere && (
          <button className="btn secondary small" onClick={s.cancel}>
            Cancel
          </button>
        )}
        <button className="btn small" disabled={!s.parcel || s.running} onClick={s.run}>
          {label}
        </button>
        {desk?.fold && (
          <button
            className="sh-fold"
            aria-expanded={desk.expanded}
            aria-label={desk.expanded ? "Fold the report to the card" : "Show the report"}
            title={desk.expanded ? "Fold to the card" : "Show the report"}
            onClick={desk.fold}
          >
            <Chevron up={desk.expanded} />
          </button>
        )}
      </span>
      {folded && <VerdictLine s={s} />}
    </>
  );
}

/** The folded card's second line: the verdict's lead, or why the results no longer fit. */
function VerdictLine({ s }: { s: ScreenIt }) {
  if (!s.display) return null;
  if (s.stale && !s.runningHere)
    return <span className="sh-verdict muted">These results are for an earlier boundary. Run again.</span>;
  const v = verdictView(s.display);
  return <span className={`sh-verdict ${v.tone}`}>{v.lead}</span>;
}

function Chevron({ up }: { up: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d={up ? "M3.5 10 8 5.5 12.5 10" : "M3.5 6 8 10.5 12.5 6"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The panel's body: the run's steps, whether the results still fit, and the report. */
export function ScreenBody({ s }: { s: ScreenIt }) {
  const { display, point, shown } = s;
  const notes = !s.runningHere && shown;
  if (!s.showSteps && !s.error && !notes && !display) return null;
  return (
    <>
      {(s.showSteps || s.error || notes) && (
        <section className="block">
          {s.showSteps && <StepList steps={s.steps} />}
          {s.error && <p className="tiny text-steep">The screen stopped: {s.error}</p>}
          {notes && !s.stale && (
            <div className="report-actions">
              <button className="btn secondary small" onClick={s.copySummary}>
                Copy summary
              </button>
            </div>
          )}
          {notes && (
            <Notices
              stale={s.stale}
              houseChanged={!!s.fresh?.house}
              sessionLive={s.sessionLive}
              settingsChanged={!!s.fresh?.settings}
              showParams={s.showParams}
              toggleParams={s.toggleParams}
              params={shown.result.params}
            />
          )}
        </section>
      )}
      {display && (
        <div className={s.stale && !s.runningHere ? "report stale" : "report"}>
          {REPORT.map(({ Block, heading }) => {
            const body = Block({ result: display, point, variant: "panel" });
            if (body === null) return null;
            const h = heading(display, point);
            return (
              <Section key={h.slug} heading={h}>
                {body}
              </Section>
            );
          })}
        </div>
      )}
    </>
  );
}

/** The run's steps (proto renderSteps, L991): a dot per step, with its message and the query link. */
function StepList({ steps }: { steps: ReturnType<typeof useScreen>["state"]["steps"] }) {
  return (
    <ul className="steps">
      {STEPS.map(([id, label]) => {
        const st = steps[id];
        return (
          <li key={id} className={st?.status ?? ""}>
            <span className="dot" />
            <span>
              {label}
              {st?.message && <span className="muted"> — {st.message}</span>}
              {st?.link && (
                <>
                  {" "}
                  <a href={st.link} target="_blank" rel="noreferrer">
                    test the query
                  </a>
                </>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Notices(p: {
  stale: boolean;
  houseChanged: boolean;
  sessionLive: boolean;
  settingsChanged: boolean;
  showParams: boolean;
  toggleParams(): void;
  params: ScreenResult["params"];
}) {
  if (p.stale)
    return <p className="report-note stale-note">These results are for an earlier boundary. Run again.</p>;
  return (
    <>
      {/* With a live session a changed house is being re-assessed; without one, it takes a run. */}
      {p.houseChanged &&
        (p.sessionLive ? (
          <p className="tiny muted">Re-assessing the house…</p>
        ) : (
          <p className="report-note">The house changed since this run — run again to assess it.</p>
        ))}
      {!p.sessionLive && !p.houseChanged && (
        <p className="tiny muted">Run again to restore the map overlays, horizon fan and 3D view.</p>
      )}
      {p.settingsChanged && (
        <div className="tiny muted">
          These results used earlier settings.{" "}
          <button className="link-btn" aria-expanded={p.showParams} onClick={p.toggleParams}>
            {p.showParams ? "Hide them" : "Show them"}
          </button>
          {p.showParams && (
            <ul className="plain">
              <li>House site threshold: {p.params.houseMin}</li>
              <li>Shelf threshold: {p.params.shelfMin}</li>
              <li>Garden threshold: {p.params.gardenMin}</li>
              <li>Canopy allowance: {fmt(p.params.canopyDeg)}°</li>
              <li>Shallow bedrock: {p.params.shallowBedrockCm} cm</li>
            </ul>
          )}
        </div>
      )}
    </>
  );
}
