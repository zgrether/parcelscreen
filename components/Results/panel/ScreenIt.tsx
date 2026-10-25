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
import { drawnInput, linesOf, type WorkingParcel } from "@/lib/client/parcelStore";
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
import { reportCard } from "@/lib/report/card";
import { answerReason, verdictParts } from "@/lib/report/answer";
import { lineNamesOf, type LineNames } from "@/lib/report/lines";
import { drawnOf, type Drawn } from "@/lib/report/marks";
import { currentCostSettings, useCostSettings } from "@/lib/client/costRates";
import { listingAcresNote } from "@/lib/report/listing";
import { panelFromSearch, replacePanelInUrl } from "@/lib/client/panelUrl";
import { mapShowing, onMapShowing } from "@/lib/client/mapShowing";
import { failedCount, gradeButton, logLine, runSeconds } from "@/lib/client/gradeButton";
import type { PanelKey } from "@/lib/report/cardPanels";
import { CardPanel } from "../card/CardPanel";
import {
  EARLIER_BOUNDARY,
  HOUSE_CHANGED,
  LINES_CHANGED,
  ReportCard,
  type StaleBanner,
} from "../card/ReportCard";
import { Others } from "@/components/Household/Others";
import { AgentQuestions } from "../answer/AgentQuestions";
import { BestHomesite } from "../answer/BestHomesite";
import { FullReport } from "../answer/FullReport";
import {
  adjustFor,
  adjustParcel,
  householdDoc,
  removeAdjust,
  restoreAdjust,
  useHousehold,
  useSeeTakes,
} from "@/lib/client/householdDoc";
import { adjustPropsFor } from "@/components/Results/card/AdjustSection";
import { gradedSite } from "@/lib/report/adjust";
import { RaiseSection } from "@/components/Results/card/RaiseSection";
import { getPref } from "@/lib/client/prefs";
import { MINE } from "@/lib/rubric/types";
import { NEIGHBOUR_WORDS, raiseSuggestions, triedWords, type RaiseAction } from "@/lib/report/raise";
import type { TryProps } from "@/components/Results/card/TryIt";
import { OFFLINE_SCREEN_TEXT } from "@/lib/client/pwa";
import { placeLine } from "@/lib/client/favorites";
import { currentProfileId } from "@/lib/client/profiles";
import { isPreview, openSample, sampleOf } from "@/lib/client/samples";
import { SAMPLE_WORDS } from "@/lib/areas/words";
import { landUses } from "@/lib/uses";
import { tallyOf, usesInputOf } from "@/lib/uses/input";
import { USE_WORDS } from "@/lib/uses/words";

/** The run the worker's session holds: which parcel it was for (state.serial) and what it was run on. */
interface LiveRun {
  serial: number;
  keys: RunKeys;
  /** The re-screen on open (owner, #101), not the user's own run. */
  auto?: true;
}

export type ScreenIt = ReturnType<typeof useScreenIt>;

/** A drawn line tried as the driveway (step 12, plan §2.2): running, held for Use it or Discard, or failed. */
export interface Tried {
  line: string;
  phase: "trying" | "tried" | "failed";
  /** From the parcel's session (WF6a's reroute), not a whole new run. */
  quick: boolean;
  result?: ScreenResult;
  error?: string;
}

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
  // Step 12 (plan §2.2): Try it on a drawn line as the driveway. Its result is held here until Use it or Discard.
  const awaitingTry = useRef<"try" | "discard" | null>(null);
  const [tried, setTried] = useState<Tried | null>(null);
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
    // Step 12's Try it: its result stays a suggestion until Use it; Discard's reroute back is just put away.
    if (awaitingTry.current) {
      const what = awaitingTry.current;
      awaitingTry.current = null;
      if (what === "try") setTried((t) => (t ? { ...t, phase: "tried", result: result as ScreenResult } : t));
      return;
    }
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

  // Try it (step 12): from this parcel's session when there is one (WF6a's reroute), else a run with the choice.
  const tryLine = (line: string) => {
    if (tried?.phase === "trying" || screen.state.updating || running) return;
    awaitingTry.current = "try";
    setTried({ line, phase: "trying", quick: sessionLive });
    if (sessionLive) screen.reroute(lines, line);
    else run(false, line);
  };
  // Use it: the tried screen becomes the parcel's newest (screens are never changed, so it's a new one), and its line
  // the chosen driveway.
  const useTried = () => {
    if (!tried?.result || !live) return;
    const record: ScreenRecord = {
      id: crypto.randomUUID(),
      keys: live.keys,
      result: tried.result,
      engine: ENGINE_VERSION,
    };
    void addScreen(record).then(() => setStored({ serial: live.serial, record }));
    latest.current.ctl.screened(record.id, live.serial);
    ctl.setDrivewayLine(tried.line, serial);
    setTried(null);
  };
  // Discard: the session goes back to the parcel's own choice; the shown screen never changed.
  const discardTried = () => {
    if (sessionLive && !screen.state.updating) {
      awaitingTry.current = "discard";
      screen.reroute(lines, open?.drivewayLine ?? null);
    }
    setTried(null);
  };
  // A failed try says why; the parcel is as it was.
  const tryError = screen.state.error;
  useEffect(() => {
    if (!tryError || !awaitingTry.current) return;
    awaitingTry.current = null;
    setTried((t) => (t ? { ...t, phase: "failed", error: tryError } : t));
  }, [tryError]);

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
  // A parcel removed from Recent: its session goes too.
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

  const run = (auto = false, tryLine?: string) => {
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
      // Step 12 (plan §2.2): drives timed from the chosen route (or the one being tried), as WF6 meant.
      ...((tryLine ?? open?.drivewayLine) ? { drivewayLine: tryLine ?? open!.drivewayLine! } : {}),
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

  // Step 12 (plan §2.4): "Grade the combination" made a new parcel; it's graded as it opens, once.
  const gradeOnOpen = ctl.state.gradeOnOpen;
  useEffect(() => {
    if (gradeOnOpen !== serial || running || !canRun) return;
    ctl.gradedOnOpen();
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `run` is new each render
  }, [gradeOnOpen, serial, running, canRun]);

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
  // Step 12: a suggestion opens its factor's panel with Adjust for this parcel's choice made and its reason prefilled.
  const [adjustIntent, setAdjustIntent] = useState<{
    factor: PanelKey;
    choice: "pass" | "setAside";
    reason: string;
  } | null>(null);
  const openAdjust = useCallback(
    (factor: PanelKey, choice: "pass" | "setAside", reason: string) => {
      setAdjustIntent({ factor, choice, reason });
      setOpened({ key: factor, serial });
    },
    [serial],
  );
  const closePanel = useCallback(() => {
    setOpened(null);
    setAdjustIntent(null);
  }, []);
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
  const failedSteps = shown ? failedCount(shown.result.failed) : 0;
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
  // Step 10: the cost to enjoy reads the asking price and the rates in use (Settings → Costs), live.
  const askingPrice = open?.askingPrice ?? null;
  const costs = useCostSettings();
  // Step 12: the person's adjustments on this parcel, live.
  const household = useHousehold();
  const card = useMemo(
    () =>
      display
        ? reportCard(
            display,
            rubric,
            open
              ? drawnOf(markup ?? [], drivewayLine, { askingPrice, ...costs }, adjustFor(open.key, household))
              : undefined,
          )
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the open parcel's markup, line, price and adjustments are what matter
    [display, rubric, markup, drivewayLine, askingPrice, costs, household],
  );
  // Step 14: what the land can do, at the card's site, once the run is done (Uses and Grade's shortcut line read it).
  const deedRestrictions = open?.deedRestrictions ?? "";
  const hoa = open?.hoa ?? "unknown";
  const listingAcres = open?.listingAcres ?? null;
  const fromOriginal = open?.fromOriginal;
  const uses = useMemo(
    () =>
      display && card && !runningHere
        ? landUses(
            usesInputOf(display, card, drawnOf(markup ?? [], drivewayLine, { askingPrice, ...costs }), {
              markup: markup ?? [],
              deedRestrictions,
              hoa,
              listingAcres,
              ...(fromOriginal ? { fromOriginal } : {}),
            }),
          )
        : null,
    [
      display,
      card,
      runningHere,
      markup,
      drivewayLine,
      askingPrice,
      costs,
      deedRestrictions,
      hoa,
      listingAcres,
      fromOriginal,
    ],
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
    /** What you can do here (step 14), at the card's site; null before a grade and while one runs. */
    uses,
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
    openAdjust,
    adjustIntent,
    tried,
    /** The session is busy (a reroute, a house move): Try it waits for it. */
    updating: screen.state.updating,
    tryLine,
    useTried,
    discardTried,
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
  return open
    ? drawnOf(
        open.markup,
        open.drivewayLine,
        { askingPrice: open.askingPrice, ...currentCostSettings() },
        adjustFor(open.key),
      )
    : undefined;
};

/**
 * The panel's header: the parcel's name on up to two lines, then its acres and its grade (step 4c, plan §2). The run
 * button isn't here any more: it's GradeAction, in the toolbar on a desktop and under this header on a phone.
 */
/** "Sample parcel", and the area's other sample (step 13). */
function SampleTag({ open }: { open: WorkingParcel | null }) {
  const at = sampleOf(open);
  if (!at) return null;
  return (
    <>
      <span className="sh-sample">{SAMPLE_WORDS.tag}</span>
      <button
        type="button"
        className="link-btn sh-other-sample"
        onClick={() => void openSample(at.area, at.n === 1 ? 2 : 1).catch(() => undefined)}
      >
        {SAMPLE_WORDS.other}
      </button>
    </>
  );
}

export function ScreenHeader({ s, desk = false }: { s: ScreenIt; desk?: boolean }) {
  const d = s.ctl.derived;
  if (!s.ctl.state.store.open)
    // The phone's sheet (hidden until a parcel is open); the desktop's docked panel shows only Search then (step 4c).
    return <span className="sh-empty">Tap a parcel to grade it</span>;
  const name = s.ctl.layers?.name ?? "Parcel";
  // The card's grade and verdict for the kept run (owner, #110), in whoever's grade is on.
  const card =
    !s.runningHere && !s.stale && s.shown ? reportCard(s.shown.result, s.rubric, drawnFor(s)) : null;
  const place = placeLine(s.ctl.state.store.open);
  const answer = card ? verdictParts(card) : null;
  return (
    <>
      <span className="sh-parcel">
        <span className="sh-name" title={name}>
          {name}
        </span>
        <span className="sh-sub">
          {/* Step 13: one of the catalog's sample parcels, until it's on the list. */}
          {isPreview(s.ctl.state.store.open) && <SampleTag open={s.ctl.state.store.open} />}
          {/* P-2: the acres, then the county and the tax map number, the listing's way of naming it. */}
          {(d?.ok || place) && (
            <span className="sh-acres">
              {[d?.ok ? `${fmt(d.acres, 2)} ac` : null, place].filter(Boolean).join(" · ")}
            </span>
          )}
        </span>
        {/* J-4: the verdict first, the letter beside it, and a joining word when they part. */}
        {card && answer && (
          <span className={`sh-sub sh-card v-${card.verdict.toLowerCase()}`} title={card.reason}>
            <span className="sh-word">{answer.verdict}</span>
            <span className="card-letter">
              <span className={`card-grade small g-${card.grade ?? "none"}`}>{answer.grade}</span>
              {answer.join && <span className="sh-join">{answer.join}</span>}
            </span>
          </span>
        )}
        {/* Step 7 (plan §1.1): the answer's reason, in the phone's peek (on two lines at most; CSS hides it elsewhere). */}
        {card && s.shown && <span className="sh-reason">{answerReason(card, s.shown.result)}</span>}
      </span>
      {/* ★, Not for us, Ask and ⋯ are a row of their own under the header (HeaderActions, UX part 2 PR 3). */}
      <span className="sh-actions">
        {/* Close the parcel (17e; J-2: it never takes a parcel out of Recent); Esc does the same on desktop. */}
        <button
          className="sh-x"
          aria-label="Close this parcel"
          title={closeTitle(s.ctl.state.store.open, desk)}
          onClick={() => s.ctl.dismiss()}
        >
          ×
        </button>
      </span>
      {!s.display && <RescreenLine s={s} />}
    </>
  );
}

/** The ×'s tooltip (J-2: × only closes, as Esc does on a desktop). */
const closeTitle = (_open: WorkingParcel | null, desk: boolean): string =>
  `Close this parcel${desk ? " (Esc)" : ""}`;

/**
 * With nothing to show (the parcel's last result gone, v3's clean break), the re-screen's state goes in the header,
 * which is always on screen: never a blank card (owner, #101 guard a).
 */
function RescreenLine({ s }: { s: ScreenIt }) {
  if (s.rescreenOffline)
    return <span className="sh-verdict sh-rescreen muted rescreen-note">{RESCREEN_OFFLINE}.</span>;
  if (s.rescreenFailed)
    return <span className="sh-verdict sh-rescreen fatal">The grade stopped: {s.error}</span>;
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
  // Step 6b: a kept parcel open here with its card, so its takes are seen; only while the map is on show (UX part 2:
  // a list tap opens the parcel here, and it stays open behind Your list, where a take that arrives isn't seen yet).
  const [onMap, setOnMap] = useState(mapShowing);
  useEffect(() => onMapShowing(setOnMap), []);
  useSeeTakes(display && onMap ? (s.ctl.state.store.open?.key ?? null) : null);
  // Step 12: ways to raise this grade, for the person's own card once the run is done: from the card shown, as its grade is.
  const raise = useMemo(
    () =>
      display && s.card && !s.runningHere && s.card.rubric.id === MINE
        ? raiseSuggestions(display, s.card, drawnFor(s), {
            refusesAltSeptic: !!getPref("ps.interview")?.answers.walkAway?.chips?.includes("altSeptic"),
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the card carries the drawn lines, adjustments and rubric
    [display, s.card, s.runningHere],
  );
  // Step 12's Try it, for the suggestion and the Easement panel alike: the tried screen's card against the shown one.
  const tried = s.tried;
  const triedCard = useMemo(
    () =>
      tried?.result && s.card
        ? reportCard(tried.result, s.card.rubric, {
            ...(drawnFor(s) ?? { names: new Map(), marks: [] }),
            driveway: tried.line,
          } as Drawn)
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the try's result and the card shown are what matter
    [tried?.result, s.card],
  );
  const tryIt: TryProps = {
    tried,
    quick: s.sessionLive,
    busy: s.updating || !!s.runningHere,
    words: triedCard && s.card ? triedWords(s.card, triedCard) : null,
    tryLine: s.tryLine,
    useIt: s.useTried,
    discard: s.discardTried,
  };
  const act = (a: RaiseAction) => {
    if (a.kind === "house") s.ctl.setHouse(a.ll);
    else if (a.kind === "adjust") s.openAdjust(a.factor, a.choice, a.reason);
  };
  if (!s.showSteps && !s.error && !notes && !display) return null;
  // The card comes right under the header (owner, #111), with the run's log above it: the live list while it runs,
  // one line once it's done (step 4c). What failed or is out of date stays above the card too; Copy summary and the
  // notes go below its rows.
  // One banner for results that no longer fit (polish #1), in the card under its answer: the grade button's reason. Its
  // action is "Grade again" for each, as the toolbar's (owner, #240: it was "Let the app consider it" for the lines).
  const why = s.grade?.kind === "again" ? s.grade.reason : null;
  const banner: StaleBanner | null =
    why === "boundary"
      ? { text: EARLIER_BOUNDARY, actions: [{ label: "Grade again", onClick: s.run }] }
      : why === "house"
        ? { text: HOUSE_CHANGED, actions: [{ label: "Grade again", onClick: s.run }] }
        : why === "lines"
          ? { text: LINES_CHANGED, actions: [{ label: "Grade again", onClick: s.run }] }
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
          {s.error && <p className="tiny text-steep">The grade stopped: {s.error}</p>}
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
            shortcut={
              s.uses && (
                <button type="button" className="uses-shortcut" onClick={() => s.ctl.setUses(true)}>
                  <span>{USE_WORDS.tally(tallyOf(s.uses))}</span>
                  <span aria-hidden="true">›</span>
                </button>
              )
            }
          />
          {raise && (raise.suggestions.length > 0 || raise.neighbour) && (
            <RaiseSection
              suggestions={raise.suggestions}
              act={act}
              tryIt={tryIt}
              extra={
                raise.neighbour && (
                  <p className="raise-neighbour">
                    <span className="tiny muted">{NEIGHBOUR_WORDS.what}</span>{" "}
                    <button
                      type="button"
                      className="btn secondary raise-act"
                      onClick={() =>
                        s.ctl.startCombine(NEIGHBOUR_WORDS.name(s.ctl.layers?.name ?? "This parcel"))
                      }
                    >
                      {NEIGHBOUR_WORDS.button}
                    </button>
                  </p>
                )
              }
            />
          )}
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
            paving={s.card?.paving}
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
          adjust={adjustPropsFor(
            panel,
            s.ctl.state.store.open?.key,
            currentProfileId(),
            // What the app says without the person's adjustments.
            reportCard(display, s.rubric, { ...drawnFor(s)!, adjust: undefined }),
            (key) => householdDoc().adjusts.find((a) => a.key === key) ?? null,
            { save: adjustParcel, remove: removeAdjust, restore: restoreAdjust },
            s.adjustIntent?.factor === panel ? s.adjustIntent : null,
            s.card ? gradedSite(s.card, !!display.house && !("outside" in display.house)) : null,
          )}
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
                  tryIt,
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
