"use client";
/**
 * History (step 8, docs/plans/step-8-favorites.md §3): the parcels this person graded or kept, newest first, theirs
 * alone. Each row: the name, its acres and when it was graded, their grade, the star, Open on the map, and on an
 * unstarred row ✕ (gone for good, with Undo for a few seconds). Clear history removes every unstarred one at once; the
 * favorites stay. A table on a desktop, cards on a phone (CSS).
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { Star } from "@/components/Favorites/Star";
import { ResetConfirm } from "@/components/Rubric/ResetConfirm";
import { TOAST_MS } from "@/components/Explore/SwitchToast";
import { countyOf, EMPTY_LOG, isFavorite, starName, type HistoryLog } from "@/lib/client/favorites";
import { clearMyHistory, restoreToHistory, starParcel, unstarParcel } from "@/lib/client/favoritesStore";
import { memberName } from "@/lib/client/household";
import { HISTORY_EMPTY, type LibraryRow } from "@/lib/client/library";
import { openOnMap } from "@/lib/client/openOnMap";
import type { WorkingParcel } from "@/lib/client/parcelStore";
import type { KeptScreen } from "@/lib/client/useKeptScreens";

const when = (iso: string) => new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });

export const CLEAR_QUESTION = "Clear your history? Starred parcels stay.";

/** What a ✕ took, for its Undo: the parcels and their log entries. */
interface Removed {
  parcels: WorkingParcel[];
  log: HistoryLog;
}

export function History({
  parcels,
  rows,
  screens,
  log,
  me,
}: {
  /** This person's History, newest first (favorites.ts historyOf). */
  parcels: readonly WorkingParcel[];
  rows: ReadonlyMap<string, LibraryRow>;
  screens: ReadonlyMap<string, KeptScreen>;
  log: HistoryLog;
  me: string | null;
}) {
  const [clearing, setClearing] = useState(false);
  const [removed, setRemoved] = useState<Removed | null>(null);
  useEffect(() => {
    if (!removed) return;
    const timer = setTimeout(() => setRemoved(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [removed]);

  const remove = (key: string) => {
    const entry = log.graded[key];
    const gone = clearMyHistory([key]);
    if (gone.length)
      setRemoved({
        parcels: gone,
        log: { ...EMPTY_LOG, graded: entry ? { [key]: entry } : {} },
      });
  };
  const undo = () => {
    if (removed) restoreToHistory(removed.parcels, removed.log);
    setRemoved(null);
  };
  const unstarred = parcels.some((p) => !isFavorite(p));

  return (
    <>
      {parcels.length === 0 ? (
        <p className="muted">
          {HISTORY_EMPTY} <Link href="/explore">Go to the map</Link>
        </p>
      ) : (
        <>
          <ul className="hist-list">
            {parcels.map((p) => (
              <HistoryRow
                key={p.key}
                p={p}
                r={rows.get(p.key!)}
                kept={screens.get(p.key!)}
                graded={log.graded[p.key!] ?? null}
                me={me}
                remove={() => remove(p.key!)}
              />
            ))}
          </ul>
          {unstarred && (
            <p className="hist-clear">
              <button className="btn secondary small" onClick={() => setClearing(true)}>
                Clear history
              </button>
            </p>
          )}
        </>
      )}
      {clearing && (
        <ResetConfirm
          question={CLEAR_QUESTION}
          action="Clear"
          keep="Keep"
          reset={() => {
            clearMyHistory();
            setClearing(false);
            setRemoved(null);
          }}
          cancel={() => setClearing(false)}
        />
      )}
      {removed && (
        <div className="hist-toast" role="status">
          <span>Removed from History.</span>
          <button className="btn secondary small" onClick={undo}>
            Undo
          </button>
        </div>
      )}
    </>
  );
}

function HistoryRow({
  p,
  r,
  kept,
  graded,
  me,
  remove,
}: {
  p: WorkingParcel;
  r: LibraryRow | undefined;
  kept: KeptScreen | undefined;
  graded: string | null;
  me: string | null;
  remove(): void;
}) {
  const name = r?.name ?? p.name;
  const fav = isFavorite(p);
  const mine = r?.grades[0]?.graded ?? null;
  const result = kept?.state === "ok" ? kept.result : null;
  const prefill = () =>
    starName(p, { acres: r?.acres ?? null, road: result?.driveFrom?.road ?? null, county: countyOf(p) });
  return (
    <li className="hist-row">
      <Star
        on={fav}
        name={name}
        prefill={prefill}
        star={(n) => starParcel(p.key!, n)}
        unstar={() => unstarParcel(p.key!)}
        adder={p.addedBy && p.addedBy !== me ? memberName(p.addedBy) : null}
      />
      <div className="hist-body">
        <span className="hist-name" title={name}>
          {name}
        </span>
        <span className="tiny muted">
          {[
            r?.acres != null ? `${r.acres.toFixed(1)} ac` : null,
            graded ? `Graded ${when(graded)}` : `Changed ${when(p.updatedAt)}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
      <span className="hist-grade" title={mine ? "Your grade" : undefined}>
        {mine ? (
          <span className={`card-grade small g-${mine.grade ?? "none"}`}>{mine.grade ?? "–"}</span>
        ) : (
          <span className="tiny muted">–</span>
        )}
      </span>
      <Link className="btn secondary small hist-open" href="/explore" onClick={() => openOnMap(p)}>
        Open on the map
      </Link>
      {fav ? (
        <span className="hist-x-space" aria-hidden="true" />
      ) : (
        <button
          className="hist-x"
          aria-label={`Remove from History: ${name}`}
          title="Remove from History"
          onClick={remove}
        >
          ×
        </button>
      )}
    </li>
  );
}
