/**
 * Privacy's words (step 11, docs/plans/step-11-new-data.md §2.3): the report section's table of each site's houses, and
 * the sources' caveat. Pure; the card (card.ts privacy) and the Privacy block read it.
 */
import { fmt } from "../format";
import type { PartialScreenResult } from "../screen/types";
import type { Heading } from "./parts";

export const privacyHeading: Heading = { title: "Privacy", slug: "privacy", help: "h-privacy" };

/** How the houses in sight are counted: over bare earth, so as if the leaves were down. */
export const IN_WINTER = "in winter, with leaves down";

/** The sources' limits, kept with the numbers (CLAUDE.md: the data's caveats are part of the product's honesty). */
export const PRIVACY_CAVEAT =
  "Houses are building footprints of 60 m² (650 ft²) and up that Microsoft found in aerial imagery from 2020 on: a " +
  "house under trees, or built since, can be missing, and a big barn can count. In sight means a straight line from " +
  "eye height at the site to the house's roof clears the ground, trees not counted: it's the view in winter, with the " +
  "leaves down. Summer leaves hide more.";

/** Where the houses come from, for "How it's scored" and the report (plan §3; checked 2026-10-21). */
export const PRIVACY_SOURCES =
  "Building footprints: Microsoft Global ML Building Footprints (CDLA Permissive 2.0).";

export interface PrivacyRowView {
  label: string;
  near: number;
  inSight: number;
  nearestFt: number | null;
}

/** The report section: each site's houses (and the house's), or null when not measured. */
export function privacyView(r: PartialScreenResult): { outside: boolean; rows: PrivacyRowView[] } | null {
  if (!r.privacy) return null;
  const spots = [
    ...(r.house && !("outside" in r.house) ? [{ label: "The marked house", privacy: r.house.privacy }] : []),
    ...(r.sites ?? []).map((s) => ({ label: `Site #${s.rank}`, privacy: s.privacy })),
  ];
  const rows = spots.flatMap((x) => (x.privacy ? [{ label: x.label, ...x.privacy }] : []));
  return { outside: r.privacy.outside, rows };
}

/** "1,100 ft" or "none within a mile". */
export const nearestWords = (ft: number | null): string =>
  ft === null ? "none within a mile" : `${fmt(ft)} ft`;
