"use client";
/**
 * The parcel panel's switch (step 8b, docs/plans/step-8b-parcel-panel.md §2): Grade, step 7's answer and card; Uses,
 * step 14's What you can do here (docs/plans/step-14-land-uses.md §6 B); and Details, everything about the parcel. Under
 * the panel's header on a desktop and in the phone's sheet; step 8's Favorites | History switch in style. Details is the
 * explorer's `info` (selecting a line or mark, a placed mark and the toolbar's acres turn it on), and wins over Uses.
 */
import type { ExploreController } from "@/components/Explore/useExploreController";
import { panelView, type PanelView } from "@/components/Explore/exploreState";
import { USE_WORDS } from "@/lib/uses/words";

const SEGMENTS: readonly { view: PanelView; label: string }[] = [
  { view: "grade", label: "Grade" },
  { view: "uses", label: USE_WORDS.tab },
  { view: "details", label: "Details" },
];

export function ParcelSwitch({ ctl }: { ctl: ExploreController }) {
  const view = panelView(ctl.state);
  const show = (v: PanelView) => {
    if (v === "details") ctl.setInfo(true);
    else if (v === "uses") ctl.setUses(true);
    else ctl.setInfo(false);
  };
  return (
    <div className="parcel-switch" role="tablist" aria-label="Grade, uses or details">
      {SEGMENTS.map((s) => (
        <button
          key={s.view}
          role="tab"
          aria-selected={view === s.view}
          className="parcel-switch-seg"
          onClick={() => show(s.view)}
        >
          {s.label}
        </button>
      ))}
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
