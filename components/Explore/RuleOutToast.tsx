"use client";
/**
 * "Ruled out — Undo" (P-4, UX part 2): Not for us can be undone for TOAST_MS, as a deleted line can (LineUndoToast);
 * after that, Move back in Details does it.
 */
import { useEffect } from "react";
import { useExplore } from "./useExploreController";
import { TOAST_MS } from "./SwitchToast";

export function RuleOutToast() {
  const ctl = useExplore();
  const u = ctl.ruleOutUndo;
  const { dismissRuleOutUndo } = ctl;
  useEffect(() => {
    if (!u) return;
    const timer = setTimeout(dismissRuleOutUndo, TOAST_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one timer per ruling (its `at`)
  }, [u?.at]);
  if (!u) return null;
  return (
    <div className="switch-toast line-undo" role="status">
      <span>Ruled out —</span>
      <button onClick={ctl.undoRuleOut}>Undo</button>
    </div>
  );
}
