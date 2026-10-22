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

/** Distances in miles, as the rest of the app (owner, #272); the cutoffs stay in km. */
const KM_PER_MI = 1.609344;
const mi = (km: number): string => `${fmt(km / KM_PER_MI, 1)} mi`;

/** "3.1 mi": the distance the view must reach to count as open. */
export const VIEW_OPEN_MI = mi(K.openKm);

/** "3.7+ mi" past the profile's reach, else "2.0 mi". */
export const longestWords = (v: Pick<View, "longestKm" | "past">): string =>
  v.past ? `${fmt(K.reachKm / KM_PER_MI, 1)}+ mi` : mi(v.longestKm);

/** "22%". */
export const openPct = (v: Pick<View, "openShare">): number => Math.round(v.openShare * 100);

/** "the view opens past 3.1 mi over 22% of the horizon, toward the NW; the longest 3.7+ mi" or "no view past 3.1 mi; …". */
export function viewLine(v: View): string {
  const pct = openPct(v);
  const open =
    pct === 0
      ? `no view past ${VIEW_OPEN_MI}`
      : `the view opens past ${VIEW_OPEN_MI} over ${pct}% of the horizon${
          pct === 100 ? ", all around" : v.dirDeg === null ? "" : `, toward the ${compass(v.dirDeg)}`
        }`;
  return `${open}; the longest ${longestWords(v)}`;
}

/** The sources' limits, kept with the numbers (CLAUDE.md: the data's caveats are part of the product's honesty). */
export const VIEW_CAVEAT =
  `The skyline every 5°, traced from 7 ft above the site over the bare-earth elevation (a 98 ft grid) out to ${mi(K.reachKm)}: ` +
  `trees aren't in it, so a view through woods needs clearing, and a ridge past ${mi(K.reachKm)} reads as open.`;

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
