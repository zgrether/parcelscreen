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

/** Distances in miles, as the rest of the app (owner, #272). */
const KM_PER_MI = 1.609344;
const mi = (km: number): string => `${fmt(km / KM_PER_MI, 1)} mi`;

/** "3 mi": the distance the view must reach to count as open (owner, #273: a cutoff in miles). */
export const VIEW_OPEN_MI = `${fmt(K.openMi)} mi`;

/** The profile's reach is the data's range, not a choice (owner, #273): said as such. */
const PAST_REACH = `farther than ${mi(K.reachKm)}`;

/** "reaches farther than 3.7 mi (as far as the app measures)" past the profile's reach, else "2.0 mi": after "the longest". */
export const longestWords = (v: Pick<View, "longestKm" | "past">): string =>
  v.past ? `reaches ${PAST_REACH} (as far as the app measures)` : mi(v.longestKm);

/** The short value's: "farther than 3.7 mi", or "2.0 mi". */
export const longestShort = (v: Pick<View, "longestKm" | "past">): string =>
  v.past ? PAST_REACH : mi(v.longestKm);

/** "22%". */
export const openPct = (v: Pick<View, "openShare">): number => Math.round(v.openShare * 100);

/** The short form, the card's and the report table's: "25% open, farther than 3.7 mi" or "8% open, 2.0 mi". */
export const viewShort = (v: View): string => `${openPct(v)}% open, ${longestShort(v)}`;

/** Under the report's table of sites, which uses the short form (owner, #273). */
export const VIEW_TABLE_NOTE = `Views are measured out to ${mi(K.reachKm)}; '${PAST_REACH}' means the view runs past that.`;

/**
 * "the view opens past 3 mi over 22% of the horizon, toward the NW; the longest reaches farther than 3.7 mi (as far as the app
 * measures)" or "no view past 3 mi; …".
 */
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
