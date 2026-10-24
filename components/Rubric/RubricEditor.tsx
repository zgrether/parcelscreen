"use client";
/**
 * "What matters to you" (step 3, docs/plans/step-3-rubric-editor.md; renamed by the owner, 10/18: "My priorities" in
 * the menu, `/priorities`; "rubric" stays the code's name): the profile's own rubric in four columns, edited by
 * dragging or by each card's sheet, saved at once (every page re-grades; nothing asks for a re-screen), with Undo for
 * the last ten changes and Reset behind a confirm. Other rubrics the profile holds are read-only until step 5.
 */
import Link from "next/link";
import { GRADES_ID, GRADES_TITLE } from "@/lib/client/help";
import { useCallback, useEffect, useState } from "react";
import { effectiveRubrics, profileRubrics } from "@/lib/client/rubrics";
import { markDrivewayNoteSeen, pendingDrivewayNote, undoDrivewayAdd } from "@/lib/client/drivewayAdd";
import {
  factorsNote,
  markFactorsSeen,
  newQuestionsHref,
  pendingFactors,
  undoFactorsAdd,
} from "@/lib/client/factorsAdd";
import { reportCard } from "@/lib/report/card";
import { useMyRubric } from "@/lib/client/useMyRubric";
import type { EditorCard } from "@/lib/rubric/edit";
import { MINE, type Factor, type RowKey, type Rubric } from "@/lib/rubric/types";
import { acceptNudge, markNudge, pendingNudge } from "@/lib/client/nudge";
import { moveDown, movedWords, nudgeWords } from "@/lib/rubric/nudge";
import type { Tier } from "@/lib/rubric/words";
import { CardSheet } from "./CardSheet";
import { RESET_QUESTION, RESET_TO_ANSWERS_QUESTION, ResetConfirm } from "./ResetConfirm";
import { getPref, setPref } from "@/lib/client/prefs";
import { hasAnswers, whyContext } from "@/lib/client/myAnswers";
import { interviewLabel } from "@/lib/rubric/interview/doc";
import { rubricFromAnswers } from "@/lib/rubric/interview/generate";
import { RubricColumns, TIER_NAMES } from "./RubricColumns";
import { RubricPreview, type Hover, type PreviewParcel } from "./RubricPreview";
import { WeightsNotice } from "./WeightsNotice";

/** What each Reset puts back (polish #30). */
export const RESET_NOTES = {
  answers: "Reset to my answers puts back the list your answers made.",
  start: "Reset to the starting list puts back the app's own list.",
} as const;

export const PAGE_TITLE = "What matters to you";

/** The intro (owner, 10/18): what the list is, each column in a line, and how to use it. */
export const INTRO = "Every parcel you screen is graded against this list.";
export const TIER_LINES = [
  [TIER_NAMES.must, "a parcel that misses one is out."],
  [TIER_NAMES.should, "counts most toward the grade; the higher in the list, the more it counts."],
  [TIER_NAMES.could, "counts a little."],
  [TIER_NAMES.wont, "ignored."],
] as const;
export const HOW_TO =
  "Drag items between columns, or select one to move it or change its limit. Changes save automatically and apply to every parcel you've screened.";

/** The sheet a ?limit=<factor> link asks for: the factor's limit when it has one, else its card. */
function sheetFromUrl(r: Rubric): EditorCard | null {
  const factor = new URLSearchParams(window.location.search).get("limit");
  if (!factor) return null;
  const m = r.musts.find((x) => x.factor === factor && x.threshold !== undefined);
  return m ? { kind: "minimum", factor: m.factor as RowKey } : { kind: "factor", factor: factor as Factor };
}

export function RubricEditor() {
  const my = useMyRubric();
  // Owner, 10/23: /priorities?limit=<factor> (the area box's "Change it") opens with that factor's limit, or its card.
  const [sheet, setSheet] = useState<EditorCard | null>(() => sheetFromUrl(my.rubric));
  const [confirmReset, setConfirmReset] = useState<"start" | "answers" | null>(null);
  // The profile's interview (step 4): its why lines, its quiet list, and "Reset to my answers".
  const [answers, setAnswers] = useState(() => getPref("ps.interview"));
  const why = whyContext(answers);
  const resetToAnswers = () => {
    if (!hasAnswers(answers)) return;
    const made = rubricFromAnswers(answers.answers).rubric;
    my.resetTo(made);
    const next = { ...answers, base: made };
    setPref("ps.interview", next);
    setAnswers(next);
  };
  // "Before" for the preview: the rubric as the page opened with it.
  const [baseline] = useState(() => effectiveRubrics().mine);
  const [hover, setHover] = useState<Hover>(null);
  const [parcel, setParcel] = useState<PreviewParcel | null>(null);
  const noticeParcel =
    my.switched && my.switchedFrom && parcel
      ? {
          name: parcel.name,
          before: reportCard(
            parcel.result,
            { id: "before", name: "Before", rubric: my.switchedFrom },
            parcel.drawn,
          ),
          after: reportCard(parcel.result, { id: "now", name: "Now", rubric: my.rubric }, parcel.drawn),
        }
      : null;
  const others = profileRubrics().filter((r) => r.id !== MINE);
  const close = useCallback(() => setSheet(null), []);
  // Step 7 (owner, #216): the one-time note on the Driveway row added to these priorities, with its Undo.
  const [driveNote, setDriveNote] = useState(() => pendingDrivewayNote());
  useEffect(() => {
    if (driveNote) markDrivewayNoteSeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as the page opens
  }, []);
  const undoDriveway = () => {
    const without = undoDrivewayAdd();
    if (without) my.resetTo(without);
    setDriveNote(null);
  };
  // Step 11 (plan §1): the one notice on the new factors added to these priorities, with its Undo.
  const [newFactors, setNewFactors] = useState(() => pendingFactors());
  useEffect(() => {
    if (newFactors.length) markFactorsSeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as the page opens
  }, []);
  const undoFactors = () => {
    const without = undoFactorsAdd(newFactors);
    if (without) my.resetTo(without);
    setNewFactors([]);
  };
  // Step 12 (plan §3): the learning nudge, offered once; after Move it down, its Undo.
  const [nudge, setNudge] = useState(() => pendingNudge());
  const [moved, setMoved] = useState<{ factor: Factor; to: Tier; before: Rubric } | null>(null);
  useEffect(() => {
    if (nudge) markNudge(nudge.factor, "offered");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as the page opens
  }, []);
  const moveItDown = () => {
    if (!nudge) return;
    const before = my.rubric;
    const { rubric, to } = acceptNudge(nudge.factor, before);
    my.resetTo(rubric);
    setMoved({ factor: nudge.factor, to, before });
    setNudge(null);
  };
  const undoMove = () => {
    if (!moved) return;
    markNudge(moved.factor, "undone");
    my.resetTo(moved.before);
    setMoved(null);
  };

  return (
    <>
      <main className="compare rubric-editor">
        <header className="compare-head">
          <h1>{PAGE_TITLE}</h1>
          <Link className="link-btn" href={`/help#${GRADES_ID}`}>
            {GRADES_TITLE}
          </Link>
        </header>

        <section className="rubric-intro" aria-label="How this page works">
          <p>{INTRO}</p>
          <ul>
            {TIER_LINES.map(([name, line]) => (
              <li key={name}>
                <strong>{name}:</strong> {line}
              </li>
            ))}
          </ul>
          <p className="muted">{HOW_TO}</p>
        </section>

        <RubricPreview rubric={my.rubric} baseline={baseline} hover={hover} onParcel={setParcel} />

        <div className="rubric-bar">
          <p className="rubric-status" role="status" aria-live="polite">
            {my.message}
          </p>
          <span className="rubric-bar-actions">
            <button type="button" className="btn secondary small" disabled={!my.canUndo} onClick={my.undo}>
              Undo
            </button>
            {hasAnswers(answers) && (
              <button
                type="button"
                className="btn secondary small"
                onClick={() => setConfirmReset("answers")}
              >
                Reset to my answers
              </button>
            )}
            <button type="button" className="btn secondary small" onClick={() => setConfirmReset("start")}>
              Reset to the starting list
            </button>
            {/* The questions, beside the Resets (step 4b, plan §8): out of the header, which holds the heading. */}
            <Link className="link-btn rubric-questions" href="/interview">
              {interviewLabel(answers)}
            </Link>
          </span>
          {/* Polish #30: what each Reset puts back, in a line. */}
          <p className="tiny muted rubric-reset-note">
            {hasAnswers(answers) ? `${RESET_NOTES.answers} ` : ""}
            {RESET_NOTES.start}
          </p>
        </div>
        {confirmReset && (
          <ResetConfirm
            question={confirmReset === "answers" ? RESET_TO_ANSWERS_QUESTION : RESET_QUESTION}
            reset={() => {
              if (confirmReset === "answers") resetToAnswers();
              else my.reset();
              setConfirmReset(null);
            }}
            cancel={() => setConfirmReset(null)}
          />
        )}

        {driveNote && (
          <div className="card-stale rubric-new" role="status">
            <span>{driveNote}</span>
            <button type="button" className="btn small" onClick={undoDriveway}>
              Undo
            </button>
            <button type="button" className="btn secondary small" onClick={() => setDriveNote(null)}>
              OK
            </button>
          </div>
        )}

        {newFactors.length > 0 && (
          <div className="card-stale rubric-new-factors" role="status">
            <span>
              {factorsNote(newFactors)}. They&apos;re placed from your answers: drag one to move it.
            </span>
            {newQuestionsHref(newFactors) && (
              <Link className="btn small" href={newQuestionsHref(newFactors)!}>
                Answer the new questions
              </Link>
            )}
            <button type="button" className="btn secondary small" onClick={undoFactors}>
              Take them out
            </button>
            <button type="button" className="btn secondary small" onClick={() => setNewFactors([])}>
              Keep them
            </button>
          </div>
        )}

        {nudge && (
          <div className="card-stale rubric-nudge" role="status">
            <span>{nudgeWords(nudge)}</span>
            {/* The fresh-eyes review: say where it goes. */}
            <button type="button" className="btn small" onClick={moveItDown}>
              Move it to {TIER_NAMES[moveDown(my.rubric, nudge.factor).to]}
            </button>
            <button
              type="button"
              className="btn secondary small"
              onClick={() => {
                markNudge(nudge.factor, "declined");
                setNudge(null);
              }}
            >
              No thanks
            </button>
          </div>
        )}

        {moved && (
          <div className="card-stale rubric-nudge" role="status">
            <span>{movedWords(moved.factor, moved.to)}</span>
            <button type="button" className="btn secondary small" onClick={undoMove}>
              Undo
            </button>
            <button type="button" className="btn secondary small" onClick={() => setMoved(null)}>
              OK
            </button>
          </div>
        )}

        {my.switched && (
          <WeightsNotice switched={my.switched} parcel={noticeParcel} dismiss={my.dismissNotice} />
        )}

        <RubricColumns rubric={my.rubric} move={my.move} open={setSheet} onHover={setHover} />

        {others.length > 0 && (
          <p className="tiny muted">
            {others.map((o) => o.name).join(", ")}: their lists are shown elsewhere and can&apos;t be edited
            here yet.
          </p>
        )}

        {sheet && (
          <CardSheet
            card={sheet}
            rubric={my.rubric}
            apply={my.apply}
            move={my.move}
            close={close}
            why={why}
          />
        )}
      </main>
    </>
  );
}
