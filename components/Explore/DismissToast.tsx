"use client";
/**
 * "Closed. Undo" (8c): after × on a parcel that isn't on the list. Undo brings it back, open, from memory (no
 * re-grade); after DISMISS_MS it's gone for good, and its screens leave this device.
 */
import { useEffect } from "react";
import { useExplore } from "./useExploreController";

/** How long the Undo stays (owner, 8c: about 6 s). */
export const DISMISS_MS = 6000;

export function DismissToast() {
  const ctl = useExplore();
  const d = ctl.dismissed;
  const { endDismiss } = ctl;
  useEffect(() => {
    if (!d) return;
    const timer = setTimeout(endDismiss, DISMISS_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one timer per dismiss (its `at`)
  }, [d?.at]);
  if (!d) return null;
  return (
    <div className="switch-toast dismiss-toast" role="status">
      <span>Closed.</span>
      <button onClick={ctl.undoDismiss}>Undo</button>
    </div>
  );
}
