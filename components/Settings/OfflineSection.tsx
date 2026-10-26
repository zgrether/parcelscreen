"use client";
/**
 * Settings › Offline (step 14e, docs/plans/step-14e-offline.md §4.3): what this device keeps for the app, whether the
 * browser will keep it, the map cache with its cap and Clear map cache, the parcels saved offline with Delete, and on an
 * iPhone in Safari the hint to install.
 * Everything here acts at once, outside the form's Save and Cancel, and is this device's alone.
 */
import { useCallback, useEffect, useState } from "react";
import { debugOn } from "@/lib/client/debugHandle";
import { isIosBrowser, requestPersist, storageInfo, type StorageInfo } from "@/lib/client/storage";
import { CAP_CHOICES, DEBUG_CAP_BYTES } from "@/lib/offline/config";
import { cacheTotals, clearAutomatic, deleteSaved, readCap, writeCap } from "@/lib/offline/store";
import { useSavedParcels } from "@/components/Offline/SaveOffline";
import { formatBytes, OFFLINE_WORDS as W } from "@/lib/offline/words";

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

  const load = useCallback(() => readState().then(setS), []);

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
                <span className="offline-saved-name">{p.name}</span>
                <span className="tiny muted">
                  {formatBytes(p.bytes)} · {p.complete ? p.savedAt.slice(0, 10) : W.incomplete}
                </span>
                <button
                  className="btn secondary"
                  onClick={() => {
                    setDeleted(new Set([...deleted, p.parcel]));
                    void deleteSaved(p.parcel).then(load);
                  }}
                >
                  {W.delete}
                </button>
              </li>
            ))}
        </ul>
      )}
      {s?.ios && <p className="tiny muted">{W.iphone}</p>}
    </section>
  );
}
