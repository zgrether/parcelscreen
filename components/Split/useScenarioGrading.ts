"use client";
/**
 * Grade both pieces (step 14, docs/plans/step-14-land-uses.md §5.1): a scenario's pieces screened one after the other in
 * a worker of their own, as the list's Re-screen all does (components/Library/RescreenAll.tsx), so the parcel's own run
 * and its live session are left alone. Each finished run is kept with addScreen (and synced, as every screen is) under
 * its scenario, never in the parcel's `screenIds`. Cancel drops the run in flight; so does opening another parcel. A
 * piece left without a screen shows "This piece didn't grade", with Try again.
 *
 * A lost worker (a run never acknowledged, or the worker dying mid-run) bumps the hook's `generation`: the piece gets one
 * retry on the fresh worker, then it's left ungraded and the next one runs.
 */
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ExploreState } from "@/components/Explore/exploreState";
import type { ExploreController } from "@/components/Explore/useExploreController";
import { rescreenInput } from "@/lib/client/rescreenInput";
import type { RunKeys } from "@/lib/client/screenKeys";
import { addScreen, type ScreenRecord } from "@/lib/client/screenStore";
import { useScreen } from "@/lib/client/useScreen";
import { ENGINE_VERSION } from "@/lib/screen/engine";
import type { ScreenResult, UserConfig } from "@/lib/screen/types";
import { pieceOf, type PieceSide } from "@/lib/split/scenario";

interface Job {
  /** Counts the jobs: a second grade of the same piece is a new run. */
  n: number;
  /** The parcel open when it started (state.serial): another one opening ends it. */
  serial: number;
  id: string;
  sides: PieceSide[];
  at: number;
}

export interface ScenarioGrading {
  /** What's being graded: the scenario, the pieces still to come (the current one first), and the current one. */
  grading: { id: string; sides: PieceSide[]; current: PieceSide } | null;
  cancel(): void;
}

export function useScenarioGrading(
  ctl: ExploreController,
  config: UserConfig,
  /** A grade has started: the panel shows it (the phone's sheet rises). */
  onStart: () => void,
): ScenarioGrading {
  const screen = useScreen();
  const [job, setJob] = useState<Job | null>(null);
  const pending = useRef(false);
  const keys = useRef<RunKeys | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retried = useRef<string | null>(null);
  const latest = useRef({ ctl, onStart });
  useEffect(() => {
    latest.current = { ctl, onStart };
  });
  const { serial, gradeScenario } = ctl.state;

  // Grade both pieces (or Try again) asked for on the open parcel: taken as it renders, replacing any grade running.
  const [taken, setTaken] = useState<{ request: ExploreState["gradeScenario"]; n: number }>({
    request: null,
    n: 0,
  });
  if (gradeScenario && gradeScenario !== taken.request && gradeScenario.serial === serial) {
    const n = taken.n + 1;
    setTaken({ request: gradeScenario, n });
    setJob({ n, serial, id: gradeScenario.id, sides: gradeScenario.sides, at: 0 });
  }
  // Another parcel opened: its pieces aren't this one's.
  const active = job && job.serial === serial ? job : null;
  const side = active ? (active.sides[active.at] ?? null) : null;
  const runKey = active && side ? `${active.n}:${side}` : null;

  const stop = () => {
    if (pending.current) screen.cancel();
    pending.current = false;
  };
  const advance = () => setJob((j) => (j && j.at + 1 < j.sides.length ? { ...j, at: j.at + 1 } : null));

  // A new job: the request is taken, the run in flight (another job's) dropped, the worker warmed and the panel shown.
  const { ping } = screen;
  const jobN = job?.n ?? 0;
  useEffect(() => {
    if (!jobN) return;
    latest.current.ctl.scenarioGrading();
    stop();
    retried.current = null;
    ping(); // so the first run isn't racing a cold start
    latest.current.onStart();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per job
  }, [jobN]);
  const stale = !!job && !active;
  useEffect(() => {
    if (stale) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the run stops on the switch
  }, [stale]);

  // A finished run, kept under its scenario (declared before the effect that starts the next run).
  const { status, result } = screen.state;
  useEffect(() => {
    if (!active || !side || !pending.current) return;
    if (status === "done" && result && result.cancelled !== undefined) {
      pending.current = false;
      const record: ScreenRecord = {
        id: crypto.randomUUID(),
        keys: keys.current!,
        result: result as ScreenResult,
        engine: ENGINE_VERSION,
      };
      const { id, serial: at } = active;
      void addScreen(record).then((kept) => {
        if (kept) latest.current.ctl.pieceScreened(id, side, record.id, at);
        advance();
      });
    } else if (status === "error") {
      pending.current = false;
      queueMicrotask(advance);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the run is identified by runKey
  }, [status, result, runKey]);

  // A lost worker: one retry of the piece on the fresh worker, then it's left ungraded.
  const { generation } = screen.state;
  const seenGeneration = useRef(generation);
  useEffect(() => {
    if (generation === seenGeneration.current) return;
    seenGeneration.current = generation;
    if (!runKey || !pending.current || status === "running") return;
    pending.current = false;
    if (retried.current !== runKey) {
      retried.current = runKey;
      queueMicrotask(() => setAttempt((a) => a + 1));
    } else queueMicrotask(advance);
  }, [generation, status, runKey]);

  // The next piece's run: the open parcel's piece on that side, as it is now.
  useEffect(() => {
    if (!active || !side || pending.current) return;
    const open = latest.current.ctl.current().store.open;
    const sc = open?.scenarios.find((x) => x.id === active.id);
    const piece = open && sc ? pieceOf(open, sc, side) : null;
    const made = piece ? rescreenInput(piece.parcel, config) : null;
    // Offline (17c), or a line that no longer cuts the parcel in two: the piece is left ungraded.
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    if (!made || offline) {
      queueMicrotask(advance);
      return;
    }
    keys.current = made.keys;
    pending.current = true;
    screen.run(made.input);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one run per piece (and per retry)
  }, [runKey, attempt]);

  return {
    grading: active && side ? { id: active.id, sides: active.sides.slice(active.at), current: side } : null,
    cancel() {
      stop();
      setJob(null);
    },
  };
}

export const ScenarioGradingContext = createContext<ScenarioGrading | null>(null);

export function useScenarioGradingContext(): ScenarioGrading {
  const c = useContext(ScenarioGradingContext);
  if (!c) throw new Error("useScenarioGradingContext outside ScenarioGradingContext");
  return c;
}
