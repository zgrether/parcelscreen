"use client";
/**
 * The parcel's one action (step 4c, docs/plans/step-4c-map-layout.md §2–§3): "Grade this parcel" before the first run,
 * "Grading…" with Cancel while one runs, and after a run only with a reason ("Grade again: boundary changed", "Try again:
 * 3 sources didn't load", …; lib/client/gradeButton.ts). In the toolbar on a desktop; under the sheet's header on a
 * phone, where the toolbar has no room for it (owner, 4c Q1). It replaced the header's permanent "Run again".
 */
import { gradeLabel } from "@/lib/client/gradeButton";
import { useScreenItContext } from "@/components/Results/ScreenItContext";

export function GradeAction({ where }: { where: "toolbar" | "sheet" }) {
  const s = useScreenItContext();
  if (!s?.grade || !s.ctl.state.store.open) return null;
  const label = gradeLabel(s.grade);
  const grading = s.grade.kind === "running";
  const cls = where === "toolbar" ? "tb-btn grade-btn" : "btn grade-btn sheet-grade";
  return (
    <span className={where === "toolbar" ? "grade-action" : "grade-action sheet"}>
      <button
        className={cls}
        // Another parcel's run, or none to run yet (no boundary): the button waits.
        disabled={grading || s.running || !s.parcel}
        onClick={s.run}
      >
        {label}
      </button>
      {grading && (
        <button className={where === "toolbar" ? "tb-btn quiet" : "btn secondary"} onClick={s.cancel}>
          Cancel
        </button>
      )}
    </span>
  );
}
