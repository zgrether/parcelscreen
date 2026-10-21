"use client";
/**
 * "{parcel} is on Your list. Reopen it" (step 17e; polish after 8b; "is in Recent" when it isn't on the list, 8c): after leaving a parcel that has a screen, by switching or with
 * the ×. Reopen it brings it back, with its overlays live if its session is still kept. It goes after about 5 s, when
 * a newer one replaces it, or when a map tool starts.
 */
import { useEffect } from "react";
import { useExplore } from "./useExploreController";

/** How long the toast stays (owner, 17e: ~5 s). */
export const TOAST_MS = 5000;

export function SwitchToast() {
  const ctl = useExplore();
  const t = ctl.toast;
  const { dismissToast } = ctl;
  useEffect(() => {
    if (!t) return;
    const timer = setTimeout(dismissToast, TOAST_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one timer per toast (its `at`)
  }, [t?.at]);
  if (!t) return null;
  return (
    <div className="switch-toast" role="status">
      {/* Polish: a whole sentence, and a button that says what it does. */}
      {/* 8c: a parcel not on the list is in Recent. */}
      <span>
        {t.name} is {t.listed ? "on Your list" : "in Recent"}.
      </span>
      <button onClick={ctl.back}>Reopen it</button>
    </div>
  );
}
