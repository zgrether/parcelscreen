"use client";
/**
 * "My rubric" (step 3, docs/plans/step-3-rubric-editor.md): the profile's own rubric in four columns, edited by
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
import { RubricColumns } from "./RubricColumns";
import { RubricPreview, type Hover, type PreviewParcel } from "./RubricPreview";
import { WeightsNotice } from "./WeightsNotice";

export const NEVER_RESCREEN = "Your grades update everywhere at once. Nothing needs screening again.";

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
          <h1>My rubric</h1>
          <ProfilePicker />
          <Link className="link-btn" href="/rulebook">
            What the grade means
          </Link>
        </header>

        <div className="rubric-bar">
          <p className="rubric-status" role="status" aria-live="polite">
            {my.message ?? "Drag a card, or tap it to move it or set its threshold."}
          </p>
          <button type="button" className="link-btn" disabled={!my.canUndo} onClick={my.undo}>
            Undo
          </button>
          {confirmReset ? (
            <span className="rubric-confirm">
              Back to the default card?{" "}
              <button
                type="button"
                onClick={() => {
                  my.reset();
                  setConfirmReset(false);
                }}
              >
                Reset
              </button>{" "}
              <button type="button" className="link-btn" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
            </span>
          ) : (
            <button type="button" className="link-btn" onClick={() => setConfirmReset(true)}>
              Reset to default
            </button>
          )}
        </div>

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

        <p className="tiny muted rubric-foot">{NEVER_RESCREEN}</p>
        {others.length > 0 && (
          <p className="tiny muted">
            {others.map((o) => o.name).join(", ")}: other rubrics you hold. Editing them comes with the
            household (step 5).
          </p>
        )}

        {sheet && <CardSheet card={sheet} rubric={my.rubric} apply={my.apply} move={my.move} close={close} />}
      </main>
    </HelpProvider>
  );
}
