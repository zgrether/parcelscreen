/**
 * The rubric's cards in plain words (step 3, docs/plans/step-3-rubric-editor.md §2): each factor's label (the card's own,
 * lib/report/card.ts reads them from here), what it asks for at its B/C edge (the edge of "acceptable"), its band, a
 * minimum in words, and why a card is where it is. Pure; the editor renders them.
 */
import { fmt } from "../format";
import { defaultRubric } from "./default";
import type { Bands, Factor, GateKey, MustCard, RowKey, Rubric } from "./types";

/** Each factor's name, as the card's gates and rows show it. */
export const FACTOR_LABELS: Record<Factor, string> = {
  floodplain: "Floodplain",
  access: "Legal road access",
  easement: "Easement needed",
  septic: "Septic",
  elevation: "Elevation at the build site",
  homesite: "Best homesite",
  sky: "Night sky",
  room: "Room to build",
  trails: "Trails and public land",
  town: "Town and hospital",
  garden: "Garden ground",
};

/** The bands a slider moves: each a list of A, B, C and D edges, best first. */
export type BandKey =
  "elevationFt" | "skyMag" | "roomX" | "trailheadMin" | "erMin" | "groceryMin" | "gardenAc";

/** Each row's bands, the editor's sliders (homesite's letter is the site's quality: none). */
export const ROW_BANDS: Record<RowKey, readonly BandKey[]> = {
  elevation: ["elevationFt"],
  homesite: [],
  sky: ["skyMag"],
  room: ["roomX"],
  trails: ["trailheadMin"],
  town: ["erMin", "groceryMin"],
  garden: ["gardenAc"],
};

/** The band a row's minimum is in: the unit of its `measure` (lib/rubric/musts.ts); null when it can't have one. */
export const MINIMUM_BAND: Record<RowKey, BandKey | null> = {
  elevation: "elevationFt",
  homesite: null,
  sky: "skyMag",
  room: "roomX",
  trails: "trailheadMin",
  town: "erMin",
  garden: "gardenAc",
};

/** Which way a band runs: a bigger number is better (at least) or worse (at most). */
export const BAND_RUNS: Record<BandKey, "atLeast" | "atMost"> = {
  elevationFt: "atLeast",
  skyMag: "atLeast",
  roomX: "atLeast",
  trailheadMin: "atMost",
  erMin: "atMost",
  groceryMin: "atMost",
  gardenAc: "atLeast",
};

/** "1.0" → "1", "0.25" stays: a number without trailing zeros. */
const trim = (s: string): string => (s.includes(".") ? s.replace(/\.?0+$/, "") : s);

/** A band's value in its unit: "2,500 ft", "21.2", "2×", "20 min", "0.25 ac". */
export function bandValue(key: BandKey, v: number): string {
  switch (key) {
    case "elevationFt":
      return `${fmt(v)} ft`;
    case "skyMag":
      return fmt(v, 1);
    case "roomX":
      return `${fmt(v, 2).replace(/\.?0+$/, "")}×`;
    case "trailheadMin":
    case "erMin":
    case "groceryMin":
      return `${fmt(v)} min`;
    case "gardenAc":
      return `${fmt(v, 2).replace(/\.?0+$/, "")} ac`;
  }
}

/** The B/C edge: where "acceptable" ends, what a card's words and its slider show. */
export const bcEdge = (bands: Bands, key: BandKey): number => bands[key][1]!;

/** "A 3,000 ft+ · B 2,500 ft · C 2,000 ft · D 1,500 ft" (at most: "A 10 min · B 20 min · …"). */
export function bandLine(bands: Bands, key: BandKey): string {
  const edges = bands[key];
  const plus = BAND_RUNS[key] === "atLeast" ? "+" : "";
  return edges.map((e, i) => `${"ABCD"[i]} ${bandValue(key, e)}${i === 0 ? plus : ""}`).join(" · ");
}

/** What a card asks for, in plain words, at the rubric's own bands. */
export function cardLine(r: Rubric, factor: Factor): string {
  const b = r.bands;
  switch (factor) {
    case "floodplain":
      return "No FEMA flood zone at the build site or on the driveway";
    case "access":
      return "Legal road access: frontage, or a recorded right-of-way";
    case "easement":
      return "The driveway stays on your land, or its easement is recorded";
    case "septic":
      return 'A septic field fits: a soil rates better than "very limited"';
    case "elevation":
      return `Build site at ${bandValue("elevationFt", bcEdge(b, "elevationFt"))} or higher`;
    case "homesite":
      return "A good house site: winter sun, facing and slope";
    case "sky":
      return `A night sky of at least ${bandValue("skyMag", bcEdge(b, "skyMag"))} mag/arcsec²`;
    case "room":
      return `Gentle ground of at least ${bandValue("roomX", bcEdge(b, "roomX"))} the build footprint`;
    case "trails":
      return `A trailhead within a ${fmt(bcEdge(b, "trailheadMin"))}-minute drive (or public land within ${trim(fmt(b.openLandWithinFt / 5280, 1))} mi)`;
    case "town":
      return `An ER within ${bandValue("erMin", bcEdge(b, "erMin"))} and groceries within ${fmt(bcEdge(b, "groceryMin"))}`;
    case "garden":
      return `At least ${bandValue("gardenAc", bcEdge(b, "gardenAc"))} of garden ground`;
  }
}

/** A minimum's own words: "ER within 30 min", "a trailhead within 20 min", "at least 3,000 ft". */
export function minimumWords(row: RowKey, v: number): string {
  const band = MINIMUM_BAND[row];
  if (!band) return "";
  const value = bandValue(band, v);
  if (row === "town") return `ER within ${value}`;
  if (row === "trails") return `a trailhead within ${value}`;
  if (row === "room") return `at least ${value} the footprint`;
  return `at least ${value}`;
}

/** A minimum in words: "Town and hospital: ER within 30 min", "Elevation at the build site: at least 3,000 ft". */
export function minimumLine(must: MustCard): string {
  const key = must.factor as RowKey;
  if (!MINIMUM_BAND[key] || must.threshold === undefined) return FACTOR_LABELS[must.factor];
  return `${FACTOR_LABELS[key]}: ${minimumWords(key, must.threshold)}`;
}

export type Tier = "must" | "should" | "could" | "wont";

/** Where a factor's main card is: a gate in Must or Won't; a row in Should, Could or Won't. */
export function tierOf(r: Rubric, factor: Factor): Tier {
  if (isGate(factor))
    return r.musts.some((m) => m.factor === factor && m.threshold === undefined) ? "must" : "wont";
  const ranked = r.ranked.find((c) => c.factor === factor);
  return ranked ? ranked.tier : "wont";
}

export const isGate = (f: Factor): f is GateKey =>
  f === "floodplain" || f === "access" || f === "easement" || f === "septic";

/**
 * Why a card is where it is: "From the default card", or "You changed it" when its column, its rank or its band differs
 * from the default rubric's. Step 4's interview adds the answer that put it there.
 */
export function whyLine(r: Rubric, factor: Factor): string {
  const d = defaultRubric();
  const same =
    tierOf(r, factor) === tierOf(d, factor) &&
    r.ranked.findIndex((c) => c.factor === factor) === d.ranked.findIndex((c) => c.factor === factor) &&
    (isGate(factor) ||
      ROW_BANDS[factor].every((k) => JSON.stringify(r.bands[k]) === JSON.stringify(d.bands[k])));
  return same ? "From the default card" : "You changed it";
}
