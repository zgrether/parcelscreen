"use client";
/**
 * "Split 1 removed — Undo" (owner, after #312): a removed split can be put back for TOAST_MS, as a deleted line can
 * (LineUndoToast). Its pieces' screens come back with it.
 */
import { useEffect } from "react";
import { useExplore } from "@/components/Explore/useExploreController";
import { TOAST_MS } from "@/components/Explore/SwitchToast";
import { SPLIT_WORDS } from "@/lib/split/words";

export function ScenarioUndoToast() {
  const ctl = useExplore();
  const u = ctl.scenarioUndo;
  const { dismissScenarioUndo } = ctl;
  useEffect(() => {
    if (!u) return;
    const timer = setTimeout(dismissScenarioUndo, TOAST_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one timer per removal (its `at`)
  }, [u?.at]);
  if (!u) return null;
  return (
    <div className="switch-toast line-undo" role="status">
      <span>{SPLIT_WORDS.removed(u.scenario.name)}</span>
      <button onClick={ctl.undoScenarioRemove}>{SPLIT_WORDS.undo}</button>
    </div>
  );
}
