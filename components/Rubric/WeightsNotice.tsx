"use client";
/**
 * The first reorder's notice (step 3 plan §3; owner, 10/17): the move has applied and the weights are now rank-sum.
 * "See what changed" opens the before/after table (each item's weight, and the preview parcel's letter and verdict
 * when there is one; no points, owner 10/18); "Undo" restores the order and the explicit weights. It stays until it's
 * dismissed or the next change.
 */
import { useState } from "react";
import { VERDICT_WORD, type Card } from "@/lib/report/card";
import { fmt } from "@/lib/format";
import { weightsTable, type WeightsSwitch } from "@/lib/rubric/edit";

export const NOTICE_TEXT = "Your order now sets the weights.";

export function WeightsNotice({
  switched,
  parcel,
  undo,
  dismiss,
}: {
  switched: WeightsSwitch;
  /** The preview parcel's card before and after the switch, with its name, when there is one (PR 3). */
  parcel?: { name: string; before: Card; after: Card } | null;
  undo(): void;
  dismiss(): void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rubric-notice" role="status" aria-live="polite">
      <p>
        {NOTICE_TEXT}{" "}
        <button
          type="button"
          className="btn secondary small"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? "Hide what changed" : "See what changed"}
        </button>{" "}
        <button type="button" className="btn secondary small" onClick={undo}>
          Undo
        </button>
        <button type="button" className="rubric-notice-x" aria-label="Dismiss" onClick={dismiss}>
          ×
        </button>
      </p>
      {open && (
        <div className="rubric-notice-table">
          <table>
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Before</th>
                <th scope="col">Now</th>
              </tr>
            </thead>
            <tbody>
              {/* In the list's order now: the weights fall with the rank, and Don't care's are 0. */}
              {weightsTable(switched)
                .sort((a, b) => b.after - a.after)
                .map((r) => (
                  <tr key={r.key}>
                    <th scope="row">{r.label}</th>
                    <td className="num">{fmt(r.before, 1)}%</td>
                    <td className="num">{fmt(r.after, 1)}%</td>
                  </tr>
                ))}
            </tbody>
          </table>
          {parcel && (
            <p className="tiny">
              {parcel.name}: {parcel.before.grade ?? "–"} · {VERDICT_WORD[parcel.before.verdict]} →{" "}
              {parcel.after.grade ?? "–"} · {VERDICT_WORD[parcel.after.verdict]}
            </p>
          )}
          <p className="tiny muted">
            How much each counts: the first item counts most and each one below counts less. An item in Nice
            to have counts three quarters of what it would in Really want.
          </p>
        </div>
      )}
    </section>
  );
}
