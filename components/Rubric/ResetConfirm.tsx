"use client";
/**
 * Reset's confirm (owner, 10/18): a real dialog with styled buttons, Reset in the destructive style. The focus starts on
 * Cancel, and Escape or a tap outside cancels, so a stray Enter never wipes the list.
 */
import { useEffect, useRef } from "react";

export const RESET_QUESTION = "Reset to the starting list? This undoes all your changes.";
/** "Reset to my answers" (step 4, §6.3): the same dialog. */
export const RESET_TO_ANSWERS_QUESTION = "Reset to your answers? This undoes the changes you made since.";

export function ResetConfirm({
  reset,
  cancel,
  question = RESET_QUESTION,
}: {
  reset(): void;
  cancel(): void;
  question?: string;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && cancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cancel]);
  return (
    <div className="rubric-sheet-scrim" onClick={cancel}>
      <div
        className="rubric-sheet rubric-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="reset-question"
        onClick={(e) => e.stopPropagation()}
      >
        <p id="reset-question">{question}</p>
        <div className="rubric-confirm-actions">
          <button type="button" className="btn danger" onClick={reset}>
            Reset
          </button>
          <button ref={cancelRef} type="button" className="btn secondary" onClick={cancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
