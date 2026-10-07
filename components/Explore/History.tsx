"use client";
/**
 * History (13e): every built parcel, newest first, with Open and Remove. Remove is the only way a parcel
 * leaves History (and the map); nothing expires. Remove asks once, inline. It lives in the app menu (owner,
 * after 14d), which closes when a parcel is opened (`onOpened`). Two recipes of one record say what tells them
 * apart (historyRows).
 */
import { useMemo, useState } from "react";
import { historyRows } from "@/lib/client/historyRows";
import { useExplore } from "./useExploreController";

const when = (iso: string) =>
  new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function History({ onOpened }: { onOpened?: () => void }) {
  const ctl = useExplore();
  const { built, open } = ctl.state.store;
  const [confirming, setConfirming] = useState<string | null>(null);
  const rows = useMemo(() => new Map(historyRows(built).map((r) => [r.key, r])), [built]);

  return (
    <section className="block">
      <h2>History</h2>
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
                    {isOpen && <span className="muted"> · open</span>}{" "}
                    {tellApart ? (
                      <span className="muted num">{tellApart}</span>
                    ) : (
                      acres !== null && <span className="muted num">{acres.toFixed(2)} ac</span>
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
                  <span className="tiny muted">{when(b.updatedAt)}</span>
                </li>
              );
            })}
        </ul>
      )}
    </section>
  );
}
