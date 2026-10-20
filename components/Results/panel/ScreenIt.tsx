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
import { drawnInput, linesOf } from "@/lib/client/parcelStore";
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
import { evaluatedNote, RUN_AGAIN_TO_EVALUATE } from "@/lib/render/pins";
import type { LatLon } from "@/lib/geo/types";
import type { PartialScreenResult, ScreenResult, UserConfig } from "@/lib/screen/types";
import type { ExploreController, SetHint } from "@/components/Explore/useExploreController";
import { lineLayer } from "@/components/Explore/layers";
import { evaluationPoint } from "../blocks/types";
import { useRubricView } from "@/lib/client/useRubricView";
import { reportCard, VERDICT_WORD } from "@/lib/report/card";
import { answerReason } from "@/lib/report/answer";
import { lineNamesOf, type LineNames } from "@/lib/report/lines";
import { drawnOf, type Drawn } from "@/lib/report/marks";
import { listingAcresNote } from "@/lib/report/listing";
import { panelFromSearch, replacePanelInUrl } from "@/lib/client/panelUrl";
import { mapShowing, onMapShowing } from "@/lib/client/mapShowing";
import { gradeButton, logLine, runSeconds } from "@/lib/client/gradeButton";
import type { PanelKey } from "@/lib/report/cardPanels";
import { CardPanel } from "../card/CardPanel";
import {
  EARLIER_BOUNDARY,
  HOUSE_CHANGED,
  LET_THE_APP_CONSIDER_IT,
  LINES_CHANGED,
  ReportCard,
  type StaleBanner,
} from "../card/ReportCard";
import { Others } from "@/components/Household/Others";
import { AgentQuestions } from "../answer/AgentQuestions";
import { BestHomesite } from "../answer/BestHomesite";
import { FullReport } from "../answer/FullReport";
import { useSeeTakes } from "@/lib/client/householdDoc";
import { OFFLINE_SCREEN_TEXT } from "@/lib/client/pwa";
import { Star } from "@/components/Favorites/Star";
import { countyOf, isFavorite, starName } from "@/lib/client/favorites";
import { memberName } from "@/lib/client/household";
import { currentProfileId } from "@/lib/client/profiles";

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
  // Whose rubric grades the card (VR5; owner #110: on the sheet; step 1: the profile's, remembered per profile).
  const { rubrics, rubric, setRubric } = useRubricView();
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
  // Which open's kept screen has been read back, found or not (the URL's panel waits for it: #121 review).
  const [read, setRead] = useState<{ serial: number; id: string } | null>(null);
  useEffect(() => {
    if (!latestId) return;
    let gone = false;
    void readScreen(latestId).then((r) => {
      if (gone) return;
      setRead({ serial, id: latestId });
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
    if (status !== "done" || !live || !result || kept.current === result || result.cancelled === undefined)
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
  const keptRead = !latestId || (read?.serial === serial && read.id === latestId);

  // The report panel open, for the parcel it was opened on: another parcel closes it. Kept here, not in the body,
  // which isn't drawn while the desktop panel is folded. It starts as the panel the URL names (?panel=sky; owner,
  // #121 review), for the parcel open when the explorer mounts, and shows once that parcel's report is up. A name that
  // isn't a panel is never read (panelFromSearch).
  const [opened, setOpened] = useState<{ key: PanelKey; serial: number; fromUrl?: true } | null>(() => {
    const key = panelFromSearch(window.location.search);
    return key ? { key, serial, fromUrl: true } : null;
  });
  // The URL's panel for a parcel with no screen: dropped, once its kept screen has been looked for.
  if (opened?.fromUrl && opened.serial === serial && keptRead && !display) setOpened(null);
  const panel = opened && opened.serial === serial ? opened.key : null;
  // Stable: CardPanel's focus handling runs again when its onClose changes.
  const openPanel = useCallback((key: PanelKey) => setOpened({ key, serial }), [serial]);
  const closePanel = useCallback(() => setOpened(null), []);
  // Reopened from the URL (Back from the rulebook): on phones, the sheet comes up to show it.
  const reopened = !!opened?.fromUrl && !!panel && !!display;
  useEffect(() => {
    if (reopened) latest.current.onFinished(); // ExploreShell's onFinished is the sheet's raise
  }, [reopened]);
  // The open panel goes into the URL, replacing its entry, except while the URL's own waits for the report. Only while
  // the map is showing (step 4b: it stays mounted behind the other tabs, whose URLs aren't its), and again on return.
  const waiting = !!opened?.fromUrl && !!panel && !display;
  const [showing, setShowing] = useState(mapShowing);
  useEffect(() => onMapShowing(setShowing), []);
  useEffect(() => {
    if (!waiting && showing) replacePanelInUrl(display ? panel : null);
  }, [panel, display, waiting, showing]);

  // The one action and the folded log (step 4c, plan §2): the button only with a reason after a run.
  const error = live?.serial === serial ? screen.state.error : null;
  const failedSteps = shown?.result.failed.length ?? 0;
  const grade = gradeButton({
    running: runningHere,
    graded: !!shown,
    fresh,
    sessionLive,
    failed: failedSteps,
    stopped: !!error && !runningHere,
  });

  // Step 7: the card for what's shown, made once per change: the panel, the header and the pins read it.
  const drivewayLine = open?.drivewayLine;
  const card = useMemo(
    () =>
      display ? reportCard(display, rubric, open ? drawnOf(markup ?? [], drivewayLine) : undefined) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the open parcel's markup and line are what matter
    [display, rubric, markup, drivewayLine],
  );
  // A site tapped in the panel (step 7 plan §1.3): evaluated with the live session, as its pin is; without one, the
  // pins' own words say why not.
  const pickSite = (ll: LatLon, label: string) => {
    if (sessionLive) return evaluateAt(ll, label);
    hint(RUN_AGAIN_TO_EVALUATE);
    setTimeout(() => hint((h) => (h === RUN_AGAIN_TO_EVALUATE ? "" : h)), 3000);
  };

  return {
    ctl,
    parcel,
    running,
    runningHere,
    /** The card for what's shown (step 7): this person's, at their best homesite. */
    card,
    pickSite,
    /** The grade button's state (lib/client/gradeButton.ts): null when there's no reason to run again. */
    grade,
    /** The finished run's folded log line: "Graded in 66 s", with the failed count unless the button has it. */
    logLine: logLine(runSeconds(Object.values(screen.state.steps)), failedSteps, grade),
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
    error,
    /** The re-screen on open is waiting for the network (owner, #101). */
    rescreenOffline: wantsRescreen && !online,
    /** This open's result came from a re-screen on open. */
    rescreened: rescreened === serial,
    /** The re-screen on open failed: its error, with the grade button's Try again. */
    rescreenFailed: autoRun && !!screen.state.error,
    display,
    point,
    /** The card's open panel (VR5), shown with the report; it's in the URL (#121 review). */
    panel: display ? panel : null,
    openPanel,
    closePanel,
    /** The worker's session for this parcel's shown run (surfaces, horizon…), or null after a reload. */
    view: sessionLive ? screen.state.view : null,
    /** Where the live session was last evaluated (the fan starts there), and the run's canopy allowance. */
    viewFrom: sessionLive && screen.state.result ? (evaluationPoint(screen.state.result)?.ll ?? null) : null,
    canopyDeg: shown?.result.params.canopyDeg ?? null,
    evaluateAt,
    /** The unsaved re-evaluation shown, if any (its label for the "not saved" note, 15b). */
    evaluated: evaluated ? { label: evalAsked!.label } : null,
    rubric,
    rubrics,
    /** The Settings' earthwork rates: the card's dig cost (VR3b). */
    dw: config.dw,
    /** The Settings' driveway veto: the Easement panel's comparison of routes (WF5). */
    vetoPct: config.roadVetoGradePct,
    setRubric,
  };
}

/** The sections an evaluation point moves (proto setFocus: sun, sky, driveway), which carry the unsaved note. */
const EVALUATED_SECTIONS = new Set(["december-sun", "dark-skies", "driveway"]);

/**
 * The open parcel's names for its drawn lines (owner, 2026-10-14): the report reads a line by its current name, or as
 * since deleted, looked up by the id its result keeps.
 */
const namesOf = (s: ScreenIt): LineNames | undefined => {
  const open = s.ctl.state.store.open;
  return open ? lineNamesOf(open.markup) : undefined;
};

/** What the open parcel holds for its card: those names, and its markers (WF4). */
const drawnFor = (s: ScreenIt): Drawn | undefined => {
  const open = s.ctl.state.store.open;
  return open ? drawnOf(open.markup, open.drivewayLine) : undefined;
};

/**
 * The panel's header: the parcel's name on up to two lines, then its acres and its grade (step 4c, plan §2). The run
 * button isn't here any more: it's GradeAction, in the toolbar on a desktop and under this header on a phone.
 */
export function ScreenHeader({ s, desk = false }: { s: ScreenIt; desk?: boolean }) {
  const d = s.ctl.derived;
  if (!s.ctl.state.store.open)
    // The phone's sheet (hidden until a parcel is open); the desktop's docked panel shows only Search then (step 4c).
    return <span className="sh-empty">Tap a parcel to screen it</span>;
  const name = s.ctl.layers?.name ?? "Parcel";
  // The card's grade and verdict for the kept run (owner, #110), in whoever's grade is on.
  const card =
    !s.runningHere && !s.stale && s.shown ? reportCard(s.shown.result, s.rubric, drawnFor(s)) : null;
  return (
    <>
      <span className="sh-parcel">
        <span className="sh-name" title={name}>
          {name}
        </span>
        <span className="sh-sub">
          {d?.ok && <span className="sh-acres">{fmt(d.acres, 2)} ac</span>}
          {card && (
            <span className={`sh-card v-${card.verdict.toLowerCase()}`} title={card.reason}>
              <span className={`card-grade small g-${card.grade ?? "none"}`}>{card.grade ?? "–"}</span>
              <span className="sh-word">{VERDICT_WORD[card.verdict]}</span>
            </span>
          )}
        </span>
        {/* Step 7 (plan §1.1): the answer's reason, in the phone's peek (on two lines at most; CSS hides it elsewhere). */}
        {card && s.shown && <span className="sh-reason">{answerReason(card, s.shown.result)}</span>}
      </span>
      <span className="sh-actions">
        <PanelStar s={s} />
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
      {!s.display && <RescreenLine s={s} />}
    </>
  );
}

/**
 * The open parcel's star (step 8, plan §2 and §5), beside the grade: starring names it (prefilled from its own name, its
 * listing's address, or its acres, road and county) and builds a plain parcel; unstarring asks first.
 */
function PanelStar({ s }: { s: ScreenIt }) {
  const open = s.ctl.state.store.open!;
  const serial = s.ctl.state.serial;
  const d = s.ctl.derived;
  const prefill = () =>
    starName(open, {
      acres: d?.ok ? d.acres : null,
      road: s.shown?.result.driveFrom?.road ?? null,
      county: countyOf(open),
    });
  return (
    <Star
      className="sh-star"
      on={isFavorite(open)}
      prefill={prefill}
      star={(name) => s.ctl.star(name, serial)}
      unstar={() => s.ctl.unstar(serial)}
      adder={open.addedBy && open.addedBy !== currentProfileId() ? memberName(open.addedBy) : null}
    />
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
    return <span className="sh-verdict sh-rescreen fatal">The screen stopped: {s.error}</span>;
  return null;
}

/**
 * The docked panel collapsed (desktop; step 4c, plan §1): a slim tab at the top left with the parcel's grade (when it
 * has one) and its name; a click reopens the panel.
 */
export function DockTab({ s, reopen }: { s: ScreenIt; reopen(): void }) {
  const name = s.ctl.layers?.name ?? "Parcel";
  const card =
    !s.runningHere && !s.stale && s.shown ? reportCard(s.shown.result, s.rubric, drawnFor(s)) : null;
  return (
    <button
      className="dock-tab"
      aria-expanded={false}
      aria-label={`Show the panel: ${name}${card ? `, grade ${card.grade ?? "none"}` : ""}`}
      title={name}
      onClick={reopen}
    >
      {card && <span className={`card-grade small g-${card.grade ?? "none"}`}>{card.grade ?? "–"}</span>}
      <span className="dock-tab-name">{name}</span>
      <span aria-hidden="true">›</span>
    </button>
  );
}

/** The panel's body: the run's steps, whether the results still fit, and the report. */
export function ScreenBody({ s }: { s: ScreenIt }) {
  const { display, point, shown, panel, openPanel, closePanel } = s;
  const now = s.runningHere ? STEPS.find(([id]) => s.steps[id]?.status === "run") : undefined;
  const running = now ? { step: now[0], message: s.steps[now[0]]!.message } : undefined;
  const notes = !s.runningHere && shown;
  // Full report ▸ (step 7): open or not, and a section to bring into view as it opens ("More to check that no dataset covers").
  const [full, setFull] = useState<{ open: boolean; scrollTo: string | null }>({
    open: false,
    scrollTo: null,
  });
  // Step 6b: a kept parcel open here with its card, so its takes are seen.
  useSeeTakes(display ? (s.ctl.state.store.open?.key ?? null) : null);
  if (!s.showSteps && !s.error && !notes && !display) return null;
  // The card comes right under the header (owner, #111), with the run's log above it: the live list while it runs,
  // one line once it's done (step 4c). What failed or is out of date stays above the card too; Copy summary and the
  // notes go below its rows.
  // One banner for results that no longer fit (polish #1), in the card under its answer: the grade button's reason.
  const why = s.grade?.kind === "again" ? s.grade.reason : null;
  const banner: StaleBanner | null =
    why === "boundary"
      ? { text: EARLIER_BOUNDARY, actions: [{ label: "Grade again", onClick: s.run }] }
      : why === "house"
        ? { text: HOUSE_CHANGED, actions: [{ label: "Grade again", onClick: s.run }] }
        : why === "lines"
          ? { text: LINES_CHANGED, actions: [{ label: LET_THE_APP_CONSIDER_IT, onClick: s.run }] }
          : null;
  const below = !!display;
  const top = s.showSteps || !!s.error || (notes && !below) || (s.rescreenOffline && !!display);
  const footer = below && notes;
  return (
    <>
      {top && (
        <section className="block">
          {s.rescreenOffline && s.display && <p className="report-note rescreen-note">{RESCREEN_OFFLINE}.</p>}
          {s.showSteps && <StepList steps={s.steps} running={s.runningHere} line={s.logLine} />}
          {s.error && <p className="tiny text-steep">The screen stopped: {s.error}</p>}
          {notes && !below && (
            <Notices
              bannered={!!banner}
              houseChanged={!!s.fresh?.house}
              sessionLive={s.sessionLive}
              settingsChanged={!!s.fresh?.settings}
              rescreened={s.rescreened}
              showParams={s.showParams}
              toggleParams={s.toggleParams}
              params={shown.result.params}
              grade={s.run}
              grading={s.running}
            />
          )}
        </section>
      )}
      {display && s.card && (
        <div className={s.stale && !s.runningHere ? "report stale" : "report"}>
          <ReportCard
            card={s.card}
            result={display}
            running={!!s.runningHere}
            between={
              <BestHomesite
                card={s.card}
                result={display}
                running={!!s.runningHere}
                showing={s.evaluated?.label ?? null}
                onOpen={openPanel}
                pick={(p) => s.pickSite(p.ll, p.label)}
                back={() => {
                  const best = s.card!.sites[0];
                  const h = display.house;
                  if (h && !("outside" in h)) s.pickSite(h.ll, "the house");
                  else if (best) s.pickSite(best.ll, `site #${best.rank}`);
                }}
                show={(ll) => {
                  const map = s.ctl.map;
                  map?.flyTo({ center: [ll[1], ll[0]], zoom: Math.max(map.getZoom(), 16) });
                }}
              />
            }
            note={listingAcresNote(
              s.ctl.state.store.open?.listingAcres ?? null,
              s.ctl.derived?.ok ? s.ctl.derived.acres : null,
            )}
            rubrics={s.rubrics}
            setRubric={s.setRubric}
            onOpen={openPanel}
            stale={banner}
          />
          {/* Step 6: how each other member would rate it, from their own priorities. */}
          <Others result={display} drawn={drawnFor(s)} parcel={s.ctl.state.store.open?.key ?? null} />
          {/* Step 7: what to ask the agent, once the run is done; then the whole report, behind one control. */}
          {!s.runningHere && (
            <AgentQuestions
              card={s.card}
              name={s.ctl.layers?.name ?? "this parcel"}
              showChecklist={() => setFull({ open: true, scrollTo: "still-unknown" })}
            />
          )}
          <FullReport
            result={display}
            point={point}
            running={running}
            lineNames={namesOf(s)}
            drivewayLine={s.ctl.state.store.open?.drivewayLine ?? null}
            noteFor={(slug) =>
              s.evaluated &&
              EVALUATED_SECTIONS.has(slug) && (
                <p className="report-note eval-note">{evaluatedNote(s.evaluated.label)}</p>
              )
            }
            open={full.open}
            setOpen={(open) => setFull({ open, scrollTo: null })}
            scrollTo={full.scrollTo}
          />
        </div>
      )}
      {footer && (
        <section className="block report-footer">
          {notes && (
            <div className="report-actions">
              <button className="btn secondary small" onClick={s.copySummary}>
                Copy summary
              </button>
            </div>
          )}
          {notes && (
            <Notices
              bannered={!!banner}
              houseChanged={!!s.fresh?.house}
              sessionLive={s.sessionLive}
              settingsChanged={!!s.fresh?.settings}
              rescreened={s.rescreened}
              showParams={s.showParams}
              toggleParams={s.toggleParams}
              params={shown.result.params}
              grade={s.run}
              grading={s.running}
            />
          )}
        </section>
      )}
      {display && panel && (
        <CardPanel
          panel={panel}
          card={reportCard(display, s.rubric, drawnFor(s))}
          result={display}
          lineNames={namesOf(s)}
          point={point}
          running={running}
          noteFor={(slug) =>
            s.evaluated &&
            EVALUATED_SECTIONS.has(slug) && (
              <p className="report-note eval-note">{evaluatedNote(s.evaluated.label)}</p>
            )
          }
          dw={s.dw}
          vetoPct={s.vetoPct}
          lines={
            s.ctl.state.store.open
              ? {
                  markup: linesOf(s.ctl.state.store.open.markup),
                  onEdit: (id) => s.ctl.selectLayer(lineLayer(id)),
                  onDelete: (id) => s.ctl.deleteMarkup(id, s.ctl.state.serial),
                  choose: (id) => s.ctl.setDrivewayLine(id, s.ctl.state.serial),
                }
              : undefined
          }
          onClose={closePanel}
        />
      )}
    </>
  );
}

/**
 * The run's steps (proto renderSteps, L991): a dot per step, with its message and the query link. While a run is in
 * progress it shows them all; once it's done it folds to one line, "Graded in 66 s ▸" (step 4c; it was "Screened ✓",
 * and only for a run with every step done), which opens the list.
 */
function StepList({
  steps,
  running,
  line,
}: {
  steps: ReturnType<typeof useScreen>["state"]["steps"];
  running: boolean;
  /** The folded line's words (lib/client/gradeButton.ts logLine). */
  line: string;
}) {
  // Debug mode: how long each step took, as the page saw it (A4b PR B: the owner's phone timings).
  const timed = debugOn();
  const [open, setOpen] = useState(false);
  if (!running && !open)
    return (
      <button
        className="steps-folded"
        aria-expanded={false}
        title="Show each step, and what didn't load"
        onClick={() => setOpen(true)}
      >
        <span>{line}</span>
        {/* Polish: the ▸ says what it holds. */}
        <span className="steps-more">Steps ▸</span>
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
  /** The card's banner says the results no longer fit (the boundary, the house or the lines). */
  bannered: boolean;
  houseChanged: boolean;
  sessionLive: boolean;
  settingsChanged: boolean;
  /** Re-screened on open, its last result gone or from earlier rules (owner, #101). */
  rescreened: boolean;
  showParams: boolean;
  toggleParams(): void;
  params: ScreenResult["params"];
  /** Runs it again: the overlays note's link. */
  grade(): void;
  grading: boolean;
}) {
  return (
    <>
      {/* With a live session a changed house is being re-assessed; without one, the card's banner says so. */}
      {p.houseChanged && p.sessionLive && <p className="tiny muted">Re-assessing the house…</p>}
      {p.rescreened && <p className="report-note">{RESCREENED}.</p>}
      {!p.sessionLive && !p.houseChanged && !p.bannered && (
        // No toolbar button for this (owner, 4c Q5): the note's own words run it.
        <p className="tiny muted">
          <button className="link-btn grade-again-link" disabled={p.grading} onClick={p.grade}>
            Grade again
          </button>{" "}
          to restore the map overlays and horizon fan.
        </p>
      )}
      {p.settingsChanged && (
        <div className="tiny muted">
          These results used earlier settings.{" "}
          <button className="btn secondary small" aria-expanded={p.showParams} onClick={p.toggleParams}>
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
