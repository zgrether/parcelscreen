"use client";
/**
 * "Track 2 deleted — Undo" (owner, A, 2026-10-13): a deleted line can be put back for TOAST_MS, as the
 * parcel-switch toast. The line's own details live in the Info panel's Layers tree (owner, #127).
 */
import { useEffect } from "react";
import { useExplore } from "@/components/Explore/useExploreController";
import { TOAST_MS } from "@/components/Explore/SwitchToast";

export function LineUndoToast() {
  const ctl = useExplore();
  const u = ctl.lineUndo;
  const { dismissLineUndo } = ctl;
  useEffect(() => {
    if (!u) return;
    const timer = setTimeout(dismissLineUndo, TOAST_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one timer per deletion (its `at`)
  }, [u?.at]);
  if (!u) return null;
  return (
    <div className="switch-toast line-undo" role="status">
      <span>{u.markup.name} deleted —</span>
      <button onClick={ctl.undoLineDelete}>Undo</button>
    </div>
  );
}
