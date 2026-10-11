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
 * kept session is gone, and the page must notice rather than wait or show an error (owner, 17e), without ever
 * replacing a healthy worker: the rules are in lib/client/workerWatch.ts. Losing it bumps `generation`: the
 * page forgets its kept sessions, and each parcel shows the usual "Run again to restore…" note.
 */
import { useCallback, useEffect, useReducer, useRef } from "react";
import type { PartialScreenResult, ProgressEvent, ScreenInput, ScreenResult, Step } from "@/lib/screen/types";
import type { FromWorker, SessionBytes, SessionView, ToWorker } from "@/lib/screen/worker-protocol";
import { WorkerWatch } from "./workerWatch";
import type { LatLon } from "@/lib/screen/util";

export type StepStatus = {
  status: ProgressEvent["status"];
  message?: string;
  link?: string;
  /** When the step started, and once it ended how long it took (ms, as the page saw it): debug mode shows it. */
  startedAt?: number;
  ms?: number;
};

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

export const initial: ScreenState = {
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

export type Action =
  | { type: "start"; id: number }
  | { type: "activate"; id: number }
  | { type: "update-start" }
  /** The worker died or was replaced: nothing it held is live any more (no error: the page falls back). */
  | { type: "lost"; error?: string }
  | { type: "message"; msg: FromWorker; at: number };

/** The screen state from the worker's messages (exported for its test). */
export function reducer(state: ScreenState, action: Action): ScreenState {
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
          const startedAt = state.steps[step]?.startedAt ?? action.at;
          const ended = status === "done" || status === "fail";
          return {
            ...state,
            steps: {
              ...state.steps,
              [step]: {
                status,
                ...(message ? { message } : {}),
                ...(link ? { link } : {}),
                startedAt,
                ...(ended ? { ms: action.at - startedAt } : {}),
              },
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
        case "started": // the watchdog's (workerWatch.ts); nothing to show
        case "heartbeat":
          return state;
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
  // The worker is gone (or no longer to be trusted): drop it; the next request makes a fresh one.
  const lose = useCallback((error?: string) => {
    worker.current?.terminate();
    worker.current = null;
    dispatch({ type: "lost", ...(error ? { error } : {}) });
  }, []);
  // When to take the worker as lost, and never a healthy one (lib/client/workerWatch.ts).
  const watchRef = useRef<WorkerWatch | null>(null);
  const watch = useCallback((): WorkerWatch => (watchRef.current ??= new WorkerWatch(lose)), [lose]);

  const getWorker = useCallback((): Worker => {
    if (!worker.current) {
      const w = new Worker(new URL("../screen/worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<FromWorker>) => {
        if (worker.current !== w) return;
        const m = e.data;
        if (!watch().message(m)) return; // a kept run it doesn't know: it was restarted, and is dropped
        if (m.type === "started" || m.type === "heartbeat") return;
        if (m.type === "pong" || m.id === runId.current)
          dispatch({ type: "message", msg: m, at: performance.now() });
      };
      w.onerror = (e) => {
        e.preventDefault();
        if (worker.current !== w) return;
        watch().reset();
        lose();
      };
      worker.current = w;
    }
    return worker.current;
  }, [lose, watch]);

  useEffect(
    () => () => {
      watchRef.current?.reset();
      worker.current?.terminate();
      worker.current = null;
    },
    [],
  );

  // Back from the background (phones stop or kill workers there): with no run going, a ping must be answered.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (watch().visible(!!worker.current))
        worker.current!.postMessage({ type: "ping", id: 0 } satisfies ToWorker);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [watch]);

  const send = useCallback((m: ToWorker) => getWorker().postMessage(m), [getWorker]);

  const run = useCallback(
    function start(input: ScreenInput, retried = false): void {
      lastId.current += 1;
      runId.current = lastId.current;
      dispatch({ type: "start", id: runId.current });
      send({ type: "run", id: runId.current, input });
      // The worker acknowledges a run at once; without that, it's retried once on a fresh worker.
      watch().runSent(runId.current, retried ? null : () => start(input, true));
    },
    [send, watch],
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
      dispatch({ type: "activate", id });
      send({ type: "activate", id });
      watch().activateSent(id);
    },
    [send, watch],
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
