/**
 * The cost to enjoy (step 10, docs/plans/step-10-cost-to-enjoy.md §2): Ready to camp and Ready to build, all in, as
 * ranges of published rates. Pure, and display-time only: it reads the stored result, the parcel's lines and marks, its
 * asking price and the rates, and never feeds the engine.
 *
 * The route is the one the card scores (the household's chosen line, WF5, else the app's pick). It runs from the
 * entrance to the site, and is split by what lies along it: within COST_ASSUMPTIONS.onLineM of a drawn line, the line's
 * condition counts (the best one, where lines overlap); the rest is new ground.
 */
import {
  along,
  distance,
  length,
  lineString,
  nearestPointOnLine,
  point,
  pointToLineDistance,
} from "@turf/turf";
import type { LineCondition, LineKind } from "../client/parcelStore";
import {
  COST_ASSUMPTIONS as A,
  DEFAULT_PAVING,
  type CostKey,
  type Paving,
  type Range,
  type Rates,
} from "../config/costs";
import type { LatLon } from "../geo/types";
import { overLimitSpans } from "../screen/driveway";
import { NO_PRACTICAL_ROUTE } from "../screen/score";
import type { PartialScreenResult } from "../screen/types";
import { M2FT } from "../screen/util";
import { buildSite } from "./card";
import { septicClass, soilUnder } from "./derived";
import { drivenRoute, routeLines } from "./lines";
import { feetTo, type Mark, type SepticClass } from "./marks";

/** A drawn line as the cost reads it: the parcel's own (its condition and "recorded in" aren't in the result). */
export interface CostLine {
  id: string;
  kind: LineKind;
  condition: LineCondition;
  line: readonly LatLon[];
  recordedIn: string;
}
/** A marker as the cost reads it: with a septic permit's class, when the marker is one. */
export type CostMark = Mark & { septicClass?: SepticClass | null };

export interface CostInput {
  result: PartialScreenResult;
  /** The person's best site (step 7): an index into the result's sites. A marked house is used before it. */
  siteAt?: number;
  lines: readonly CostLine[];
  marks: readonly CostMark[];
  /** The line chosen as the driveway (WF5), by id; null for the app's pick. */
  driveway?: string | null;
  askingPrice: number | null;
  rates: Rates;
  /** Whether steep stretches are paved, and above what grade (Settings → Costs); paved above 12% when absent. */
  paving?: Paving;
}

/** One rate's share of an item: a quantity (a range for the well's depth) × the rate. */
export interface CostPart {
  qty: Range;
  /** "ft", "ac", "each", "site". */
  unit: string;
  /** The rate, for its label and sources. */
  rate: CostKey;
  /** The rate's range as used: the rate's own, except for a septic system of unknown class. */
  range: Range;
  total: Range;
}

export interface CostItem {
  label: string;
  /** Empty for the land, which is the asking price. */
  parts: CostPart[];
  total: Range;
  /** Our assumptions and the rates' caveats (§8's notes). */
  notes: string[];
  /** What would lower it (§8), when something would. */
  lower: string | null;
}

export interface CostEstimate {
  items: CostItem[];
  /** Σ lows and Σ highs, rounded (roundCost). Without an asking price it leaves the land out: "plus the land". */
  total: Range;
  /** The asking price; null when there's none. */
  land: number | null;
}

export type CostToEnjoy =
  | { kind: "priced"; camp: CostEstimate; build: CostEstimate; site: string }
  /** No route the card can score: the costs need a way in. */
  | { kind: "noWay" };

// ---------- strings (plan §8) ----------

export const COST_WORDS = {
  section: "Cost to enjoy",
  camp: "Ready to camp",
  build: "Ready to build",
  allIn: "all in",
  butHouse: "everything but the house",
  plusLand: "plus the land",
  noWay: "No practical drive: the costs need a way in",
  notAQuote: "Published ranges, not a quote.",
  // The fresh-eyes review: say the land is in it, and that a line opens its breakdown.
  howRead: "All in, the land included; to build is everything but the house. Tap a line for its breakdown.",
  driveNote:
    "The Driveway section's estimate prices earthwork and stone at Settings' driveway rates; these costs use published per-foot ranges.",
} as const;

export const COST_ITEMS = {
  land: "The land",
  easement: "A legal way in (easement)",
  track: "Pioneer track, entrance to camp",
  campClearing: `Clearing a campsite (${A.campsiteAc} ac)`,
  driveway: "Finished driveway (the track upgraded)",
  newDriveway: "Gravel driveway, new",
  // Owner, #255 review: its own line, with its length and the threshold.
  paving: (ft: number, pct: number) => `Paving, ${Math.round(ft).toLocaleString("en-US")} ft over ${pct}%`,
  culverts: "Culverts",
  well: (r: Range) => `Well (${r.low}–${r.high} ft)`,
  pump: "Pump and line (your well or spring)",
  septic: (c: SepticClass | null) => `Septic, ${c ?? "class unknown"}`,
  power: (ft: number, fromMark: boolean) =>
    `Power, ${Math.round(ft).toLocaleString("en-US")} ft from ${fromMark ? "your power mark" : "the road"}`,
  hookup: "Service hookup",
  houseClearing: `Clearing the house site (${A.houseSiteAc} ac)`,
  pad: (p: "flat" | "sloped" | "steep") => `House pad, ${p}`,
} as const;

export const COST_NOTES = {
  powerAlongRoad: "assumes power along the road",
  spring: "priced as a pump and line (no published spring figure)",
  offRoute: `off the route: the straight distance × ${A.trackTurns} for a track's turns (ours)`,
  beyondTrack: "past the camp's track: new ground",
  // Owner, #255 review: paving switched off in Settings, steep stretches stay gravel; no cost for it.
  steepGravel: "steep gravel needs more upkeep",
} as const;

export const LOWER_IT = {
  track: "Draw an existing track or drive along the route.",
  clearing: "Mark a clearing at the camp or the house site.",
  water: "Mark a well or a spring near the site.",
  septic: "Mark a septic permit with its class.",
  power: "Mark a power pole near the site.",
  easement: 'Record the easement (its "recorded in").',
  // Owner's wording (#255 review).
  paving: "a gentler route, or gravel on steep stretches (Settings)",
} as const;

// ---------- against a budget (step 10 plan §3) ----------

/**
 * A budget against its cost: pass when the high end is within it, warn when the range straddles it, fail when even the
 * low end is over; unknown without an asking price or a cost.
 */
export type BudgetStatus = "pass" | "warn" | "fail" | "unknown";

export const budgetStatusOf = (r: Range, budget: number): BudgetStatus =>
  r.high <= budget ? "pass" : r.low > budget ? "fail" : "warn";

/** How a range sits against a budget, in the card's words: "under your $250k". */
export const BUDGET_SITS: Record<Exclude<BudgetStatus, "unknown">, string> = {
  pass: "under",
  warn: "straddles",
  fail: "over",
};

// ---------- arithmetic ----------

const ZERO: Range = { low: 0, high: 0 };
const plus = (a: Range, b: Range): Range => ({ low: a.low + b.low, high: a.high + b.high });
const sum = (rs: readonly Range[]): Range => rs.reduce(plus, ZERO);

/** Rounded as the plan says: to $1k under $100k, to $5k from there. */
export const roundCost = (n: number): number => {
  const step = n < 100_000 ? 1_000 : 5_000;
  return Math.round(n / step) * step;
};

/** "$200–240k", "$950k–1.05M", "$12k": a range of dollars, in thousands or millions. */
export function costRange(r: Range): string {
  const unit = (n: number) => (n >= 1_000_000 ? "M" : "k");
  const num = (n: number) => (n >= 1_000_000 ? +(n / 1_000_000).toFixed(2) : Math.round(n / 1_000));
  if (unit(r.low) !== unit(r.high)) return `$${num(r.low)}${unit(r.low)}–${num(r.high)}${unit(r.high)}`;
  return num(r.low) === num(r.high)
    ? `$${num(r.high)}${unit(r.high)}`
    : `$${num(r.low)}–${num(r.high)}${unit(r.high)}`;
}

const part = (
  rates: Rates,
  rate: CostKey,
  qty: number | Range,
  unit: string,
  range: Range = rates[rate],
): CostPart => {
  const q = typeof qty === "number" ? { low: qty, high: qty } : qty;
  return { qty: q, unit, rate, range, total: { low: q.low * range.low, high: q.high * range.high } };
};

const item = (
  label: string,
  parts: CostPart[],
  notes: string[] = [],
  lower: string | null = null,
): CostItem => ({
  label,
  parts,
  total: sum(parts.map((p) => p.total)),
  notes,
  lower,
});

/** Drops the parts with nothing in them; the item with them. */
const nonEmpty = (parts: CostPart[]): CostPart[] => parts.filter((p) => p.qty.high > 0);

// ---------- the route's ground ----------

export type Ground = "new" | LineCondition;
const RANK: Record<Ground, number> = { new: 0, uncleared: 1, pioneer: 2, improved: 3, paved: 4 };

/** A stretch of the route, ft from the entrance, and what's on the ground there. */
export interface Run {
  from: number;
  to: number;
  ground: Ground;
}

const xy = ([lat, lon]: LatLon): [number, number] => [lon, lat];
type RouteLine = ReturnType<typeof lineString>;

/**
 * The route's ground, entrance to site, by sampling every ~3 m. Lengths are scaled to the route's own `lengthFt`, so
 * the parts add up to what the Driveway section says.
 */
export function groundAlong(route: RouteLine, lengthFt: number, lines: readonly CostLine[]): Run[] {
  const lenM = length(route, { units: "meters" });
  if (!(lenM > 0)) return [];
  const drawn = lines
    .filter((l) => l.line.length >= 2)
    .map((l) => ({ ground: l.condition as Ground, geo: lineString(l.line.map(xy)) }));
  const n = Math.max(1, Math.ceil(lenM / 3));
  const step = lenM / n;
  const ftPerM = lengthFt / lenM;
  const runs: Run[] = [];
  for (let i = 0; i < n; i++) {
    const at = along(route, (i + 0.5) * step, { units: "meters" });
    let ground: Ground = "new";
    for (const d of drawn)
      if (RANK[d.ground] > RANK[ground] && pointToLineDistance(at, d.geo, { units: "meters" }) <= A.onLineM)
        ground = d.ground;
    const from = i * step * ftPerM,
      to = (i + 1) * step * ftPerM;
    const last = runs[runs.length - 1];
    if (last && last.ground === ground) last.to = to;
    else runs.push({ from, to, ground });
  }
  return runs;
}

/** Each ground's length, ft, between two points along the route. */
export function groundBetween(runs: readonly Run[], from: number, to: number): Record<Ground, number> {
  const out: Record<Ground, number> = { new: 0, uncleared: 0, pioneer: 0, improved: 0, paved: 0 };
  for (const r of runs) out[r.ground] += Math.max(0, Math.min(r.to, to) - Math.max(r.from, from));
  return out;
}

// ---------- the two costs ----------

const nearest = <M extends CostMark>(marks: readonly M[], ll: LatLon): { mark: M; ft: number } | null =>
  marks.reduce<{ mark: M; ft: number } | null>((best, m) => {
    const ft = feetTo(m, ll);
    return !best || ft < best.ft ? { mark: m, ft } : best;
  }, null);

const inClearing = (marks: readonly CostMark[], ll: LatLon): boolean =>
  marks.some((m) => m.kind === "clearing" && m.shape === "area" && feetTo(m, ll) === 0);

/** Null until the driveway has been routed and a build site is known. */
export function costToEnjoy(input: CostInput): CostToEnjoy | null {
  const { result: r, rates, marks } = input;
  const d = r.driveway;
  if (!d) return null;
  if (d.note?.includes(NO_PRACTICAL_ROUTE)) return { kind: "noWay" };
  const rt = drivenRoute(r, input.driveway ?? null).route;
  if (!rt) return { kind: "noWay" };
  const site = buildSite(r, input.siteAt ?? 0);
  if (!site) return null;
  const slopeDeg =
    r.house && !("outside" in r.house) ? r.house.slopeDeg : (r.sites?.[input.siteAt ?? 0]?.slopeDeg ?? null);

  const route = lineString(rt.line.geometry.coordinates as [number, number][]);
  const lengthFt = rt.metrics.lengthFt;
  const runs = groundAlong(route, lengthFt, input.lines);

  // ----- Ready to camp -----
  const camp: CostItem[] = [];
  const land = input.askingPrice;
  if (land !== null) camp.push({ ...item(COST_ITEMS.land, []), total: { low: land, high: land } });

  // A legal way in: the route needs an easement, or uses a drawn easement on neighbouring land that isn't recorded.
  const recorded = new Map(input.lines.map((l) => [l.id, l.recordedIn.trim()]));
  const unrecorded = routeLines(r, rt).some(
    (l) => l.kind === "easement" && l.outsideFt > 0 && !recorded.get(l.id),
  );
  if (rt.needsEasement || unrecorded)
    camp.push(
      item(
        COST_ITEMS.easement,
        [part(rates, "easement.legal", 1, "each")],
        [],
        unrecorded ? LOWER_IT.easement : null,
      ),
    );

  // The camp: the Campsite mark the track reaches most cheaply, else the site at the route's end.
  const campsites = marks.filter((m) => m.kind === "campsite" && m.shape === "point");
  const camps = campsites.map((m) => {
    const ll = m.shape === "point" ? m.ll : site.ll;
    const snap = nearestPointOnLine(route, point(xy(ll)), { units: "meters" });
    const alongFt = Math.min(
      lengthFt,
      snap.properties.totalDistance * (lengthFt / length(route, { units: "meters" })),
    );
    const offFt = distance(snap, point(xy(ll)), { units: "feet" }) * A.trackTurns;
    return { ll, alongFt, offFt };
  });
  const campAt = camps.reduce<{ ll: LatLon; alongFt: number; offFt: number } | null>(
    (best, c) => (!best || c.alongFt + c.offFt < best.alongFt + best.offFt ? c : best),
    null,
  ) ?? { ll: site.ll, alongFt: lengthFt, offFt: 0 };

  const toCamp = groundBetween(runs, 0, campAt.alongFt);
  const trackFt = toCamp.new + toCamp.uncleared;
  const trackParts = nonEmpty([
    part(rates, "track.pioneer", trackFt, "ft"),
    part(rates, "track.pioneer", campAt.offFt, "ft"),
  ]);
  camp.push(
    item(
      COST_ITEMS.track,
      trackParts,
      campAt.offFt > 0 ? [COST_NOTES.offRoute] : [],
      trackFt > 0 ? LOWER_IT.track : null,
    ),
  );
  const campCleared = inClearing(marks, campAt.ll);
  camp.push(
    item(
      COST_ITEMS.campClearing,
      campCleared ? [] : [part(rates, "clearing", A.campsiteAc, "ac")],
      [],
      campCleared ? null : LOWER_IT.clearing,
    ),
  );

  // ----- Ready to build: the camp's items, plus -----
  const build: CostItem[] = [...camp];

  // Steep stretches: where the 30 m grade passes the paving threshold (the Driveway section's own "~N ft to pave" at
  // 12%), less any paved line. Paved on top of the gravel when paving is on; gravel, with a note, when it's off.
  const paving = input.paving ?? DEFAULT_PAVING;
  const steepFt = overLimitSpans(rt.profile as [number, number][], paving.abovePct / 100).reduce(
    (t, [a, b]) => {
      const g = groundBetween(runs, a * M2FT, b * M2FT);
      return t + (b - a) * M2FT - g.paved;
    },
    0,
  );

  // The finished driveway, crediting the camp's track; past it (a campsite off the route), the ground as it is.
  const past = groundBetween(runs, campAt.alongFt, lengthFt);
  build.push(
    item(
      COST_ITEMS.driveway,
      nonEmpty([
        part(
          rates,
          "driveway.upgrade.pioneer",
          toCamp.new + toCamp.uncleared + toCamp.pioneer + past.pioneer,
          "ft",
        ),
        part(rates, "driveway.upgrade.improved", toCamp.improved + past.improved, "ft"),
        part(rates, "driveway.upgrade.uncleared", past.uncleared, "ft"),
      ]),
      !paving.on && steepFt >= 1 ? [COST_NOTES.steepGravel] : [],
      toCamp.new + past.new + past.uncleared > 0 ? LOWER_IT.track : null,
    ),
  );
  if (past.new > 0)
    build.push(
      item(
        COST_ITEMS.newDriveway,
        [part(rates, "driveway.new", past.new, "ft")],
        [COST_NOTES.beyondTrack],
        LOWER_IT.track,
      ),
    );

  if (paving.on && steepFt >= 1)
    build.push(
      item(
        COST_ITEMS.paving(steepFt, paving.abovePct),
        [part(rates, "driveway.paving", steepFt, "ft")],
        [],
        LOWER_IT.paving,
      ),
    );
  if (rt.metrics.culverts > 0)
    build.push(item(COST_ITEMS.culverts, [part(rates, "culvert", rt.metrics.culverts, "each")]));

  // Water: a well or spring marked near the site needs a pump and line; else a drilled well at the typical depth.
  const water = nearest(
    marks.filter((m) => m.kind === "well" || m.kind === "spring"),
    site.ll,
  );
  if (water && water.ft <= A.nearMarkFt)
    build.push(
      item(
        COST_ITEMS.pump,
        [part(rates, "well.pump", 1, "each")],
        water.mark.kind === "spring" ? [COST_NOTES.spring] : [],
      ),
    );
  else
    build.push(
      item(
        COST_ITEMS.well(rates["well.depthFt"]),
        [part(rates, "well.perFt", rates["well.depthFt"], "ft")],
        [],
        LOWER_IT.water,
      ),
    );

  // Septic: a permit's class near the site, else the site's soil's.
  const permit = nearest(
    marks.filter((m) => m.kind === "septic" && m.septicClass != null),
    site.ll,
  );
  const fromPermit = permit && permit.ft <= A.nearMarkFt ? (permit.mark.septicClass ?? null) : null;
  const soil = soilUnder(r, site.ll);
  const fromSoil = soil ? septicClass(soil) : null;
  const cls: SepticClass | null = fromPermit ?? (fromSoil ? (fromSoil.toLowerCase() as SepticClass) : null);
  const septicParts = cls
    ? [part(rates, `septic.${cls}`, 1, "each")]
    : // No class known: anywhere from the cheapest conventional system to the dearest alternative one.
      [
        part(rates, "septic.alternative", 1, "each", {
          low: rates["septic.conventional"].low,
          high: rates["septic.alternative"].high,
        }),
      ];
  build.push(item(COST_ITEMS.septic(cls), septicParts, [], fromPermit ? null : LOWER_IT.septic));

  // Power: from the nearest Power mark, else from the road at the route's entrance; straight to the site.
  const pole = nearest(
    marks.filter((m) => m.kind === "power"),
    site.ll,
  );
  const entrance = d.entrances[rt.entranceIndex]?.ll;
  const powerFt = pole
    ? pole.ft
    : entrance
      ? distance(point(xy(entrance)), point(xy(site.ll)), { units: "feet" })
      : 0;
  build.push(
    item(
      COST_ITEMS.power(powerFt, !!pole),
      [part(rates, "power.perFt", powerFt, "ft")],
      pole ? [] : [COST_NOTES.powerAlongRoad],
      pole ? null : LOWER_IT.power,
    ),
  );
  build.push(item(COST_ITEMS.hookup, [part(rates, "power.hookup", 1, "each")]));

  // Clearing the house site, and its pad by the site's slope.
  const siteCleared = inClearing(marks, site.ll);
  build.push(
    item(
      COST_ITEMS.houseClearing,
      siteCleared ? [] : [part(rates, "clearing", A.houseSiteAc, "ac")],
      [],
      siteCleared ? null : LOWER_IT.clearing,
    ),
  );
  build.push(item(COST_ITEMS.pad(padOf(slopeDeg)), [part(rates, `pad.${padOf(slopeDeg)}`, 1, "site")]));

  return { kind: "priced", camp: estimate(camp, land), build: estimate(build, land), site: site.label };
}

/** The pad by the site's slope; a slope not measured (a marked house off the DEM's cells) reads as sloped. */
export function padOf(slopeDeg: number | null): "flat" | "sloped" | "steep" {
  if (slopeDeg == null) return "sloped";
  if (slopeDeg < A.padSlopedDeg) return "flat";
  return slopeDeg <= A.padSteepDeg ? "sloped" : "steep";
}

function estimate(items: CostItem[], land: number | null): CostEstimate {
  const t = sum(items.map((i) => i.total));
  return { items, total: { low: roundCost(t.low), high: roundCost(t.high) }, land };
}
