"use client";
/**
 * Screen it (proto L226–233, L994–1180): the run for the open parcel, in two places (owner, after 14d):
 *   - ScreenHeader: one line at the top of the panel (the bottom sheet's peek on phones): the parcel's name
 *     and acres, a dot in the verdict's colour once it's screened, and Screen it / Cancel · Running… /
 *     Run again — the app's main action, always in reach;
 *     On desktop the header is also the floating card (ExploreShell); once there's a report, it has
 *     a control that folds the panel back to the card, where a second line gives the verdict;
 *   - ScreenBody: the step list, the notes on whether the results still fit, and the report card below
 *     (VR5): each of its lines opens a slide-in panel holding the report sections that belong to it.
 * Both read one useScreenIt, owned by the shell. Each finished run is kept (IndexedDB, under the parcel's
 * `screenIds`), so a parcel reopened from History shows its last results.
 *
 * Whether the results still fit the open parcel (owner, 14d):
 *   - its boundary changed (pieces or split): the results are stale and say so; a re-run is required;
 *   - its house was added, moved or removed: re-assessed through the worker's setHouse, no notice (after a
 *     reload there's no session to do it with, and a short note asks for a run);
 *   - Settings changed since the run: a softer note, with the run's settings on request.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useScreen } from "@/lib/client/useScreen";
import { freshness, runKeys, type RunKeys } from "@/lib/client/screenKeys";
import { drawnInput } from "@/lib/client/parcelStore";
import {
  addScreen,
  needsRescreen,
  readScreen,
  RESCREEN_OFFLINE,
  RESCREENED,
  type ScreenRecord,
} from "@/lib/client/screenStore";
import { useOnline } from "@/lib/client/useOnline";
import { ENGINE_VERSION } from "@/lib/screen/engine";
import { fmt } from "@/lib/format";
import { STEPS } from "@/lib/screen/config";
import { summaryText } from "@/lib/screen/summary";
import { debugOn, publishPosted } from "@/lib/client/debugHandle";
import { SessionLru } from "@/lib/client/sessionLru";
import { evaluatedNote } from "@/lib/render/pins";
import type { LatLon } from "@/lib/geo/types";
import type { PartialScreenResult, ScreenResult, UserConfig } from "@/lib/screen/types";
import type { ExploreController, SetHint } from "@/components/Explore/useExploreController";
import { evaluationPoint } from "../blocks/types";
import { getPref, setPref } from "@/lib/client/prefs";
import { reportCard, type Person } from "@/lib/report/card";
import type { PanelKey } from "@/lib/report/cardPanels";
import { CardPanel } from "../card/CardPanel";
import { ReportCard } from "../card/ReportCard";
import { OFFLINE_SCREEN_TEXT } from "@/lib/client/pwa";

/** The run the worker's session holds: which parcel it was for (state.serial) and what it was run on. */
interface LiveRun {
  serial: number;
  keys: RunKeys;
  /** The re-screen on open (owner, #101), not the user's own run. */
  auto?: true;
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
  // The lines drawn with the parcel, as the screen reads them (follow-up 34).
  const markup = open?.markup;
  const lines = useMemo(() => drawnInput(markup ?? []), [markup]);
  const [live, setLive] = useState<LiveRun | null>(null);
  const [stored, setStored] = useState<{ serial: number; record: ScreenRecord } | null>(null);
  const [showParams, setShowParams] = useState(false);
  // Whose grade the card shows (VR5; owner #110: on the sheet, remembered per browser).
  const [person, setPersonState] = useState<Person>(() => getPref("ps.person"));
  // A pin tap re-evaluates at another point (step 15): shown, never kept (owner, 15 plan Q1).
  const [evalAsked, setEvalAsked] = useState<{ serial: number; ll: LatLon; label: string } | null>(null);
  const awaitingEval = useRef(false);
  // A kept session reactivated (17e): its result comes back, but it's not a new screen to keep.
  const awaitingRestore = useRef(false);
  const evalHint = useRef("");

  // Handlers and effects read the latest controller and callback.
  const latest = useRef({ ctl, onFinished, hint });
  useEffect(() => {
    latest.current = { ctl, onFinished, hint };
  });

  // The open parcel's last kept screen, read back when it opens (or when a new one is kept), and whether it calls
  // for a re-screen (owner, #101): gone (v3's clean break) or from earlier rules. `rescreen` is the open it's for.
  const latestId = open?.screenIds.at(-1) ?? null;
  const [rescreen, setRescreen] = useState<number | null>(null);
  useEffect(() => {
    if (!latestId) return;
    let gone = false;
    void readScreen(latestId).then((r) => {
      if (gone) return;
      // Keyed by this open too: the same record reopened later (another parcel in between) is shown again.
      if (r.kind === "ok") {
        const record = r.record;
        setStored((s) => (s?.record.id === record.id && s.serial === serial ? s : { serial, record }));
      }
      setRescreen((x) => (needsRescreen(r) ? serial : x === serial ? null : x));
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

  // The re-screen on open (owner, #101): the open it was tried for (once per open), and the open whose result it
  // replaced.
  const autoTried = useRef<number | null>(null);
  const [rescreened, setRescreened] = useState<number | null>(null);
  const online = useOnline();

  // A finished run, or a re-assessed house, is kept as a new screen of the parcel it was for.
  const kept = useRef<unknown>(null);
  // The house last asked of the session (kept until the next run, so the same house isn't asked twice
  // while its result is still being kept), and whether that answer is still awaited.
  const askedHouse = useRef<string | null>(null);
  const awaitingHouse = useRef(false);
  const status = screen.state.status;
  const result = screen.state.result;
  // The test-only debug handle (window.__psDebug.posted, with ps.debug): written here, never read by the app.
  useEffect(() => publishPosted(result), [result]);
  useEffect(() => {
    if (status !== "done" || !live || !result || kept.current === result || result.verdict === undefined)
      return;
    kept.current = result;
    if (awaitingRestore.current) {
      awaitingRestore.current = false;
      return;
    }
    // A re-evaluation at another point is exploration: not a new screen, and the sheet stays where it is.
    if (awaitingEval.current) {
      awaitingEval.current = false;
      const msg = evalHint.current;
      latest.current.hint((h) => (h === msg ? "" : h));
      return;
    }
    const reassessed = awaitingHouse.current ? askedHouse.current : null;
    awaitingHouse.current = false;
    const base = reassessed !== null && stored ? stored.record.keys : live.keys;
    const record: ScreenRecord = {
      id: crypto.randomUUID(),
      keys: reassessed !== null ? { ...base, house: reassessed } : base,
      result: result as ScreenResult,
      engine: ENGINE_VERSION,
    };
    void addScreen(record).then(() => {
      setStored({ serial: live.serial, record });
      if (live.auto && reassessed === null) setRescreened(live.serial);
    });
    latest.current.ctl.screened(record.id, live.serial);
    if (reassessed === null) latest.current.onFinished();
  }, [status, result, live, stored]);

  const now = parcel ? runKeys(parcel.geo.geometry, house, config, lines) : null;
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

  // The controller won't switch parcels while a screen runs (17e).
  useEffect(() => latest.current.ctl.setBusy(running), [running]);

  // Live sessions for the most recently screened parcels (17e): reopening one restores its overlays, the
  // ground viewer and pin re-evaluation from the worker, with no re-run. Keyed by History key.
  const sessions = useRef(new SessionLru<RunKeys>());
  const openKey = open?.key ?? null;
  const st = screen.state;
  // Index the current run once it's done (and again after a house re-assessment: its size may change).
  const indexed = useRef<unknown>(null);
  useEffect(() => {
    if (st.status !== "done" || st.updating || !st.bytes || st.runId === null || !live || !openKey) return;
    if (live.serial !== serial || indexed.current === st.result) return;
    indexed.current = st.result;
    const entry = {
      parcel: openKey,
      runId: st.runId,
      keys: live.keys,
      bytes: st.bytes.session + st.bytes.view,
    };
    for (const r of sessions.current.put(entry, openKey)) if (r.runId !== st.runId) screen.release(r.runId);
  }, [st.status, st.updating, st.bytes, st.runId, st.result, live, openKey, serial, screen]);
  // A parcel opened from History (or Back) that still has a session: make it the current one again.
  useEffect(() => {
    if (running || !openKey || !parcel) return;
    const kept = sessions.current.get(openKey);
    // Even when it is still the worker's current run (nothing else ran meanwhile): this open is a new one, and
    // reactivating also takes it back to the run's own point (18b, found in the live acceptance run).
    // (Not when it is already live for this open: a just-finished run getting its History key.)
    if (!kept || (live?.serial === serial && screen.state.runId === kept.runId)) return;
    const nowKeys = runKeys(parcel.geo.geometry, open?.house ?? null, config, lines);
    if (freshness(kept.keys, nowKeys).boundary) return; // its boundary changed since: the run no longer applies
    sessions.current.touch(openKey);
    setLive({ serial, keys: kept.keys });
    setEvalAsked(null);
    awaitingEval.current = false;
    askedHouse.current = null;
    awaitingHouse.current = false;
    awaitingRestore.current = true;
    screen.activate(kept.runId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per parcel opened
  }, [serial, openKey]);
  // The worker was lost (terminated in the background, crashed, restarted): every kept session went with it.
  // Each parcel falls back to the "Run again to restore…" note, with no error (owner, 17e).
  useEffect(() => {
    sessions.current = new SessionLru<RunKeys>();
    indexed.current = null;
    awaitingRestore.current = false;
  }, [st.generation]);
  // A parcel removed from History: its session goes too.
  const builtKeys = ctl.state.store.built.map((b) => b.key).join("|");
  useEffect(() => {
    const keys = new Set(builtKeys.split("|"));
    for (const k of sessions.current.parcels())
      if (!keys.has(k)) {
        const gone = sessions.current.remove(k);
        if (gone) screen.release(gone.runId);
      }
  }, [builtKeys, screen]);

  const autoRun = live?.serial === serial && !!live.auto;
  const wantsRescreen = rescreen === serial && !autoRun;

  const run = (auto = false) => {
    if (!parcel || !now) return;
    // Offline (17c): say so rather than start a run whose every request would fail.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      hint(OFFLINE_SCREEN_TEXT);
      setTimeout(() => hint((h) => (h === OFFLINE_SCREEN_TEXT ? "" : h)), 4000);
      return;
    }
    setLive({ serial, keys: now, ...(auto ? { auto: true as const } : {}) });
    askedHouse.current = null;
    awaitingHouse.current = false;
    setShowParams(false);
    setEvalAsked(null);
    awaitingEval.current = false;
    // A boundary that bridges a strip between parts screens only the parts' own land (follow-up 29).
    const d = ctl.derived;
    const ownLand = d?.ok && d.bridgeAcres > 0 ? d.own.geometry : null;
    screen.run({
      polygon: parcel.geo.geometry,
      config,
      ...(ownLand ? { ownLand } : {}),
      ...(house ? { house } : {}),
      ...(lines.length ? { lines } : {}),
    });
  };

  // Re-screen on open (owner, #101, 2026-10-11): only the parcel being opened, once per open, and only online;
  // offline it waits, and says so, and runs when the browser is back online with the parcel still open. A failed
  // run says why, with Run again; it isn't retried by itself.
  const canRun = !!now;
  useEffect(() => {
    if (!wantsRescreen || running || !canRun || !online || autoTried.current === serial) return;
    autoTried.current = serial;
    run(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `run` is new each render
  }, [wantsRescreen, running, canRun, online, serial]);

  // Re-evaluate at a pin (15b): only with this parcel's live session. The hint says what's happening, as the
  // prototype's setFocus did (L1279), until the answer arrives.
  const evaluateAt = (ll: LatLon, label: string) => {
    if (!sessionLive || screen.state.updating) return;
    awaitingEval.current = true;
    setEvalAsked({ serial, ll, label });
    const msg = `Evaluating ${label} — routing the driveway…`;
    evalHint.current = msg;
    hint(msg);
    screen.evaluateAt(ll, label);
  };
  // The live result is an unsaved re-evaluation when its evaluation point is the one asked for and differs
  // from the kept screen's own. Re-evaluating at the run's own point (its site, or the house) ends it, as does
  // a house re-assessment (it moves the point to the house).
  const liveFocus = screen.state.result?.focus?.ll;
  const keptFocus = shown?.result.focus?.ll ?? shown?.result.point?.ll;
  const same = (a: LatLon | undefined, b: LatLon | undefined) => !!a && !!b && a[0] === b[0] && a[1] === b[1];
  const evaluated =
    sessionLive &&
    !screen.state.updating &&
    !!evalAsked &&
    evalAsked.serial === serial &&
    same(liveFocus, evalAsked.ll) &&
    !same(liveFocus, keptFocus)
      ? (screen.state.result as ScreenResult)
      : null;

  // Copy summary (proto L1565): the shown result's plain-text summary, with the unsaved-evaluation note when
  // there is one; the map's hint says so for 1.5 s.
  const copySummary = () => {
    if (!shown) return;
    const say = (msg: string) => {
      hint(msg);
      setTimeout(() => hint((h) => (h === msg ? "" : h)), 1500);
    };
    const text = evaluated
      ? `${summaryText(evaluated)}\n${evaluatedNote(evalAsked!.label)}`
      : summaryText(shown.result);
    navigator.clipboard.writeText(text).then(
      () => say("Summary copied"),
      () => say("The browser didn't allow copying"),
    );
  };

  const runningHere = running && live?.serial === serial;
  const display: PartialScreenResult | null = runningHere
    ? screen.state.result
    : (evaluated ?? shown?.result ?? null);
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
    run: () => run(),
    cancel: screen.cancel,
    steps: screen.state.steps,
    showSteps: live?.serial === serial && status !== "idle" && !screen.state.restored,
    error: live?.serial === serial ? screen.state.error : null,
    /** The re-screen on open is waiting for the network (owner, #101). */
    rescreenOffline: wantsRescreen && !online,
    /** This open's result came from a re-screen on open. */
    rescreened: rescreened === serial,
    /** The re-screen on open failed: its error comes with a Run again button. */
    rescreenFailed: autoRun && !!screen.state.error,
    display,
    point,
    /** The worker's session for this parcel's shown run (surfaces, horizon…), or null after a reload. */
    view: sessionLive ? screen.state.view : null,
    /** Where the live session was last evaluated (the fan starts there), and the run's canopy allowance. */
    viewFrom: sessionLive && screen.state.result ? (evaluationPoint(screen.state.result)?.ll ?? null) : null,
    canopyDeg: shown?.result.params.canopyDeg ?? null,
    evaluateAt,
    /** The unsaved re-evaluation shown, if any (its label for the "not saved" note, 15b). */
    evaluated: evaluated ? { label: evalAsked!.label } : null,
    person,
    /** The Settings' earthwork rates: the card's dig cost (VR3b). */
    dw: config.dw,
    setPerson: (p: Person) => {
      setPersonState(p);
      setPref("ps.person", p);
    },
  };
}

/** The sections an evaluation point moves (proto setFocus: sun, sky, driveway), which carry the unsaved note. */
const EVALUATED_SECTIONS = new Set(["december-sun", "dark-skies", "driveway"]);

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
  // The card's grade and verdict for the kept run (owner, #110), in whoever's grade is on.
  const card = !s.runningHere && !s.stale && s.shown ? reportCard(s.shown.result, s.person) : null;
  const label = s.running ? "Running…" : s.shown ? "Run again" : "Screen it";
  const folded = desk && !desk.expanded && desk.fold && s.display;
  return (
    <>
      <span className="sh-parcel">
        <span className="sh-name">{name}</span>
        {d?.ok && <span className="sh-acres"> · {fmt(d.acres, 2)} ac</span>}
        {card && (
          <span className={`sh-card v-${card.verdict.toLowerCase()}`} title={card.reason}>
            <span className={`card-grade small g-${card.grade ?? "none"}`}>{card.grade ?? "–"}</span>
            <span className="sh-word">{card.verdict}</span>
          </span>
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
        {/* Deselect the parcel (17e); Esc does the same on desktop. A screened one stays in History. */}
        <button
          className="sh-x"
          aria-label="Close this parcel"
          title={desk ? "Close this parcel (Esc)" : "Close this parcel"}
          onClick={() => s.ctl.close()}
        >
          ×
        </button>
      </span>
      {folded && <VerdictLine s={s} />}
      {!s.display && <RescreenLine s={s} />}
    </>
  );
}

/**
 * With nothing to show (the parcel's last result gone, v3's clean break), the re-screen's state goes in the header,
 * which is always on screen: never a blank card (owner, #101 guard a).
 */
function RescreenLine({ s }: { s: ScreenIt }) {
  if (s.rescreenOffline)
    return <span className="sh-verdict sh-rescreen muted rescreen-note">{RESCREEN_OFFLINE}.</span>;
  if (s.rescreenFailed)
    return (
      <span className="sh-verdict sh-rescreen fatal">
        The screen stopped: {s.error}{" "}
        <button className="btn small" disabled={s.running} onClick={s.run}>
          Run again
        </button>
      </span>
    );
  return null;
}

/**
 * The folded card's second line: the report card's reason (owner, #110; the prototype's lead is in the Grade and
 * verdict panel), or why the results no longer fit.
 */
function VerdictLine({ s }: { s: ScreenIt }) {
  if (!s.display) return null;
  if (s.stale && !s.runningHere)
    return <span className="sh-verdict muted">These results are for an earlier boundary. Run again.</span>;
  if (s.runningHere) return <span className="sh-verdict muted">Screening…</span>;
  return <span className="sh-verdict">{reportCard(s.display, s.person).reason}</span>;
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
  // The open panel, for the parcel it was opened on: another parcel closes it.
  const [opened, setOpened] = useState<{ key: PanelKey; serial: number } | null>(null);
  const serial = s.ctl.state.serial;
  const panel = opened && opened.serial === serial ? opened.key : null;
  const closePanel = useCallback(() => setOpened(null), []);
  const now = s.runningHere ? STEPS.find(([id]) => s.steps[id]?.status === "run") : undefined;
  const running = now ? { step: now[0], message: s.steps[now[0]]!.message } : undefined;
  const notes = !s.runningHere && shown;
  if (!s.showSteps && !s.error && !notes && !display) return null;
  // The card is the first thing under the header (owner, #111): what's still running, failed or out of date stays
  // above it; a finished run's folded steps, Copy summary and the notes go below the card's rows, unchanged.
  const stepsDone =
    !s.runningHere && STEPS.every(([id]) => s.steps[id]?.status === "done" || s.steps[id]?.status === "skip");
  const below = !!display && !s.stale;
  const top =
    (s.showSteps && !(below && stepsDone)) ||
    !!s.error ||
    (notes && !below) ||
    (s.rescreenOffline && !!display);
  const footer = below && ((s.showSteps && stepsDone) || notes);
  return (
    <>
      {top && (
        <section className="block">
          {s.rescreenOffline && s.display && <p className="report-note rescreen-note">{RESCREEN_OFFLINE}.</p>}
          {s.showSteps && !(below && stepsDone) && <StepList steps={s.steps} running={s.runningHere} />}
          {s.error && (
            <p className="tiny text-steep">
              The screen stopped: {s.error}
              {s.rescreenFailed && s.display && (
                <>
                  {" "}
                  <button className="btn small" disabled={s.running} onClick={s.run}>
                    Run again
                  </button>
                </>
              )}
            </p>
          )}
          {notes && !below && (
            <Notices
              stale={s.stale}
              houseChanged={!!s.fresh?.house}
              sessionLive={s.sessionLive}
              settingsChanged={!!s.fresh?.settings}
              linesChanged={!!s.fresh?.lines}
              rescreened={s.rescreened}
              showParams={s.showParams}
              toggleParams={s.toggleParams}
              params={shown.result.params}
            />
          )}
        </section>
      )}
      {display && (
        <div className={s.stale && !s.runningHere ? "report stale" : "report"}>
          <ReportCard
            card={reportCard(display, s.person)}
            running={!!s.runningHere}
            setPerson={s.setPerson}
            onOpen={(key) => setOpened({ key, serial })}
          />
        </div>
      )}
      {footer && (
        <section className="block report-footer">
          {s.showSteps && stepsDone && <StepList steps={s.steps} running={s.runningHere} />}
          {notes && (
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
              linesChanged={!!s.fresh?.lines}
              rescreened={s.rescreened}
              showParams={s.showParams}
              toggleParams={s.toggleParams}
              params={shown.result.params}
            />
          )}
        </section>
      )}
      {display && panel && (
        <CardPanel
          panel={panel}
          card={reportCard(display, s.person)}
          result={display}
          point={point}
          running={running}
          noteFor={(slug) =>
            s.evaluated &&
            EVALUATED_SECTIONS.has(slug) && (
              <p className="report-note eval-note">{evaluatedNote(s.evaluated.label)}</p>
            )
          }
          dw={s.dw}
          onClose={closePanel}
        />
      )}
    </>
  );
}

/**
 * The run's steps (proto renderSteps, L991): a dot per step, with its message and the query link. A run that
 * finished with every step done folds to one line, "Screened ✓", which opens the list (owner, #110); a run in
 * progress, or one with a failed step, shows it all.
 */
function StepList({
  steps,
  running,
}: {
  steps: ReturnType<typeof useScreen>["state"]["steps"];
  running: boolean;
}) {
  // Debug mode: how long each step took, as the page saw it (A4b PR B: the owner's phone timings).
  const timed = debugOn();
  const [open, setOpen] = useState(false);
  const clean =
    !running && STEPS.every(([id]) => steps[id]?.status === "done" || steps[id]?.status === "skip");
  if (clean && !open)
    return (
      <button className="link-btn steps-folded" aria-expanded={false} onClick={() => setOpen(true)}>
        Screened ✓
      </button>
    );
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
              {timed && st?.ms !== undefined && (
                <span className="muted tiny step-ms"> · {(st.ms / 1000).toFixed(1)} s</span>
              )}
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
  /** The drawn lines changed since the run (follow-up 34). */
  linesChanged: boolean;
  /** Re-screened on open, its last result gone or from earlier rules (owner, #101). */
  rescreened: boolean;
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
      {p.rescreened && <p className="report-note">{RESCREENED}.</p>}
      {!p.sessionLive && !p.houseChanged && (
        <p className="tiny muted">Run again to restore the map overlays and horizon fan.</p>
      )}
      {p.linesChanged && (
        <p className="tiny muted">These results used earlier drawn lines. Run again to route with them.</p>
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
