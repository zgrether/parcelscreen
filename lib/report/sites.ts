/**
 * Highest capability (step 7, docs/plans/step-7-results.md §2): each person's homesites ranked by their own rubric,
 * over the rows that differ from site to site, so the parcel is graded at the best it can be for them. Display-time
 * arithmetic over the stored sites: no re-screen. Then the alternatives worth showing beside the best (§1.3).
 *
 * The rows themselves are the card's (card.ts siteRows); this module only weighs and orders them, and imports the card
 * for types alone.
 */
import { distance, point } from "@turf/turf";
import { SCREEN_CONSTANTS } from "../screen/config";
import type { LatLon } from "../geo/types";
import type { Site } from "../screen/types";
import { thresholdStatus } from "../rubric/musts";
import type { RowKey, Rubric } from "../rubric/types";
import { weightsOf } from "../rubric/weights";
import type { Row } from "./card";

/**
 * The rows read at a site (§2): Garden ground stays the parcel's (§11 Q1), and Trails and Town are timed from the
 * entrance, so they're the same at every site. Step 11: Climate, by each site's elevation.
 */
export const SITE_ROWS: readonly RowKey[] = [
  "elevation",
  "homesite",
  "sky",
  "room",
  "driveway",
  "climate",
  "privacy",
];

/** What a site needs to pass before its score counts (§2): the build fits, and the person's site-level musts. */
export type SiteCheck = "fit" | "flood" | "driveway" | RowKey;

export interface RankedSite {
  /** Index into the result's `sites` (the engine's order). */
  index: number;
  /** The engine's rank: the site's pin number ("site #3"). */
  rank: number;
  ll: LatLon;
  /** The site-varying rows read at it, for this person's bands. */
  rows: Row[];
  /** The weighted points of the rows this person ranks, on 0–100 (A 100 … F 0); null when none is ranked or graded. */
  score: number | null;
  /** The checks it fails, in SiteCheck order. */
  fails: SiteCheck[];
}

/** What a stored site offers the checks. */
export type SiteFacts = Pick<Site, "rank" | "ll" | "fit" | "flood" | "driveway">;

/** Whether a row counts for this rubric: ranked (Should or Could), not Don't care. */
const counts = (R: Rubric, key: RowKey): boolean =>
  !R.wonts.includes(key) && R.ranked.some((c) => c.factor === key);

/** A site's score: the weighted mean of its counted site rows' points, as a share of an A, on 0–100. */
export function siteScore(rows: readonly Row[], R: Rubric): number | null {
  const w = weightsOf(R);
  const graded = rows.filter((x) => SITE_ROWS.includes(x.key) && x.grade !== null && counts(R, x.key));
  const total = graded.reduce((a, x) => a + w[x.key], 0);
  if (!(total > 0) || !(R.points.A > 0)) return null;
  const pts = graded.reduce((a, x) => a + w[x.key] * R.points[x.grade!], 0) / total;
  return (100 * pts) / R.points.A;
}

/**
 * The checks a site fails (§2): the build doesn't fit; it's in a flood zone, when Floodplain is a Must; no practical
 * driveway reaches it, or it needs an easement, when Easement needed is a Must; a limit on a site row it doesn't meet.
 */
export function siteFails(s: SiteFacts, rows: readonly Row[], R: Rubric): SiteCheck[] {
  const gate = (key: string) => R.musts.some((m) => m.factor === key && m.threshold === undefined);
  const dw = s.driveway;
  const fails: SiteCheck[] = [];
  if (s.fit !== "fits") fails.push("fit");
  if (gate("floodplain") && s.flood) fails.push("flood");
  if (gate("easement") && (dw === null || (dw && (dw.noPractical || dw.needsEasement))))
    fails.push("driveway");
  for (const must of R.musts) {
    if (must.threshold === undefined || !SITE_ROWS.includes(must.factor as RowKey)) continue;
    const row = rows.find((x) => x.key === must.factor);
    if (row && thresholdStatus(must, row.measure) === "fail") fails.push(must.factor as RowKey);
  }
  return fails;
}

/**
 * The sites, best first for this person (§2): those that pass the checks first (the fewest failures), then the
 * highest score, then the engine's order (its build-cost ranking breaks ties). `rowsAt(i)` reads the card's site rows
 * at the i-th site.
 */
export function rankSites(
  sites: readonly SiteFacts[],
  rowsAt: (i: number) => Row[],
  R: Rubric,
): RankedSite[] {
  return sites
    .map((s, index) => {
      const rows = rowsAt(index).filter((x) => SITE_ROWS.includes(x.key));
      return { index, rank: s.rank, ll: s.ll, rows, score: siteScore(rows, R), fails: siteFails(s, rows, R) };
    })
    .sort(
      (a, b) => a.fails.length - b.fails.length || (b.score ?? -1) - (a.score ?? -1) || a.index - b.index,
    );
}

/** Metres between two [lat, lon] points. */
export const metresBetween = (a: LatLon, b: LatLon): number =>
  distance(point([a[1], a[0]]), point([b[1], b[0]]), { units: "meters" });

export interface Choices {
  /** Up to `alternatives` sites: real choices beside the best. */
  alternatives: RankedSite[];
  /** The other ranked sites, in the person's order: behind "N more spots". */
  more: RankedSite[];
}

/**
 * The alternatives (§1.3): the next sites in the person's order whose score is within `withinPoints` of the anchor's
 * (the best site, which isn't listed), that pass as many checks, and that are at least `apartM` from the anchor and
 * from each other; at most `alternatives` of them. With a marked house as the anchor (§11 Q6), which has no site
 * score, only the distance applies.
 */
export function choicesBeside(
  ranked: readonly RankedSite[],
  anchor: { ll: LatLon; score: number | null; fails: number; index: number | null },
  K = SCREEN_CONSTANTS.card.sites,
): Choices {
  const rest = ranked.filter((s) => s.index !== anchor.index);
  const alternatives: RankedSite[] = [];
  for (const s of rest) {
    if (alternatives.length >= K.alternatives) break;
    const close =
      anchor.index === null ||
      (s.fails.length <= anchor.fails &&
        (anchor.score === null || (s.score !== null && s.score >= anchor.score - K.withinPoints)));
    const apart = [anchor.ll, ...alternatives.map((a) => a.ll)].every(
      (ll) => metresBetween(ll, s.ll) >= K.apartM,
    );
    if (close && apart) alternatives.push(s);
  }
  return { alternatives, more: rest.filter((s) => !alternatives.includes(s)) };
}
