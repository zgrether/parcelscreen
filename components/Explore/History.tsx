"use client";
/**
 * History (13e): every built parcel, newest first, with Open and Remove. Remove is the only way a parcel
 * leaves History (and the map); nothing expires. Remove asks once, inline. It lives in the app menu (owner,
 * after 14d), which closes when a parcel is opened (`onOpened`). Two recipes of one record say what tells them
 * apart (historyRows).
 */
import { useEffect, useMemo, useState } from "react";
import { shortPrice } from "@/lib/client/askingPrice";
import { milestonesLine, statusLine } from "@/lib/client/parcelStatus";
import { historyRows } from "@/lib/client/historyRows";
import type { WorkingParcel } from "@/lib/client/parcelStore";
import { viewedRubric } from "@/lib/client/rubrics";
import { needsRescreen, readScreen, RESCREENS_ON_OPEN } from "@/lib/client/screenStore";
import { reportCard, type Card } from "@/lib/report/card";
import { drawnOf } from "@/lib/report/marks";
import { useExplore } from "./useExploreController";

const when = (iso: string) =>
  new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function History({ onOpened }: { onOpened?: () => void }) {
  const ctl = useExplore();
  const { built, open } = ctl.state.store;
  const [confirming, setConfirming] = useState<string | null>(null);
  const rows = useMemo(() => new Map(historyRows(built).map((r) => [r.key, r])), [built]);
  const latest = useLatest(built);

  return (
    <section className="block">
      <h2>History</h2>
      {ctl.cleared && (
        <div className="report-note cleared-note" role="status">
          <p className="m-0">
            Saved results from an older version of Parcel Screen were cleared. Your parcels, notes and houses
            are kept; each re-screens when you open it.
            {ctl.cleared.dropped.length > 0 &&
              ` Dropped (couldn't be re-screened): ${ctl.cleared.dropped.length} parcel${ctl.cleared.dropped.length === 1 ? "" : "s"} (${ctl.cleared.dropped.join(", ")}).`}
          </p>
          <button className="link-btn" onClick={ctl.dismissCleared}>
            OK
          </button>
        </div>
      )}
      {built.length === 0 ? (
        <p className="tiny muted">
          Parcels you build (combine, split, draw onto, mark the house on) are kept here and on the map, until
          you remove them.
        </p>
      ) : (
        <ul className="m-0 grid list-none gap-2 p-0">
          {[...built]
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .map((b) => {
              const { name, acres, tellApart } = rows.get(b.key!)!;
              const isOpen = open?.key === b.key;
              return (
                <li key={b.key} className="grid grid-cols-[1fr_auto] items-baseline gap-x-2.5">
                  <span>
                    <b>{name}</b>
                    {/* The card's verdict for the latest kept screen (owner, #110), in the grade last shown. */}
                    {latest.get(b.key!)?.card && <VerdictDot card={latest.get(b.key!)!.card!} />}
                    {isOpen && <span className="muted"> · open</span>}{" "}
                    {tellApart ? (
                      <span className="muted num">{tellApart}</span>
                    ) : (
                      acres !== null && <span className="muted num">{acres.toFixed(2)} ac</span>
                    )}
                    {b.askingPrice !== null && (
                      <span className="muted num"> · {shortPrice(b.askingPrice)}</span>
                    )}
                  </span>
                  <span className="row row-span-2 self-center gap-3">
                    {confirming === b.key ? (
                      <>
                        <span className="tiny">Remove it?</span>
                        <button
                          className="text-steep cursor-pointer underline"
                          onClick={() => {
                            ctl.removeSaved(b.key!);
                            setConfirming(null);
                          }}
                        >
                          Yes
                        </button>
                        <button
                          className="text-water cursor-pointer underline"
                          onClick={() => setConfirming(null)}
                        >
                          No
                        </button>
                      </>
                    ) : (
                      <>
                        {!isOpen && (
                          <button
                            className="text-water cursor-pointer underline"
                            onClick={() => {
                              ctl.openSaved(b.key!);
                              onOpened?.();
                            }}
                          >
                            Open
                          </button>
                        )}
                        <button
                          className="text-water cursor-pointer underline"
                          onClick={() => setConfirming(b.key)}
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </span>
                  <span className="tiny muted">
                    {when(b.updatedAt)}
                    {latest.get(b.key!)?.rescreen && ` · ${RESCREENS_ON_OPEN}`}
                    {/* Its standing (WF2): Saved or archived, and the milestones; in progress goes unsaid. */}
                    {[b.status !== "inProgress" ? statusLine(b) : "", milestonesLine(b)]
                      .filter(Boolean)
                      .map((t) => ` · ${t}`)
                      .join("")}
                  </span>
                </li>
              );
            })}
        </ul>
      )}
    </section>
  );
}

function VerdictDot({ card }: { card: Card }) {
  return (
    <span
      className={`hist-dot v-${card.verdict.toLowerCase()}`}
      role="img"
      aria-label={`${card.verdict}, grade ${card.grade ?? "none"}`}
      title={`${card.grade ?? "–"} · ${card.verdict}`}
    />
  );
}

/**
 * What each History entry's latest kept screen says: whether it will re-screen when opened (owner, #101: gone, v3's
 * clean break, or from earlier rules, Batch A §6), and otherwise its report card (owner, #110). Read from the kept
 * screens, so it's known once IndexedDB answers; an entry never screened, or a browser that keeps nothing, has
 * nothing to say.
 */
function useLatest(
  built: readonly WorkingParcel[],
): ReadonlyMap<string, { rescreen: boolean; card: Card | null }> {
  const [keys, setKeys] = useState<ReadonlyMap<string, { rescreen: boolean; card: Card | null }>>(new Map());
  // With each entry's names for its drawn lines (owner, 2026-10-14): the card's sentences read a line by its name; and
  // its markers (WF4), which the card reads too.
  const latest = built.flatMap((b) =>
    b.key && b.screenIds.length
      ? [[b.key, b.screenIds.at(-1)!, drawnOf(b.markup, b.drivewayLine)] as const]
      : [],
  );
  const sig = latest
    .map(
      ([k, id, d]) =>
        `${k}:${id}:${[...d.names].join(";")}:${JSON.stringify(d.marks)}:${d.driveway}:${[...(d.records ?? [])].join(";")}`,
    )
    .join(",");
  useEffect(() => {
    let alive = true;
    const rubric = viewedRubric();
    void Promise.all(
      latest.map(async ([k, id, names]) => {
        const r = await readScreen(id);
        const rescreen = needsRescreen(r);
        const card = r.kind === "ok" && !rescreen ? reportCard(r.record.result, rubric, names) : null;
        return [k, { rescreen, card }] as const;
      }),
    ).then((entries) => {
      if (alive) setKeys(new Map(entries));
    });
    return () => {
      alive = false;
    };
    // `sig` stands for `latest`: the effect re-reads only when an entry's latest screen or its lines' names change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  return keys;
}
