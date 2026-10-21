/**
 * The rubric's cards in plain words (step 3, docs/plans/step-3-rubric-editor.md §2): each factor's label (the card's own,
 * lib/report/card.ts reads them from here), what it asks for at its B/C edge (the edge of "acceptable"), its band, a
 * minimum in words, and why a card is where it is. Pure; the editor renders them.
 */
import { shortPrice } from "../client/askingPrice";
import { fmt } from "../format";
import { defaultRubric } from "./default";
import type { Bands, Budgets, Factor, GateKey, MustCard, RowKey, Rubric } from "./types";

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
  driveway: "Driveway",
  trails: "Trails and public land",
  town: "Town and hospital",
  garden: "Garden ground",
  budget: "Within budget",
};

/**
 * The priorities page's own titles (step 3 UX round, owner 10/18): the card's, except where a first-time reader needs
 * plainer words. The report card keeps FACTOR_LABELS (CLAUDE.md rule 7).
 */
export const EDITOR_TITLES: Record<Factor, string> = {
  ...FACTOR_LABELS,
  easement: "Driveway on your land",
};

/**
 * Each factor in a word or two (step 10b plan §8): the Favorites grid's headers and the phone card's strip, with
 * EDITOR_TITLES as the full name beside them. Best homesite is "Sun", as the owner's brief has it.
 */
export const SHORT_TITLES: Record<Factor, string> = {
  floodplain: "Flood",
  access: "Access",
  easement: "Own drive",
  septic: "Septic",
  elevation: "Elev",
  homesite: "Sun",
  sky: "Sky",
  room: "Room",
  driveway: "Drive",
  trails: "Trails",
  town: "Town",
  garden: "Garden",
  budget: "Budget",
};

/** The bands a slider moves: each a list of A, B, C and D edges, best first. */
export type BandKey =
  "elevationFt" | "skyMag" | "roomX" | "trailheadMin" | "erMin" | "groceryMin" | "gardenAc" | "drivewayPct";

/**
 * What a limit is set in: a band, or (Best homesite, whose letter is the site's quality and has no band) hours of
 * December sun at the best site (step 4, owner 10/18). Not part of the stored `Bands`: a limit is a threshold.
 */
export type LimitKey = BandKey | "sunH";

/** Each row's bands, the editor's sliders (homesite's letter is the site's quality: none). */
export const ROW_BANDS: Record<RowKey, readonly BandKey[]> = {
  elevation: ["elevationFt"],
  homesite: [],
  sky: ["skyMag"],
  room: ["roomX"],
  driveway: ["drivewayPct"],
  trails: ["trailheadMin"],
  town: ["erMin", "groceryMin"],
  garden: ["gardenAc"],
  // Step 10: graded against the budgets, which the questions set; no slider.
  budget: [],
};

/** What a row's limit is set in: the unit of its `measure` (lib/rubric/musts.ts); null when it can't have one. */
export const MINIMUM_BAND: Record<RowKey, LimitKey | null> = {
  elevation: "elevationFt",
  homesite: "sunH",
  sky: "skyMag",
  room: "roomX",
  // No limit on the driveway in step 7 (plan §11 Q9): question 14 has no chip for it.
  driveway: null,
  trails: "trailheadMin",
  town: "erMin",
  garden: "gardenAc",
  // Step 10: a Must on it has no number of its own: it's the budgets.
  budget: null,
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
  drivewayPct: "atMost",
};

/** "1.0" → "1", "0.25" stays: a number without trailing zeros. */
const trim = (s: string): string => (s.includes(".") ? s.replace(/\.?0+$/, "") : s);

/** A band's value in its unit: "2,500 ft", "21.2", "2×", "20 min", "0.25 ac". */
export function bandValue(key: LimitKey, v: number): string {
  switch (key) {
    case "sunH":
      return `${trim(fmt(v, 1))} h`;
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
    case "drivewayPct":
      return `${fmt(v)}%`;
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

/** "ready to camp under $250k, ready to build under $300k": the budgets given, in the What matters card's words. */
export function budgetWords(b: Budgets | undefined): string {
  const parts = [
    b?.camp != null ? `ready to camp under ${shortPrice(b.camp)}` : null,
    b?.build != null ? `ready to build under ${shortPrice(b.build)}` : null,
  ].filter((x): x is string => !!x);
  return parts.length ? parts.join(", ") : "no budget given";
}

/** Sentence case for a line that starts with words of its own. */
const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** What a card asks for, in plain words, at the rubric's own bands. */
export function cardLine(r: Rubric, factor: Factor): string {
  const b = r.bands;
  switch (factor) {
    case "floodplain":
      return "No FEMA flood zone at the build site or on the driveway";
    case "access":
      return "Frontage on a public road, or a recorded right-of-way";
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
    case "driveway":
      return `A driveway no steeper than ${bandValue("drivewayPct", bcEdge(b, "drivewayPct"))} at its steepest`;
    case "trails":
      return `A trailhead within a ${fmt(bcEdge(b, "trailheadMin"))}-minute drive (or public land within ${trim(fmt(b.openLandWithinFt / 5280, 2))} mi)`;
    case "town":
      return `An ER within ${bandValue("erMin", bcEdge(b, "erMin"))} and groceries within ${fmt(bcEdge(b, "groceryMin"))}`;
    case "garden":
      return `At least ${bandValue("gardenAc", bcEdge(b, "gardenAc"))} of garden ground`;
    case "budget":
      return capital(budgetWords(r.budgets));
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
  if (row === "homesite") return `at least ${value} of December sun`;
  return `at least ${value}`;
}

/** A minimum in words: "Town and hospital: ER within 30 min", "Elevation at the build site: at least 3,000 ft". */
export function minimumLine(must: MustCard): string {
  const key = must.factor as RowKey;
  if (!MINIMUM_BAND[key] || must.threshold === undefined) return EDITOR_TITLES[must.factor];
  return `${EDITOR_TITLES[key]}: ${minimumWords(key, must.threshold)}`;
}

export type Tier = "must" | "should" | "could" | "wont";

/** Each column's name on the priorities page (owner, 10/18); "rubric" stays the code's name for the list. */
export const TIER_NAMES: Record<Tier, string> = {
  must: "Must have",
  should: "Really want",
  could: "Nice to have",
  wont: "Don't care",
};

/**
 * A card's one plain line on the priorities page (owner, 10/18): what it asks for, without units a first-time reader
 * has to look up. Elevation, Trails and Town keep their numbers, which are already plain; the exact number of every
 * other row is in its sheet (cardLine).
 */
export function plainLine(r: Rubric, factor: Factor): string {
  const b = r.bands;
  switch (factor) {
    case "floodplain":
      return "No flood zone at the house or the driveway";
    case "access":
      return "Reachable by a public road, or a recorded right-of-way";
    case "easement":
      return "The driveway stays on your land, or its easement is recorded";
    case "septic":
      return "Soil that can take a septic field";
    case "elevation":
      return `${bandValue("elevationFt", bcEdge(b, "elevationFt"))} or higher`;
    case "homesite":
      return "A sunny, gentle spot for the house";
    case "sky": {
      const mag = bcEdge(b, "skyMag");
      if (mag >= 21.2) return "Dark enough to see the Milky Way";
      if (mag >= 20.9) return "Dark enough for plenty of stars";
      return "Some stars, even with a town's glow";
    }
    case "room":
      return "Enough gentle ground for the house";
    case "driveway":
      return `A driveway no steeper than ${bandValue("drivewayPct", bcEdge(b, "drivewayPct"))}`;
    case "trails":
      return `A trailhead within ${bandValue("trailheadMin", bcEdge(b, "trailheadMin"))}, or public land within ${trim(fmt(b.openLandWithinFt / 5280, 2))} mi`;
    case "town":
      return `ER within ${bandValue("erMin", bcEdge(b, "erMin"))}, groceries within ${bandValue("groceryMin", bcEdge(b, "groceryMin"))}`;
    case "garden": {
      const ac = bcEdge(b, "gardenAc");
      if (ac >= 1) return "Room for a big garden";
      if (ac >= 0.25) return "Room for a kitchen garden";
      return "Room for a small garden";
    }
    case "budget":
      return capital(budgetWords(r.budgets));
  }
}

/**
 * Where a factor's main card is: a gate in Must or Won't; a row in Should, Could or Won't. Within budget (step 10) can
 * also be a Must without a number, as a gate is: the interview's "Over budget" walk-away.
 */
export function tierOf(r: Rubric, factor: Factor): Tier {
  const asMust = r.musts.some((m) => m.factor === factor && m.threshold === undefined);
  if (isGate(factor)) return asMust ? "must" : "wont";
  if (factor === "budget" && asMust) return "must";
  const ranked = r.ranked.find((c) => c.factor === factor);
  return ranked ? ranked.tier : "wont";
}

export const isGate = (f: Factor): f is GateKey =>
  f === "floodplain" || f === "access" || f === "easement" || f === "septic";

export const WHY_STARTING = "On the starting list.";
export const WHY_MOVED = "You moved this here.";

/** The interview's list and its why lines (lib/rubric/interview/generate.ts): what a card's why reads against. */
export interface WhyContext {
  base: Rubric;
  why: { cards: Partial<Record<Factor, string[]>>; limits: Partial<Record<RowKey, string>> };
}

/**
 * Why a card is where it is (owner, 10/18: the person's terms, never a question number). Against the interview's list
 * when there is one, else the starting list: a card in the same column with the same band quotes the answer that put
 * it there ("You'd want an ER within 30 minutes"), or "On the starting list." when no answer did;
 * any other reads "You moved this here.". Rank isn't compared: moving one card would mark every card below it.
 */
export function whyLine(r: Rubric, factor: Factor, ctx?: WhyContext | null): string {
  const ref = ctx?.base ?? defaultRubric();
  const same =
    tierOf(r, factor) === tierOf(ref, factor) &&
    (isGate(factor) ||
      ROW_BANDS[factor].every((k) => JSON.stringify(r.bands[k]) === JSON.stringify(ref.bands[k])));
  if (!same) return WHY_MOVED;
  return ctx?.why.cards[factor]?.[0] ?? WHY_STARTING;
}

/** A limit's why: the walk-away answer that set it, while its value is the interview's; else as `whyLine`. */
export function limitWhy(r: Rubric, row: RowKey, ctx?: WhyContext | null): string {
  const at = (x: Rubric) => x.musts.find((m) => m.factor === row && m.threshold !== undefined)?.threshold;
  const ref = ctx?.base ?? defaultRubric();
  if (at(r) !== at(ref)) return WHY_MOVED;
  return ctx?.why.limits[row] ?? WHY_STARTING;
}
