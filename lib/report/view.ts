/**
 * Long view's words (step 11, docs/plans/step-11-new-data.md §2.4): the card row's line, and the report section's table
 * of each site's view. Pure; the card (card.ts longView) and the Long view block read it.
 */
import { compass, fmt } from "../format";
import { SCREEN_CONSTANTS } from "../screen/config";
import type { PartialScreenResult } from "../screen/types";
import type { Heading } from "./parts";

export const viewHeading: Heading = { title: "Long view", slug: "long-view", help: "h-view" };

const K = SCREEN_CONSTANTS.view;

interface View {
  longestKm: number;
  past: boolean;
  openShare: number;
  dirDeg: number | null;
}

/** "6+ km" past the profile's reach, else "3.2 km". */
export const longestWords = (v: Pick<View, "longestKm" | "past">): string =>
  v.past ? `${fmt(K.reachKm)}+ km` : `${fmt(v.longestKm, 1)} km`;

/** "22%". */
export const openPct = (v: Pick<View, "openShare">): number => Math.round(v.openShare * 100);

/** "the view opens past 5 km over 22% of the horizon, toward the NW; the longest 6+ km" or "no view past 5 km; …". */
export function viewLine(v: View): string {
  const pct = openPct(v);
  const open =
    pct === 0
      ? `no view past ${fmt(K.openKm)} km`
      : `the view opens past ${fmt(K.openKm)} km over ${pct}% of the horizon${
          pct === 100 ? ", all around" : v.dirDeg === null ? "" : `, toward the ${compass(v.dirDeg)}`
        }`;
  return `${open}; the longest ${longestWords(v)}`;
}

/** The sources' limits, kept with the numbers (CLAUDE.md: the data's caveats are part of the product's honesty). */
export const VIEW_CAVEAT =
  `The skyline every 5°, traced from 2 m above the site over the 30 m bare-earth elevation out to ${fmt(K.reachKm)} km: ` +
  `trees aren't in it, so a view through woods needs clearing, and a ridge past ${fmt(K.reachKm)} km reads as open.`;

export interface ViewRowView {
  label: string;
  view: View;
}

/** The report section: each site's view (and the house's), or null when not measured. */
export function viewView(r: PartialScreenResult): { rows: ViewRowView[] } | null {
  const spots = [
    ...(r.house && !("outside" in r.house) && r.house.view
      ? [{ label: "The marked house", view: r.house.view }]
      : []),
    ...(r.sites ?? []).flatMap((s) => (s.view ? [{ label: `Site #${s.rank}`, view: s.view }] : [])),
  ];
  return spots.length ? { rows: spots } : null;
}
