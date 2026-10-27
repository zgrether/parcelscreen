"use client";
/**
 * Settings › Offline (step 14e, docs/plans/step-14e-offline.md §4.3): what this device keeps for the app, whether the
 * browser will keep it, the map cache with its cap and Clear map cache, the parcels saved offline with Delete, and on an
 * iPhone in Safari the hint to install.
 * Everything here acts at once, outside the form's Save and Cancel, and is this device's alone.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { currentParcels } from "@/lib/client/liveParcels";
import { openOnMap } from "@/lib/client/openOnMap";
import { debugOn } from "@/lib/client/debugHandle";
import { isIosBrowser, requestPersist, storageInfo, type StorageInfo } from "@/lib/client/storage";
import { CAP_CHOICES, DEBUG_CAP_BYTES } from "@/lib/offline/config";
import { cacheTotals, clearAutomatic, deleteSaved, readCap, writeCap } from "@/lib/offline/store";
import { useSavedParcels } from "@/components/Offline/SaveOffline";
import { formatBytes, OFFLINE_WORDS as W } from "@/lib/offline/words";

/** How long a deleted parcel's row offers Undo before its copy goes (polish 2, L9). */
const UNDO_MS = 6000;

interface State {
  storage: StorageInfo | null;
  automatic: number;
  cap: number;
  /** iOS Safari, not installed: the hint shows. */
  ios: boolean;
}

async function readState(): Promise<State> {
  const [storage, totals, cap] = await Promise.all([storageInfo(), cacheTotals(), readCap()]);
  return { storage, automatic: totals.automatic, cap, ios: isIosBrowser() };
}

export function OfflineSection() {
  const [s, setS] = useState<State | null>(null);
  const saved = useSavedParcels();
  const [deleted, setDeleted] = useState<ReadonlySet<string>>(new Set());
  // Deleted rows still offering Undo, each with the timer that deletes it; flushed when Settings closes.
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const timers = useRef(new Map<string, number>());
  const router = useRouter();

  const load = useCallback(() => readState().then(setS), []);

  const finish = useCallback(
    (parcel: string) => {
      timers.current.delete(parcel);
      setPending((p) => new Set([...p].filter((x) => x !== parcel)));
      setDeleted((d) => new Set([...d, parcel]));
      void deleteSaved(parcel).then(load);
    },
    [load],
  );
  const remove = (parcel: string) => {
    setPending((p) => new Set([...p, parcel]));
    timers.current.set(
      parcel,
      window.setTimeout(() => finish(parcel), UNDO_MS),
    );
  };
  const undo = (parcel: string) => {
    window.clearTimeout(timers.current.get(parcel));
    timers.current.delete(parcel);
    setPending((p) => new Set([...p].filter((x) => x !== parcel)));
  };
  // Settings closing (this section unmounting) deletes what's still waiting, as Delete said it would.
  useEffect(() => {
    const t = timers.current;
    return () => {
      for (const [parcel, id] of t) {
        window.clearTimeout(id);
        void deleteSaved(parcel);
      }
      t.clear();
    };
  }, []);

  useEffect(() => {
    let gone = false;
    void readState().then((x) => {
      if (!gone) setS(x);
    });
    return () => {
      gone = true;
    };
  }, []);

  const choices = debugOn() ? [DEBUG_CAP_BYTES, ...CAP_CHOICES] : CAP_CHOICES;

  return (
    <section className="offline-settings" aria-labelledby="offline-title">
      <h3 id="offline-title">{W.heading}</h3>
      {s?.storage && (
        <p className="tiny">
          {W.device(formatBytes(s.storage.usage), formatBytes(s.storage.quota))}.{" "}
          <span className="muted">{s.storage.persisted ? W.kept : W.mayClear}</span>
        </p>
      )}
      {s?.storage && !s.storage.persisted && (
        <div className="your-data-row">
          <button className="btn secondary" onClick={() => void requestPersist().then(load)}>
            {W.keep}
          </button>
        </div>
      )}
      {s && (
        <>
          <p className="tiny offline-cache-line">
            {W.mapCache(formatBytes(s.automatic), formatBytes(s.cap))}
          </p>
          <p className="tiny muted">{W.mapCacheLine}</p>
          <div className="your-data-row offline-cap-row">
            <label className="tiny" htmlFor="offline-cap">
              {W.keepUpTo}
            </label>
            <select
              id="offline-cap"
              value={s.cap}
              onChange={(e) => {
                const cap = Number(e.target.value);
                setS({ ...s, cap });
                void writeCap(cap);
              }}
            >
              {(choices.includes(s.cap) ? choices : [...choices, s.cap]).map((c) => (
                <option key={c} value={c}>
                  {formatBytes(c)}
                </option>
              ))}
            </select>
            <button className="btn secondary" onClick={() => void clearAutomatic().then(load)}>
              {W.clear}
            </button>
          </div>
        </>
      )}
      <h4>{W.savedHeading}</h4>
      {saved.filter((p) => !deleted.has(p.parcel)).length === 0 ? (
        <p className="tiny muted">{W.none}</p>
      ) : (
        <ul className="offline-saved">
          {saved
            .filter((p) => !deleted.has(p.parcel))
            .map((p) => (
              <li key={p.parcel}>
                <SavedName
                  name={p.name}
                  parcel={p.parcel}
                  open={(e) => {
                    const b = currentParcels().built.find((x) => x.key === p.parcel);
                    if (!b) return;
                    e.currentTarget.closest("dialog")?.close();
                    openOnMap(b);
                    router.push("/explore");
                  }}
                />
                {pending.has(p.parcel) ? (
                  <>
                    <span className="tiny muted">{W.deleted}</span>
                    <button className="btn secondary" onClick={() => undo(p.parcel)}>
                      {W.undo}
                    </button>
                  </>
                ) : (
                  <>
                    <span className="tiny muted">
                      {formatBytes(p.bytes)} · {p.complete ? p.savedAt.slice(0, 10) : W.incomplete}
                    </span>
                    <button className="btn secondary" onClick={() => remove(p.parcel)}>
                      {W.delete}
                    </button>
                  </>
                )}
              </li>
            ))}
        </ul>
      )}
      {s?.ios && <p className="tiny muted">{W.iphone}</p>}
    </section>
  );
}

/** A saved parcel's name: a link to it on the map while it's on this device's list (polish 2, L9). */
function SavedName({
  name,
  parcel,
  open,
}: {
  name: string;
  parcel: string;
  open: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const known = currentParcels().built.some((x) => x.key === parcel);
  if (!known) return <span className="offline-saved-name">{name}</span>;
  return (
    <button type="button" className="link-btn offline-saved-name" title={W.openTitle} onClick={open}>
      {name}
    </button>
  );
}
