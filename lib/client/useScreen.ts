"use client";
/**
 * React hook that runs the screen in a Web Worker (lib/screen/worker.ts). It tracks each step's status and
 * the latest (partial) result as the worker reports them, and exposes run / cancel / evaluateAt / setHouse.
 * The worker is created on first use and terminated on unmount; its caches (DEMs, atlas tiles) live as long
 * as it does, so re-runs and re-evaluations in one session don't refetch.
 *
 * Step 17e: the worker keeps the sessions of the last few runs. `activate(id)` makes a kept run the current
 * one again (its own result and view come back as `updated`, with no network); `release(id)` drops one.
 *
 * A worker can die under the page: terminated while a phone app is in the background, or crashed. Then every
 * kept session is gone, and the page must notice rather than wait or show an error (owner, 17e). The worker is
 * taken as lost when it reports an error event, when a reactivated run is unknown to it or unanswered (4 s),
 * when it doesn't answer a ping on returning to the foreground (3 s), or when a run hears nothing at all (20 s;
 * the run is then retried once on a fresh worker). Losing it bumps `generation`: the page forgets its kept
 * sessions, and each parcel shows the usual "Run again to restore…" note.
 */
import { useCallback, useEffect, useReducer, useRef } from "react";
import type { PartialScreenResult, ProgressEvent, ScreenInput, ScreenResult, Step } from "@/lib/screen/types";
import type { FromWorker, SessionBytes, SessionView, ToWorker } from "@/lib/screen/worker-protocol";
import type { LatLon } from "@/lib/screen/util";

export type StepStatus = { status: ProgressEvent["status"]; message?: string; link?: string };

export interface ScreenState {
  status: "idle" | "running" | "done" | "error";
  steps: Partial<Record<Step, StepStatus>>;
  /** Partial while running (no verdict yet), complete once done. */
  result: PartialScreenResult | ScreenResult | null;
  view: SessionView | null;
  error: string | null;
  /** A re-evaluation (evaluateAt / setHouse) is in flight. */
  updating: boolean;
  /** The worker answered a ping: it loaded and its code evaluated. */
  workerReady: boolean;
  /** The current run's id (the worker's), once it has one. */
  runId: number | null;
  /** A kept session reopened (17e): there's no step list to show for it. */
  restored: boolean;
  /** The current session's size, as the worker measured it. */
  bytes: SessionBytes | null;
  /** Bumped each time the worker is lost (17e): sessions from an earlier generation are gone. */
  generation: number;
}

const initial: ScreenState = {
  status: "idle",
  steps: {},
  result: null,
  view: null,
  error: null,
  updating: false,
  workerReady: false,
  runId: null,
  restored: false,
  bytes: null,
  generation: 0,
};

type Action =
  | { type: "start"; id: number }
  | { type: "activate"; id: number }
  | { type: "update-start" }
  /** The worker died or was replaced: nothing it held is live any more (no error: the page falls back). */
  | { type: "lost"; error?: string }
  | { type: "message"; msg: FromWorker };

function reducer(state: ScreenState, action: Action): ScreenState {
  switch (action.type) {
    case "start":
      return {
        ...initial,
        status: "running",
        workerReady: state.workerReady,
        runId: action.id,
        generation: state.generation,
      };
    case "lost":
      return { ...initial, generation: state.generation + 1, error: action.error ?? null };
    case "activate":
      return {
        ...initial,
        status: "done",
        workerReady: state.workerReady,
        generation: state.generation,
        runId: action.id,
        restored: true,
        updating: true,
      };
    case "update-start":
      return { ...state, updating: true };
    case "message": {
      const m = action.msg;
      switch (m.type) {
        case "progress": {
          const { step, status, message, link, partial } = m.event;
          return {
            ...state,
            steps: {
              ...state.steps,
              [step]: { status, ...(message ? { message } : {}), ...(link ? { link } : {}) },
            },
            ...(partial ? { result: partial } : {}),
          };
        }
        case "done":
          return {
            ...state,
            status: "done",
            result: m.result,
            view: m.view,
            bytes: m.bytes,
            updating: false,
          };
        case "updated":
          return { ...state, result: m.result, view: m.view, bytes: m.bytes, updating: false };
        case "pong":
          return { ...state, workerReady: true };
        case "error":
          return {
            ...state,
            status: state.status === "running" ? "error" : state.status,
            error: m.message,
            updating: false,
          };
      }
    }
  }
}

export function useScreen() {
  const [state, dispatch] = useReducer(reducer, initial);
  const worker = useRef<Worker | null>(null);
  // The run the page follows now (a new run, or a kept one reactivated), and the last id handed out: a new
  // run never reuses a kept run's id.
  const runId = useRef(0);
  const lastId = useRef(0);
  // The watchdogs (17e): a reactivation's answer, a ping's pong, a run's first word.
  const pendingActivate = useRef<number | null>(null);
  const timers = useRef<{ activate?: number; ping?: number; run?: number }>({});
  const clearTimer = (k: "activate" | "ping" | "run") => {
    window.clearTimeout(timers.current[k]);
    timers.current[k] = undefined;
  };

  // The worker is gone (or no longer to be trusted): drop it; the next request makes a fresh one.
  const lose = useCallback((error?: string) => {
    worker.current?.terminate();
    worker.current = null;
    pendingActivate.current = null;
    for (const k of ["activate", "ping", "run"] as const) clearTimer(k);
    dispatch({ type: "lost", ...(error ? { error } : {}) });
  }, []);

  const getWorker = useCallback((): Worker => {
    if (!worker.current) {
      const w = new Worker(new URL("../screen/worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<FromWorker>) => {
        if (worker.current !== w) return;
        const m = e.data;
        clearTimer("run"); // the worker is alive
        if (m.type === "pong") clearTimer("ping");
        if (m.id === pendingActivate.current && (m.type === "updated" || m.type === "error")) {
          pendingActivate.current = null;
          clearTimer("activate");
          // A kept run the worker doesn't know: it was restarted, so none of the kept sessions survive.
          if (m.type === "error") return lose();
        }
        if (m.type === "pong" || m.id === runId.current) dispatch({ type: "message", msg: m });
      };
      w.onerror = (e) => {
        e.preventDefault();
        if (worker.current === w) lose();
      };
      worker.current = w;
    }
    return worker.current;
  }, [lose]);

  useEffect(
    () => () => {
      worker.current?.terminate();
      worker.current = null;
    },
    [],
  );

  // Back from the background (phones stop or kill workers there): a worker that doesn't answer is lost.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible" || !worker.current) return;
      clearTimer("ping");
      timers.current.ping = window.setTimeout(() => lose(), 3000);
      worker.current.postMessage({ type: "ping", id: 0 } satisfies ToWorker);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [lose]);

  const send = useCallback((m: ToWorker) => getWorker().postMessage(m), [getWorker]);

  const run = useCallback(
    function start(input: ScreenInput, retried = false): void {
      lastId.current += 1;
      runId.current = lastId.current;
      dispatch({ type: "start", id: runId.current });
      send({ type: "run", id: runId.current, input });
      // A run hears from its worker at once (its first step starts); silence means the worker is gone.
      clearTimer("run");
      timers.current.run = window.setTimeout(() => {
        if (retried) return lose("The screen didn't start. Run it again.");
        lose();
        start(input, true);
      }, 20_000);
    },
    [send, lose],
  );

  const cancel = useCallback(() => send({ type: "cancel", id: runId.current }), [send]);

  const evaluateAt = useCallback(
    (ll: LatLon, label: string) => {
      dispatch({ type: "update-start" });
      send({ type: "evaluateAt", id: runId.current, ll, label });
    },
    [send],
  );

  const setHouse = useCallback(
    (ll: LatLon | null) => {
      dispatch({ type: "update-start" });
      send({ type: "setHouse", id: runId.current, ll });
    },
    [send],
  );

  const ping = useCallback(() => send({ type: "ping", id: 0 }), [send]);

  /** Reopen a kept run (17e): it becomes the current one, at its own point. */
  const activate = useCallback(
    (id: number) => {
      runId.current = id;
      pendingActivate.current = id;
      dispatch({ type: "activate", id });
      send({ type: "activate", id });
      clearTimer("activate");
      timers.current.activate = window.setTimeout(() => lose(), 4000);
    },
    [send, lose],
  );

  /** The page no longer keeps this run's session. */
  const release = useCallback((id: number) => send({ type: "release", id }), [send]);

  return {
    state,
    run: (input: ScreenInput) => run(input),
    cancel,
    evaluateAt,
    setHouse,
    ping,
    activate,
    release,
  };
}
