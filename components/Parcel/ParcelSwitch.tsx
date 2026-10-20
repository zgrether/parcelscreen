"use client";
/**
 * The parcel panel's switch (step 8b, docs/plans/step-8b-parcel-panel.md §2): Grade, step 7's answer and card, and
 * Details, everything about the parcel. Under the panel's header on a desktop and in the phone's sheet; step 8's
 * Favorites | History switch in style. Details is the explorer's `info` (selecting a line or mark, a placed mark and the
 * toolbar's acres turn it on).
 */
import type { ExploreController } from "@/components/Explore/useExploreController";

export function ParcelSwitch({ ctl }: { ctl: ExploreController }) {
  const details = ctl.state.info;
  return (
    <div className="parcel-switch" role="tablist" aria-label="Grade or details">
      <button
        role="tab"
        aria-selected={!details}
        className="parcel-switch-seg"
        onClick={() => ctl.setInfo(false)}
      >
        Grade
      </button>
      <button
        role="tab"
        aria-selected={details}
        className="parcel-switch-seg"
        onClick={() => ctl.setInfo(true)}
      >
        Details
      </button>
    </div>
  );
}

/** Grade, for a parcel never graded (step 8b): the grade button is just above, in the toolbar or the sheet. */
export const NOT_GRADED = "Not graded yet. Grade this parcel to see how it does.";

/**
 * The toolbar's acres asks for Details at Boundary (step 8b, plan §4). Details scrolls there as it mounts, or at once
 * when it's showing; the phone's sheet rises.
 */
export const SHOW_BOUNDARY = "ps:show-boundary";
let wanted = false;
export function showBoundary(): void {
  wanted = true;
  window.dispatchEvent(new Event(SHOW_BOUNDARY));
}
/** Whether Boundary was asked for since the last look (and no longer). */
export function takeBoundary(): boolean {
  const w = wanted;
  wanted = false;
  return w;
}
