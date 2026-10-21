"use client";
/**
 * Recent (8c; step 8's History, docs/plans/step-8-favorites.md §3): the parcels this person graded that aren't on the
 * list, newest first, the 20 newest within 30 days (favorites.ts recentOf), theirs alone. Each row: the name, its acres
 * and when it was graded, their grade, Add to list, Open on the map, and ✕ (gone for good, with Undo for a few
 * seconds; after that its screens leave this device). Clear removes them all at once. A table on a desktop, cards on a
 * phone (CSS).
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { Star } from "@/components/Favorites/Star";
import { ResetConfirm } from "@/components/Rubric/ResetConfirm";
import { TOAST_MS } from "@/components/Explore/SwitchToast";
import { countyOf, EMPTY_LOG, starName, type HistoryLog } from "@/lib/client/favorites";
import { clearMyHistory, dropScreensOf, restoreToHistory, starParcel } from "@/lib/client/favoritesStore";
import { RECENT_EMPTY, type LibraryRow } from "@/lib/client/library";
import { openOnMap } from "@/lib/client/openOnMap";
import type { WorkingParcel } from "@/lib/client/parcelStore";
import type { KeptScreen } from "@/lib/client/useKeptScreens";
import { VERDICT_WORD } from "@/lib/report/card";

const when = (iso: string) => new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });

export const CLEAR_QUESTION = "Clear your Recent list? Parcels on your list stay.";

/** What a ✕ took, for its Undo: the parcels and their log entries. */
interface Removed {
  parcels: WorkingParcel[];
  log: HistoryLog;
}

export function Recent({
  parcels,
  rows,
  screens,
  log,
}: {
  /** This person's Recent, newest first (favorites.ts recentOf). */
  parcels: readonly WorkingParcel[];
  rows: ReadonlyMap<string, LibraryRow>;
  screens: ReadonlyMap<string, KeptScreen>;
  log: HistoryLog;
}) {
  const [clearing, setClearing] = useState(false);
  const [removed, setRemoved] = useState<Removed | null>(null);
  useEffect(() => {
    if (!removed) return;
    const timer = setTimeout(() => {
      dropScreensOf(removed.parcels);
      setRemoved(null);
    }, TOAST_MS);
    return () => clearTimeout(timer);
  }, [removed]);

  const remove = (key: string) => {
    const entry = log.graded[key];
    if (removed) dropScreensOf(removed.parcels); // a newer ✕ ends the last one's Undo
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

  return (
    <>
      {parcels.length === 0 ? (
        <p className="muted">
          {RECENT_EMPTY} <Link href="/explore">Go to the map</Link>
        </p>
      ) : (
        <>
          <ul className="hist-list">
            {parcels.map((p) => (
              <RecentRow
                key={p.key}
                p={p}
                r={rows.get(p.key!)}
                kept={screens.get(p.key!)}
                graded={log.graded[p.key!] ?? null}
                remove={() => remove(p.key!)}
              />
            ))}
          </ul>
          <p className="hist-clear">
            <button className="btn secondary small" onClick={() => setClearing(true)}>
              Clear Recent
            </button>
          </p>
        </>
      )}
      {clearing && (
        <ResetConfirm
          question={CLEAR_QUESTION}
          action="Clear"
          keep="Keep"
          reset={() => {
            if (removed) dropScreensOf(removed.parcels);
            dropScreensOf(clearMyHistory());
            setClearing(false);
            setRemoved(null);
          }}
          cancel={() => setClearing(false)}
        />
      )}
      {removed && (
        <div className="hist-toast" role="status">
          <span>Removed from Recent.</span>
          <button className="btn secondary small" onClick={undo}>
            Undo
          </button>
        </div>
      )}
    </>
  );
}

function RecentRow({
  p,
  r,
  kept,
  graded,
  remove,
}: {
  p: WorkingParcel;
  r: LibraryRow | undefined;
  kept: KeptScreen | undefined;
  graded: string | null;
  remove(): void;
}) {
  const name = r?.name ?? p.name;
  const mine = r?.grades[0]?.graded ?? null;
  const result = kept?.state === "ok" ? kept.result : null;
  const prefill = () =>
    starName(p, { acres: r?.acres ?? null, road: result?.driveFrom?.road ?? null, county: countyOf(p) });
  return (
    <li className="hist-row">
      <div className="hist-body">
        <span className="hist-name" title={name}>
          {name}
        </span>
        <span className="tiny muted" title={r?.perAcre?.both ?? undefined}>
          {[
            r?.acres != null ? `${r.acres.toFixed(1)} ac` : null,
            // Step 10b: the price per acre, "≠" when the listing's and the boundary's acres differ.
            r?.perAcre ? `${r.perAcre.text}${r.perAcre.differs ? " ≠" : ""}` : null,
            graded ? `Graded ${when(graded)}` : `Changed ${when(p.updatedAt)}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
      <span className="hist-grade" title={mine ? "Your grade" : undefined}>
        {mine ? (
          <>
            <span className={`card-grade small g-${mine.grade ?? "none"}`}>{mine.grade ?? "–"}</span>
            {/* Step 10b: the verdict word beside the letter, as Favorites shows it. */}
            <span className={`card-word small v-${mine.verdict.toLowerCase()}`}>
              {VERDICT_WORD[mine.verdict]}
            </span>
          </>
        ) : (
          <span className="tiny muted">–</span>
        )}
      </span>
      <span className="hist-actions">
        {/* Only parcels off the list are in Recent: adding one moves it to Favorites. */}
        <Star
          words
          on={false}
          name={name}
          prefill={prefill}
          star={(n) => starParcel(p.key!, n)}
          unstar={() => undefined}
          adder={null}
        />
        <Link className="btn secondary small hist-open" href="/explore" onClick={() => openOnMap(p)}>
          Open on the map
        </Link>
      </span>
      <button
        className="hist-x"
        aria-label={`Remove from Recent: ${name}`}
        title="Remove from Recent"
        onClick={remove}
      >
        ×
      </button>
    </li>
  );
}
