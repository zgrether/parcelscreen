"use client";
/**
 * Save offline (step 14e, docs/plans/step-14e-offline.md §4.1): the ⋯ item and its sheet. The sheet leads with the
 * size, says what's included and that Esri's maps aren't, then becomes the download's progress, with Cancel; at the
 * end, the size saved, or what didn't download with Try again. Closing it while it downloads only hides it: the ⋯
 * item carries the progress. A dialog on a desktop, a bottom sheet on a phone (the rubric sheet's classes).
 */
import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  askSave,
  cancelSave,
  confirmSave,
  hideSave,
  onSaveState,
  saveState,
  type SaveTarget,
} from "@/lib/client/saveOffline";
import { aboutMb } from "@/lib/offline/plan";
import { listSaved, type SavedParcel } from "@/lib/offline/store";
import { formatBytes, OFFLINE_WORDS as W } from "@/lib/offline/words";

const useSave = () => useSyncExternalStore(onSaveState, saveState, () => null);

/** This device's saved parcels, read again after each save ends. */
export function useSavedParcels(): SavedParcel[] {
  const s = useSave();
  const over = s?.phase === "over";
  const [saved, setSaved] = useState<SavedParcel[]>([]);
  useEffect(() => {
    let gone = false;
    void listSaved().then((x) => {
      if (!gone) setSaved(x);
    });
    return () => {
      gone = true;
    };
  }, [over]);
  return saved;
}

const pct = (done: number, total: number) => (total ? Math.floor((done / total) * 100) : 0);

/** The ⋯ menu's item: Save offline, Update offline copy, or the running download's progress. */
export function SaveOfflineItem({ target, close }: { target: SaveTarget; close(): void }) {
  const s = useSave();
  const saved = useSavedParcels().some((p) => p.parcel === target.key);
  const running = s?.phase === "saving" && s.target.key === target.key;
  return (
    <button
      type="button"
      role="menuitem"
      disabled={s?.phase === "saving" && !running}
      onClick={() => {
        close();
        askSave(target, saved);
      }}
    >
      {running ? W.saving(pct(s.done, s.total)) : saved ? W.update : W.save}
    </button>
  );
}

/** The sheet, mounted once beside the ⋯ menu. */
export function SaveOfflineSheet() {
  const s = useSave();
  const id = useId();
  useEffect(() => {
    if (!s?.shown) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && hideSave();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [s?.shown]);
  if (!s?.shown) return null;

  const o = s.outcome;
  const body =
    s.phase === "ask" ? (
      <>
        <p className="offline-size">{s.plan ? W.about(aboutMb(s.plan.bytes)) : W.working}</p>
        <p className="tiny">{W.includes}</p>
        <p className="tiny muted">{W.noEsri}</p>
        <div className="rubric-confirm-actions">
          <button type="button" className="btn" disabled={!s.plan} onClick={confirmSave}>
            {s.force ? W.update : W.save}
          </button>
          <button type="button" className="btn secondary" onClick={hideSave}>
            {W.cancel}
          </button>
        </div>
      </>
    ) : s.phase === "saving" ? (
      <>
        <p className="offline-size">{W.saving(pct(s.done, s.total))}</p>
        <div className="grade-progress-bar offline-progress" aria-hidden="true">
          <span style={{ width: `${pct(s.done, s.total)}%` }} />
        </div>
        <div className="rubric-confirm-actions">
          <button type="button" className="btn secondary" onClick={cancelSave}>
            {W.cancel}
          </button>
        </div>
      </>
    ) : (
      <>
        <p className="offline-size" role="status">
          {o?.kind === "saved"
            ? W.saved(formatBytes(o.saved.bytes))
            : o?.kind === "full"
              ? W.full
              : W.unavailable}
        </p>
        {o?.kind === "saved" && o.saved.failed > 0 && <p className="tiny">{W.failed(o.saved.failed)}</p>}
        <div className="rubric-confirm-actions">
          {o?.kind === "saved" && o.saved.failed > 0 && (
            <button type="button" className="btn" onClick={() => askSave(s.target, false)}>
              {W.tryAgain}
            </button>
          )}
          <button type="button" className="btn secondary" onClick={hideSave}>
            {W.done}
          </button>
        </div>
      </>
    );

  return createPortal(
    <div className="rubric-sheet-scrim" onClick={hideSave}>
      <div
        className="rubric-sheet rubric-confirm offline-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={id}>{W.question}</h3>
        {body}
      </div>
    </div>,
    document.body,
  );
}
