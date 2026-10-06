"use client";
/**
 * Screen it (proto L226–233, L994–1180): Run, Cancel and the step list for the open parcel, and its report
 * below in collapsible sections. Each finished run is kept (IndexedDB, under the parcel's `screenIds`), so a
 * parcel reopened from History shows its last results.
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
import { STEPS } from "@/lib/screen/config";
import type { PartialScreenResult, ScreenResult, UserConfig } from "@/lib/screen/types";
import { useExplore } from "@/components/Explore/useExploreController";
import { evaluationPoint } from "../blocks/types";
import { REPORT } from "../report";
import { Section } from "./Section";

/** The run the worker's session holds: which parcel it was for (state.serial) and what it was run on. */
interface LiveRun {
  serial: number;
  keys: RunKeys;
}

export function ScreenIt({ config, onFinished }: { config: UserConfig; onFinished(): void }) {
  const ctl = useExplore();
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

  const runningHere = running && live?.serial === serial;
  const display: PartialScreenResult | null = runningHere ? screen.state.result : (shown?.result ?? null);
  const point = display ? evaluationPoint(display) : null;

  return (
    <>
      <section className="block">
        <div className="row justify-between">
          <h2 className="m-0">Screen it</h2>
          <span className="row">
            {runningHere && (
              <button className="btn secondary" onClick={screen.cancel}>
                Cancel
              </button>
            )}
            <button className="btn" disabled={!parcel || running} onClick={run}>
              {running ? "Running…" : shown ? "Run again" : "Run screen"}
            </button>
          </span>
        </div>
        {!parcel && <p className="tiny muted">Select a parcel to screen it.</p>}
        {live?.serial === serial && status !== "idle" && <StepList steps={screen.state.steps} />}
        {screen.state.error && live?.serial === serial && (
          <p className="tiny text-steep">The screen stopped: {screen.state.error}</p>
        )}
        {!runningHere && shown && (
          <Notices
            stale={stale}
            houseChanged={!!fresh?.house}
            sessionLive={sessionLive}
            settingsChanged={!!fresh?.settings}
            showParams={showParams}
            toggleParams={() => setShowParams((s) => !s)}
            params={shown.result.params}
          />
        )}
      </section>
      {display && (
        <div className={stale && !runningHere ? "report stale" : "report"}>
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
