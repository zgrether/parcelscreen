"use client";
/**
 * "Re-screen all saved parcels" (step 1, PR 5b; approval A): after a clean break the saved parcels' grades are gone
 * until each is re-screened. This runs them one after another in the page's screen worker while the list stays
 * usable, says which one it's on, and stops on Cancel (the run in flight is dropped, not kept). Each finished run is
 * kept as a new screen of its parcel, as the explorer keeps one, so its row gets its grade back. Leaving the page
 * ends the job.
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
  failed: string[];
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
  const current = job?.state === "running" ? (job.parcels[job.at] ?? null) : null;
  const currentKey = current?.key ?? null;

  const advance = (failedKey: string | null) =>
    setJob((j) => {
      if (!j || j.state !== "running") return j;
      const at = j.at + 1;
      return {
        ...j,
        at,
        kept: j.kept + (failedKey ? 0 : 1),
        failed: failedKey ? [...j.failed, failedKey] : j.failed,
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
      queueMicrotask(() => advance(currentKey));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the run is identified by currentKey; onKept is the list's
  }, [status, result, currentKey]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one run per parcel: `current` is the trigger
  }, [current]);

  const start = () => {
    // Offline (17c): say so rather than start runs whose every request would fail.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setNote(OFFLINE_SCREEN_TEXT);
      return;
    }
    setNote(null);
    // A parcel whose boundary no longer builds can't be screened: it's counted as failed from the start.
    const todo = parcels.filter((p) => rescreenInput(p, config) !== null);
    const failed = parcels.filter((p) => !todo.includes(p)).map((p) => p.key!);
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
      ? ` ${plural(j.failed.length)} couldn't be re-screened: ${j.failed.map(nameOf).join(", ")}.`
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
