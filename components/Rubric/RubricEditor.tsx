"use client";
/**
 * "What matters to you" (step 3, docs/plans/step-3-rubric-editor.md; renamed by the owner, 10/18: "My priorities" in
 * the menu, `/priorities`; "rubric" stays the code's name): the profile's own rubric in four columns, edited by
 * dragging or by each card's sheet, saved at once (every page re-grades; nothing asks for a re-screen), with Undo for
 * the last ten changes and Reset behind a confirm. Other rubrics the profile holds are read-only until step 5.
 */
import Link from "next/link";
import { useCallback, useState } from "react";
import { HelpProvider } from "@/components/Help/HelpDialog";
import { ProfilePicker } from "@/components/Profile/ProfilePicker";
import { effectiveRubrics, profileRubrics } from "@/lib/client/rubrics";
import { reportCard } from "@/lib/report/card";
import { useMyRubric } from "@/lib/client/useMyRubric";
import type { EditorCard } from "@/lib/rubric/edit";
import { MINE } from "@/lib/rubric/types";
import { CardSheet } from "./CardSheet";
import { ResetConfirm } from "./ResetConfirm";
import { RubricColumns, TIER_NAMES } from "./RubricColumns";
import { RubricPreview, type Hover, type PreviewParcel } from "./RubricPreview";
import { WeightsNotice } from "./WeightsNotice";

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
  "Drag items between columns, or tap one to move it or change its limit. Changes save automatically and apply to every parcel you've screened.";

export function RubricEditor() {
  const my = useMyRubric();
  const [sheet, setSheet] = useState<EditorCard | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
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

  return (
    <HelpProvider>
      <main className="compare rubric-editor">
        <header className="compare-head">
          <Link className="link-btn" href="/explore">
            ← Map
          </Link>
          <h1>{PAGE_TITLE}</h1>
          <ProfilePicker />
          <Link className="link-btn" href="/rulebook">
            What the grade means
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

        <div className="rubric-bar">
          <p className="rubric-status" role="status" aria-live="polite">
            {my.message}
          </p>
          <button type="button" className="btn secondary small" disabled={!my.canUndo} onClick={my.undo}>
            Undo
          </button>
          <button type="button" className="btn secondary small" onClick={() => setConfirmReset(true)}>
            Reset to the starting list
          </button>
        </div>
        {confirmReset && (
          <ResetConfirm
            reset={() => {
              my.reset();
              setConfirmReset(false);
            }}
            cancel={() => setConfirmReset(false)}
          />
        )}

        {my.switched && (
          <WeightsNotice
            switched={my.switched}
            parcel={noticeParcel}
            undo={my.undo}
            dismiss={my.dismissNotice}
          />
        )}

        <div className="rubric-body">
          <RubricColumns rubric={my.rubric} move={my.move} open={setSheet} onHover={setHover} />
          <RubricPreview rubric={my.rubric} baseline={baseline} hover={hover} onParcel={setParcel} />
        </div>

        {others.length > 0 && (
          <p className="tiny muted">
            {others.map((o) => o.name).join(", ")}: their lists are shown elsewhere and can&apos;t be edited
            here yet.
          </p>
        )}

        {sheet && <CardSheet card={sheet} rubric={my.rubric} apply={my.apply} move={my.move} close={close} />}
      </main>
    </HelpProvider>
  );
}
