"use client";
/**
 * The phone sheet collapsed to one slim row (docs/plans/map-room.md §1): the parcel, its verdict and letter, its acres
 * and ×, over a mostly open map. Ungraded, a small Grade button takes the verdict's place; while a grade runs, the step
 * it's on. A tap anywhere but its buttons opens the sheet (useBottomSheet's line grip); × closes the parcel, as the
 * header's does. Collapsing clears nothing.
 */
import type { PointerEvent } from "react";
import { reportCard } from "@/lib/report/card";
import { verdictParts } from "@/lib/report/answer";
import { acresLabel } from "@/lib/report/acres";
import { gradeProgress } from "@/lib/client/gradeProgress";
import { isPreview } from "@/lib/client/samples";
import type { GradeButton } from "@/lib/client/gradeButton";
import { drawnFor, type ScreenIt } from "./ScreenIt";

/** The line's button, shorter than the header's: the reason is one tap up, on the full button. */
const SHORT: Record<Exclude<GradeButton["kind"], "running">, string> = {
  first: "Grade",
  stopped: "Try again",
  again: "Grade again",
  retry: "Try again",
};

interface Grip {
  onPointerDown(e: PointerEvent<HTMLElement>): void;
  onPointerMove(e: PointerEvent<HTMLElement>): void;
  onPointerUp(): void;
  onPointerCancel(): void;
}

export function SheetLine({ s, grip }: { s: ScreenIt; grip: Grip }) {
  const open = s.ctl.state.store.open;
  if (!open) return null;
  const d = s.ctl.derived;
  const name = s.ctl.layers?.name ?? "Parcel";
  const card =
    !s.runningHere && !s.stale && s.shown ? reportCard(s.shown.result, s.rubric, drawnFor(s)) : null;
  const answer = card ? verdictParts(card) : null;
  const acres = acresLabel(open.facts?.survey?.acres, d?.ok ? d.acres : null);
  const grading = s.grade?.kind === "running";
  const button = s.grade && s.grade.kind !== "running" && !isPreview(open) ? s.grade : null;
  const p = grading ? gradeProgress(s.steps) : null;
  return (
    <div className="sheet-line" data-grip="line" {...grip}>
      <span className="sl-name" title={name}>
        {name}
      </span>
      {p ? (
        <span className="sl-progress" role="status" aria-label={p.text}>
          <span className="grade-progress-step">{p.step}</span>{" "}
          <span className="grade-progress-count">{p.count}</span>
        </span>
      ) : (
        <>
          {card && answer && (
            <span className={`sh-card v-${card.verdict.toLowerCase()}`} title={card.reason}>
              <span className="sh-word">{answer.verdict}</span>
              <span className={`card-grade small g-${card.grade ?? "none"}`}>{answer.grade}</span>
            </span>
          )}
          {/* With a verdict and a button both, the acres give way: they're in the header, one tap up. */}
          {acres && !(card && button) && <span className="sl-acres">{acres}</span>}
          {button && (
            <button className="btn sl-grade" disabled={s.running || !s.parcel} onClick={s.run}>
              {SHORT[button.kind]}
            </button>
          )}
        </>
      )}
      <button
        className="sh-x"
        aria-label="Close this parcel"
        title="Close this parcel"
        onClick={() => s.ctl.dismiss()}
      >
        ×
      </button>
    </div>
  );
}
