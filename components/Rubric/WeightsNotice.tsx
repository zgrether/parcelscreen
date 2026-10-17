"use client";
/**
 * The first reorder's notice (step 3 plan §3; owner, 10/17): the move has applied and the weights are now rank-sum.
 * "See what changed" opens the before/after table (each row's weight, and the preview parcel's points, letter and
 * verdict when there is one); "Undo" restores the order and the explicit weights. It stays until it's dismissed or
 * the next change.
 */
import { useState } from "react";
import type { Card } from "@/lib/report/card";
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
        <button type="button" className="link-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
          See what changed
        </button>{" "}
        ·{" "}
        <button type="button" className="link-btn" onClick={undo}>
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
                <th scope="col">Row</th>
                <th scope="col">Before</th>
                <th scope="col">Now</th>
              </tr>
            </thead>
            <tbody>
              {weightsTable(switched).map((r) => (
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
              {parcel.name}: {fmt(parcel.before.points ?? NaN, 2)} {parcel.before.grade ?? "–"} ·{" "}
              {parcel.before.verdict} → {fmt(parcel.after.points ?? NaN, 2)} {parcel.after.grade ?? "–"} ·{" "}
              {parcel.after.verdict}
            </p>
          )}
          <p className="tiny muted">
            Rank weights: your first card counts most and each one below counts less; Could cards count three
            quarters.
          </p>
        </div>
      )}
    </section>
  );
}
