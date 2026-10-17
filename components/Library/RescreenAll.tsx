"use client";
/**
 * "Re-screen all saved parcels" (step 1, PR 5b; approval A): after a clean break the saved parcels' grades are gone
 * until each is re-screened. This runs them one after another in the page's screen worker while the list stays
 * usable, says which one it's on, and stops on Cancel (the run in flight is dropped, not kept). Each finished run is
 * kept as a new screen of its parcel, as the explorer keeps one, so its row gets its grade back. Leaving the page
 * ends the job.
 *
 * A lost worker (#154 test plan B5: the first run hung) is a run that never ends: the page's watchdog drops a worker
 * that doesn't acknowledge a run, goes silent mid-run, or died in the background (lib/client/workerWatch.ts), and the
 * hook's state goes back to idle with `generation` bumped, never to done or error. So the worker is warmed with a ping
 * before the first run, a lost run is retried once on the fresh worker, and a second loss counts the parcel as failed
 * and moves on, with the reason on the line.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { WorkingParcel } from "@/lib/client/parcelStore";
import { OFFLINE_SCREEN_TEXT } from "@/lib/client/pwa";
import { rescreenInput } from "@/lib/client/rescreenInput";
import type { RunKeys } from "@/lib/client/screenKeys";
import { addScreen, type ScreenRecord } from "@/lib/client/screenStore";
import { loadUserConfig } from "@/lib/client/userConfig";
import { useScreen } from "@/lib/client/useScreen";
import { ENGINE_VERSION } from "@/lib/screen/engine";
import type { ScreenResult } from "@/lib/screen/types";

export const RESCREEN_ALL = "Re-screen all saved parcels";

interface Job {
  /** The parcels to screen, in list order, as they were when the job started. */
  parcels: WorkingParcel[];
  at: number;
  kept: number;
  /** The parcels that couldn't be re-screened, each with the reason when there is one. */
  failed: { key: string; why: string | null }[];
  state: "running" | "stopped" | "finished";
}

export function RescreenAll({
  parcels,
  nameOf,
  onKept,
}: {
  /** The parcels whose grades are gone: the rows reading "Needs a re-screen". */
  parcels: readonly WorkingParcel[];
  nameOf(key: string): string;
  /** A finished run kept as the parcel's new screen: the list appends it to the parcel. */
  onKept(key: string, id: string): void;
}) {
  const screen = useScreen();
  const config = useMemo(() => loadUserConfig(), []);
  const [job, setJob] = useState<Job | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // Whether a run is in flight for the current parcel, and the keys its record carries.
  const pending = useRef(false);
  const keys = useRef<RunKeys | null>(null);
  // Bumped to run the current parcel again on a fresh worker; which parcel has had its one retry.
  const [attempt, setAttempt] = useState(0);
  const retried = useRef<string | null>(null);
  const current = job?.state === "running" ? (job.parcels[job.at] ?? null) : null;
  const currentKey = current?.key ?? null;

  // The worker is made and pinged as soon as the line shows, so the first run isn't racing a cold start.
  const { ping } = screen;
  useEffect(() => {
    if (parcels.length) ping();
  }, [ping, parcels.length]);

  const advance = (failedKey: string | null, why?: string) =>
    setJob((j) => {
      if (!j || j.state !== "running") return j;
      const at = j.at + 1;
      return {
        ...j,
        at,
        kept: j.kept + (failedKey ? 0 : 1),
        failed: failedKey ? [...j.failed, { key: failedKey, why: why ?? null }] : j.failed,
        state: at >= j.parcels.length ? "finished" : "running",
      };
    });

  // A finished run, kept (declared before the effect that starts the next run, so the result read is this parcel's).
  const { status, result } = screen.state;
  useEffect(() => {
    if (!currentKey || !pending.current) return;
    if (status === "done" && result && result.cancelled !== undefined) {
      pending.current = false;
      const record: ScreenRecord = {
        id: crypto.randomUUID(),
        keys: keys.current!,
        result: result as ScreenResult,
        engine: ENGINE_VERSION,
      };
      void addScreen(record).then((kept) => {
        if (kept) onKept(currentKey, record.id);
        advance(kept ? null : currentKey);
      });
    } else if (status === "error") {
      pending.current = false;
      const why = screen.state.error;
      queueMicrotask(() => advance(currentKey, why ?? undefined));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the run is identified by currentKey; onKept is the list's
  }, [status, result, currentKey]);

  // A lost worker: the hook is idle again with `generation` bumped (or already running its own one retry of an
  // unacknowledged run, which is left alone). The parcel gets one retry here on the fresh worker, then it's failed.
  const { generation } = screen.state;
  const seenGeneration = useRef(generation);
  useEffect(() => {
    if (generation === seenGeneration.current) return;
    seenGeneration.current = generation;
    if (!currentKey || !pending.current || status === "running") return;
    pending.current = false;
    if (retried.current !== currentKey) {
      retried.current = currentKey;
      setAttempt((a) => a + 1);
    } else {
      const why = screen.state.error ?? "the screen worker was lost";
      queueMicrotask(() => advance(currentKey, why));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one decision per generation, for the run in flight
  }, [generation, status, currentKey]);

  // The next parcel's run.
  useEffect(() => {
    if (!current || pending.current) return;
    const made = rescreenInput(current, config);
    if (!made) {
      // Its boundary no longer builds (start() leaves those out; this is the guard).
      queueMicrotask(() => advance(current.key!));
      return;
    }
    keys.current = made.keys;
    pending.current = true;
    screen.run(made.input);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one run per parcel (and per retry): the triggers
  }, [current, attempt]);

  const start = () => {
    // Offline (17c): say so rather than start runs whose every request would fail.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setNote(OFFLINE_SCREEN_TEXT);
      return;
    }
    setNote(null);
    // A parcel whose boundary no longer builds can't be screened: it's counted as failed from the start.
    const todo = parcels.filter((p) => rescreenInput(p, config) !== null);
    const failed = parcels
      .filter((p) => !todo.includes(p))
      .map((p) => ({ key: p.key!, why: "its boundary no longer builds" }));
    retried.current = null;
    setJob({ parcels: todo, at: 0, kept: 0, failed, state: todo.length ? "running" : "finished" });
  };
  const cancel = () => {
    pending.current = false;
    screen.cancel();
    setJob((j) => (j && j.state === "running" ? { ...j, state: "stopped" } : j));
  };

  const n = parcels.length;
  if (!job && n === 0 && !note) return null;
  const plural = (k: number) => `${k} parcel${k === 1 ? "" : "s"}`;
  const failedWords = (j: Job) =>
    j.failed.length
      ? ` ${plural(j.failed.length)} couldn't be re-screened: ${j.failed
          .map((f) => (f.why ? `${nameOf(f.key)} (${f.why})` : nameOf(f.key)))
          .join(", ")}.`
      : "";
  return (
    <p className="tiny lib-rescreen" role="status">
      {job?.state === "running" && current ? (
        <>
          <span>
            Re-screening {job.at + 1} of {job.parcels.length}: {nameOf(current.key!)}…
          </span>
          <button className="btn small secondary" onClick={cancel}>
            Cancel
          </button>
        </>
      ) : (
        <>
          {job?.state === "finished" && (
            <span>
              Re-screened {plural(job.kept)}.{failedWords(job)}
            </span>
          )}
          {job?.state === "stopped" && (
            <span>
              Stopped after {job.kept} of {job.parcels.length}.{failedWords(job)}
            </span>
          )}
          {note && <span>{note}</span>}
          {n > 0 && (
            <>
              <span className="muted">
                {plural(n)} need{n === 1 ? "s" : ""} a re-screen (saved under earlier rules).
              </span>
              <button className="btn small" onClick={start}>
                {RESCREEN_ALL}
              </button>
            </>
          )}
        </>
      )}
    </p>
  );
}
