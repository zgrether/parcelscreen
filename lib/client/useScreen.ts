"use client";
/**
 * React hook that runs the screen in a Web Worker (lib/screen/worker.ts). It tracks each step's status and
 * the latest (partial) result as the worker reports them, and exposes run / cancel / evaluateAt / setHouse.
 * The worker is created on first use and terminated on unmount; its caches (DEMs, atlas tiles) live as long
 * as it does, so re-runs and re-evaluations in one session don't refetch.
 *
 * Step 17e: the worker keeps the sessions of the last few runs. `activate(id)` makes a kept run the current
 * one again (its own result and view come back as `updated`, with no network); `release(id)` drops one.
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
};

type Action =
  | { type: "start"; id: number }
  | { type: "activate"; id: number }
  | { type: "update-start" }
  | { type: "message"; msg: FromWorker };

function reducer(state: ScreenState, action: Action): ScreenState {
  switch (action.type) {
    case "start":
      return { ...initial, status: "running", workerReady: state.workerReady, runId: action.id };
    case "activate":
      return {
        ...initial,
        status: "done",
        workerReady: state.workerReady,
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

  const getWorker = useCallback((): Worker => {
    if (!worker.current) {
      const w = new Worker(new URL("../screen/worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<FromWorker>) => {
        if (e.data.type === "pong" || e.data.id === runId.current) dispatch({ type: "message", msg: e.data });
      };
      worker.current = w;
    }
    return worker.current;
  }, []);

  useEffect(
    () => () => {
      worker.current?.terminate();
      worker.current = null;
    },
    [],
  );

  const send = useCallback((m: ToWorker) => getWorker().postMessage(m), [getWorker]);

  const run = useCallback(
    (input: ScreenInput) => {
      lastId.current += 1;
      runId.current = lastId.current;
      dispatch({ type: "start", id: runId.current });
      send({ type: "run", id: runId.current, input });
    },
    [send],
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
    },
    [send],
  );

  /** The page no longer keeps this run's session. */
  const release = useCallback((id: number) => send({ type: "release", id }), [send]);

  return { state, run, cancel, evaluateAt, setHouse, ping, activate, release };
}
