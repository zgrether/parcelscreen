"use client";
/**
 * What the start-up sweep cleared (v3's clean break, B2a): kept results from an older version are deleted once, their
 * parcels kept to re-screen when opened. It was said at the top of History; History went in step 4b, so it's said on
 * the map, once, until OK.
 */
import { useExplore } from "./useExploreController";

export function ClearedNote() {
  const ctl = useExplore();
  const c = ctl.cleared;
  if (!c) return null;
  return (
    <div className="switch-toast cleared-note" role="status">
      <span>
        Saved results from an older version of Parcel Screen were cleared. Your parcels, notes and houses are
        kept; each grades again when you open it.
        {c.dropped.length > 0 &&
          ` Dropped (couldn't be graded again): ${c.dropped.length} parcel${c.dropped.length === 1 ? "" : "s"} (${c.dropped.join(", ")}).`}
      </span>
      <button onClick={ctl.dismissCleared}>OK</button>
    </div>
  );
}
