"use client";
/**
 * Recent (8c; step 8's History, docs/plans/step-8-favorites.md §3): the parcels this person graded that aren't on the
 * list, newest first, the 50 newest within 60 days of their last grade or opening (favorites.ts recentOf), theirs alone.
 * Each row is one line (Z-8, UX part 2 PR 7b): the name (a tap opens it on the map), their letter, its acres, $/ac over
 * the date, ★ (add to the list) and ✕ (gone for good, with Undo for a few seconds; after that its screens leave this
 * device). Clear removes them all at once.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ADJUSTED_TITLE } from "@/lib/report/adjustWords";
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

const when = (iso: string) => new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });

/** What Recent keeps (Z-8, UX part 2 PR 7b). */
export const RECENT_LEAD = "Every parcel you've graded or opened, for 60 days (the last 50).";
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
          {RECENT_EMPTY}{" "}
          <Link className="link-btn" href="/explore">
            Go to the map
          </Link>
        </p>
      ) : (
        <>
          <p className="tiny muted">{RECENT_LEAD}</p>
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
  const router = useRouter();
  // Z-2: on the map, the one panel, and "‹ Your list" back to Recent.
  const back = () => ({ label: "Your list", href: "/library", scroll: window.scrollY });
  const mine = r?.grades[0]?.graded ?? null;
  const result = kept?.state === "ok" ? kept.result : null;
  const prefill = () =>
    starName(p, { acres: r?.acres ?? null, road: result?.driveFrom?.road ?? null, county: countyOf(p) });
  return (
    // Z-8 (UX part 2 PR 7b): one line, the name wrapping to two at most; a tap on it opens the parcel (Z-2).
    <li className="hist-row recent-line">
      <button
        type="button"
        className="hist-name link-btn"
        title={name}
        onClick={() => {
          openOnMap(p, back());
          router.push("/explore");
        }}
      >
        {name}
      </button>
      <span className="recent-grade" title={mine ? "Your grade" : undefined}>
        {mine ? (
          <>
            <span className={`card-grade small g-${mine.grade ?? "none"}`}>{mine.grade ?? "–"}</span>
            {mine.adjusted && (
              <span className="adjusted-mark" title={ADJUSTED_TITLE} aria-label={ADJUSTED_TITLE}>
                ✎
              </span>
            )}
          </>
        ) : (
          <span className="tiny muted">–</span>
        )}
      </span>
      <span className="recent-acres">{r?.acres != null ? `${r.acres.toFixed(1)} ac` : "–"}</span>
      <span className="recent-when tiny muted" title={r?.perAcre?.both ?? undefined}>
        {/* Step 10b: the price per acre, "≠" when the listing's and the boundary's acres differ; then the date. */}
        <span>{r?.perAcre ? `${r.perAcre.text}${r.perAcre.differs ? " ≠" : ""}` : "–"}</span>
        {/* Polish 2 (L2): the date says what it's the date of. */}
        <span>{graded ? `Graded ${when(graded)}` : `Updated ${when(p.updatedAt)}`}</span>
      </span>
      {/* Only parcels off the list are in Recent: the star adds one, which moves it to the Shortlist. */}
      <Star
        on={false}
        name={name}
        prefill={prefill}
        star={(n) => starParcel(p.key!, n)}
        unstar={() => undefined}
        adder={null}
        className="recent-star"
      />
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
