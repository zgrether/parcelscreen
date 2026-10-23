"use client";
/**
 * Adjust for this parcel (step 12, docs/plans/step-12-raise-the-grade.md §3): in a row's or a Must's panel, the person
 * overrides the letter or the Must's result, or sets it aside on this parcel, each with a required reason; an
 * adjustment they made shows instead, with Remove and its Undo. Only their own grade changes.
 */
import { useId, useState } from "react";
import { ADJUST_REASON_MAX, adjustKey, type Adjustment } from "@/lib/report/adjust";
import { ADJUST_WORDS as W, adjustedWords, APPLIES_AT } from "@/lib/report/adjustWords";
import { SITE_ROWS } from "@/lib/report/sites";
import type { Card, GateStatus } from "@/lib/report/card";
import { appValue } from "@/lib/report/cardLines";
import { GATE_KEYS, MINE, ROW_KEYS, type Factor, type Letter } from "@/lib/rubric/types";

const LETTERS: readonly Letter[] = ["A", "B", "C", "D", "F"];

/** What the person is about to save. */
type Choice = { kind: "override"; grade?: Letter; status?: "pass" | "fail" } | { kind: "setAside" };

export interface AdjustProps {
  factor: Factor;
  /** The adjustment the person has on this factor here, if any. */
  existing: Adjustment | null;
  /** What the app says, without the person's adjustments. */
  app: { grade?: Letter | null; status?: GateStatus };
  /** Graded in the person's rubric (Really want or Nice to have): a letter can be set. */
  graded: boolean;
  /** One of the person's Musts: its result can be set. */
  must: boolean;
  save(a: Choice & { reason: string; was: string }): void;
  /** Removes the adjustment and returns it, so Undo can put it back. */
  remove(): Adjustment | null;
  undo(a: Adjustment): void;
  /** Opened from a suggestion (step 12 §2): its choice made and its reason prefilled, still to be saved. */
  initial?: { choice: "pass" | "setAside"; reason: string } | null;
  /** A site row's: the site the card is graded at, where the override applies (owner, 2026-10-22). */
  site?: number | "house" | null;
}

export function AdjustSection({
  factor,
  existing,
  app,
  graded,
  must,
  save,
  remove,
  undo,
  initial,
  site,
}: AdjustProps) {
  const [choice, setChoice] = useState<Choice | null>(() =>
    !initial || existing
      ? null
      : initial.choice === "pass"
        ? { kind: "override", status: "pass" }
        : { kind: "setAside" },
  );
  const [reason, setReason] = useState(initial?.reason ?? "");
  const [removed, setRemoved] = useState<Adjustment | null>(null);
  const reasonId = useId();
  // What the app said when the adjustment is made: the Must's status for a Must's result, else the letter.
  const was = (c: Choice) =>
    c.kind === "override" && c.status ? (app.status ?? "–") : (app.grade ?? app.status ?? "–");
  const appWord = existing?.status ? (app.status ?? "–") : (app.grade ?? app.status ?? "–");
  const pick = (c: Choice) => {
    setChoice(c);
    setReason("");
  };

  return (
    <section className="adjust" aria-labelledby={`${reasonId}-h`} data-factor={factor}>
      <h3 id={`${reasonId}-h`}>{W.title}</h3>
      {site != null && <p className="tiny muted adjust-site">{APPLIES_AT(site)}</p>}
      {/* The fresh-eyes review: the choices' words alone didn't say how they differ. */}
      {!existing && !removed && !choice && <p className="tiny muted adjust-what">{W.what}</p>}
      {removed ? (
        <p className="adjust-removed" role="status">
          {W.removed}{" "}
          <button
            type="button"
            className="btn secondary small"
            onClick={() => {
              undo(removed);
              setRemoved(null);
            }}
          >
            {W.undo}
          </button>
        </p>
      ) : existing ? (
        <>
          <p className="adjust-now">
            {adjustedWords(existing, appWord)} <q>{existing.reason}</q>
          </p>
          <button type="button" className="btn secondary" onClick={() => setRemoved(remove())}>
            {W.remove}
          </button>
        </>
      ) : !choice ? (
        <div className="adjust-choices">
          {graded && (
            <div role="group" aria-label={W.override} className="adjust-letters">
              <span className="tiny muted">{W.override}</span>
              {/* The app's own letter is shown, marked and not offered (the fresh-eyes review: a gap read as a bug). */}
              {LETTERS.map((l) =>
                l === app.grade ? (
                  <span key={l} className={`chip card-grade g-${l} adjust-app`} title={W.appsLetter}>
                    {l}
                  </span>
                ) : (
                  <button
                    key={l}
                    type="button"
                    className={`chip card-grade g-${l}`}
                    aria-label={`${W.override}: ${l}`}
                    onClick={() => pick({ kind: "override", grade: l })}
                  >
                    {l}
                  </button>
                ),
              )}
            </div>
          )}
          {must && app.status !== "pass" && (
            <button
              type="button"
              className="btn secondary"
              onClick={() => pick({ kind: "override", status: "pass" })}
            >
              {W.pass}
            </button>
          )}
          {must && app.status === "pass" && (
            <button
              type="button"
              className="btn secondary"
              onClick={() => pick({ kind: "override", status: "fail" })}
            >
              {W.fail}
            </button>
          )}
          <button type="button" className="btn secondary" onClick={() => pick({ kind: "setAside" })}>
            {W.setAside}
          </button>
          <p className="tiny muted">{W.yours}</p>
        </div>
      ) : (
        <form
          className="adjust-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!reason.trim()) return;
            save({ ...choice, reason: reason.trim(), was: was(choice) });
            setChoice(null);
          }}
        >
          <p className="adjust-choice">
            {choice.kind === "setAside"
              ? W.setAside
              : choice.grade
                ? `${W.override}: ${choice.grade}`
                : choice.status === "pass"
                  ? W.pass
                  : W.fail}
          </p>
          <label htmlFor={reasonId}>{W.reason}</label>
          <textarea
            id={reasonId}
            rows={1}
            maxLength={ADJUST_REASON_MAX}
            value={reason}
            autoFocus
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="adjust-actions">
            <button type="submit" className="btn" disabled={!reason.trim()}>
              {W.save}
            </button>
            <button type="button" className="btn secondary" onClick={() => setChoice(null)}>
              {W.cancel}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

/**
 * The section's props for a panel, or null where it doesn't apply: the Grade and the cost panels, another member's
 * rubric (you adjust only your own), and a factor the person doesn't count and hasn't adjusted.
 */
export function adjustPropsFor(
  panel: string,
  parcel: string | null | undefined,
  me: string | null,
  appCard: Card,
  existingOf: (key: string) => Adjustment | null,
  writes: {
    save(a: Omit<Adjustment, "key" | "by" | "at">): void;
    remove(key: string): Adjustment | null;
    restore(a: Adjustment): void;
  },
  initial: AdjustProps["initial"] = null,
  /** The site the shown card is graded at (adjust.ts gradedSite). */
  site: number | "house" | null = null,
): AdjustProps | null {
  if (!parcel || !me || appCard.rubric.id !== MINE) return null;
  if (!(GATE_KEYS as readonly string[]).includes(panel) && !(ROW_KEYS as readonly string[]).includes(panel))
    return null;
  const factor = panel as Factor;
  const R = appCard.rubric.rubric;
  const graded = R.ranked.some((c) => c.factor === factor);
  const must = R.musts.some((m) => m.factor === factor);
  const key = adjustKey(parcel, me, factor);
  const existing = existingOf(key);
  if (!graded && !must && !existing) return null;
  return {
    factor,
    existing,
    app: appValue(appCard, factor),
    graded,
    must,
    save: (c) =>
      writes.save({
        parcel,
        factor,
        kind: c.kind,
        ...(c.kind === "override" && c.grade ? { grade: c.grade } : {}),
        ...(c.kind === "override" && c.status ? { status: c.status } : {}),
        reason: c.reason,
        was: c.was,
      }),
    remove: () => writes.remove(key),
    undo: (a) => writes.restore(a),
    initial,
    ...((SITE_ROWS as readonly string[]).includes(factor) && site !== null ? { site } : {}),
  };
}
