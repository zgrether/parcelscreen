"use client";
/**
 * Ruled out (UX part 2 PR 7a; the audit's P-5): its own view on Your list, beside Shortlist and Recent. Each row says
 * when and why ("Ruled out Oct 14: Septic"), with the verdict and letter; a tap on the name opens it on the map (Z-2),
 * and Move back returns it to where it was (the list, or the adder's Recent).
 */
import type { WorkingParcel } from "@/lib/client/parcelStore";
import { statusLine, withRestore } from "@/lib/client/parcelStatus";
import type { LibraryRow } from "@/lib/client/library";
import type { ReactNode } from "react";

export const RULED_OUT_WORDS = {
  lead: "Parcels you said aren't for you, with why. Move back returns one to where it was.",
  empty: "Parcels you rule out show here, with why. Not for us is on each parcel.",
  moveBack: "Move back",
};

export function RuledOut({
  parcels,
  rows,
  open,
  change,
  grade,
}: {
  parcels: readonly WorkingParcel[];
  rows: ReadonlyMap<string, LibraryRow>;
  open(key: string): void;
  change(key: string, edit: (p: WorkingParcel) => WorkingParcel): void;
  /** The viewer's verdict and letter, as the list's rows show them. */
  grade(r: LibraryRow): ReactNode;
}) {
  if (!parcels.length) return <p className="muted">{RULED_OUT_WORDS.empty}</p>;
  return (
    <>
      <p className="tiny muted">{RULED_OUT_WORDS.lead}</p>
      <ul className="hist-list ruled-list" aria-label="Ruled out">
        {parcels.map((p) => {
          const r = rows.get(p.key!);
          if (!r) return null;
          return (
            <li key={p.key} className="hist-row ruled-row">
              <span className="ruled-main">
                <button className="link-btn hist-name" onClick={() => open(p.key!)}>
                  {r.name}
                </button>
                <span className="tiny muted ruled-why">{statusLine(p)}</span>
              </span>
              <span className="hist-grade">{grade(r)}</span>
              <button className="btn secondary small ruled-back" onClick={() => change(p.key!, withRestore)}>
                {RULED_OUT_WORDS.moveBack}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
