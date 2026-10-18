"use client";
/**
 * The rubric editor's state (step 3, docs/plans/step-3-rubric-editor.md §3, §6.4): the profile's own rubric, saved at
 * once on every change (the profile's `ps.rubrics`, so every page re-grades without a re-screen); Undo for the last ten
 * changes; Reset; and the notice the first reorder raises when it switches the weights to rank-sum (owner, 10/17: no
 * confirm, the notice shows what changed, and its Undo restores the order and the explicit weights).
 */
import { useCallback, useState } from "react";
import { moveCard, resetToDefault, type EditorCard, type WeightsSwitch } from "@/lib/rubric/edit";
import type { Tier } from "@/lib/rubric/words";
import type { Rubric } from "@/lib/rubric/types";
import { effectiveRubrics, setProfileRubrics } from "./rubrics";

/** Changes Undo can take back. */
export const UNDO_DEPTH = 10;

export interface MyRubric {
  rubric: Rubric;
  /** What the last change did or why it was refused, said once in the status line. */
  message: string | null;
  /** Set by the first reorder that switched the weights; cleared by Dismiss, Undo or the next change. */
  switched: WeightsSwitch | null;
  /** The rubric just before that switch: the notice grades the preview parcel with it and with the one now. */
  switchedFrom: Rubric | null;
  canUndo: boolean;
  /** Any change: a move's result, a slider, a minimum. */
  apply(next: Rubric, message?: string | null): void;
  move(card: EditorCard, to: Tier, index?: number): void;
  undo(): void;
  reset(): void;
  /** Sets the list to `next` as one change, Undo-able ("Reset to my answers"). */
  resetTo(next: Rubric): void;
  dismissNotice(): void;
}

function save(mine: Rubric): void {
  setProfileRubrics({ ...effectiveRubrics(), mine });
}

export function useMyRubric(): MyRubric {
  const [rubric, setRubric] = useState<Rubric>(() => effectiveRubrics().mine);
  const [history, setHistory] = useState<Rubric[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [switched, setSwitched] = useState<WeightsSwitch | null>(null);
  const [switchedFrom, setSwitchedFrom] = useState<Rubric | null>(null);

  const commit = useCallback(
    (next: Rubric, msg: string | null, sw: WeightsSwitch | null) => {
      if (next === rubric) {
        setMessage(msg);
        return;
      }
      setHistory((h) => [...h, rubric].slice(-UNDO_DEPTH));
      setRubric(next);
      setMessage(msg);
      setSwitched(sw);
      setSwitchedFrom(sw ? rubric : null);
      save(next);
    },
    [rubric],
  );

  const apply = useCallback((next: Rubric, msg: string | null = null) => commit(next, msg, null), [commit]);

  const move = useCallback(
    (card: EditorCard, to: Tier, index?: number) => {
      const out = moveCard(rubric, card, to, index);
      if (!out.ok) {
        setMessage(out.reason);
        return;
      }
      commit(out.rubric, out.message ?? null, out.switched ?? null);
    },
    [rubric, commit],
  );

  const undo = useCallback(() => {
    const prev = history.at(-1);
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setRubric(prev);
    setMessage("Undone.");
    setSwitched(null);
    save(prev);
  }, [history]);

  const reset = useCallback(() => commit(resetToDefault(), null, null), [commit]);

  return {
    rubric,
    message,
    switched,
    switchedFrom,
    canUndo: history.length > 0,
    apply,
    move,
    undo,
    reset,
    resetTo: (next: Rubric) => commit(next, null, null),
    dismissNotice: () => setSwitched(null),
  };
}
