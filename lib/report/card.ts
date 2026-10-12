/**
 * The parcel report card (value-ranking.md §3.2, approved #95; VR2): the dealbreaker gates, the graded rows, and,
 * per person, the parcel grade, the verdict and its one-line reason. Pure, from a result and the card's config.
 * It isn't stored: the weights switch per person, and the result's shape is frozen. VR5 renders it.
 *
 * Money can fix the driveway, clearing, septic, the well and power, so they never reach the grade (§3.3): the
 * gates only warn or fail, and the rows are the qualities money can't add.
 */
import { compass, fmt } from "../format";
import { SCREEN_CONSTANTS } from "../screen/config";
import { NEAREST_HOSPITAL, REAL_GROCERY, type DriveEntry } from "../screen/driveList";
import { NO_PRACTICAL_ROUTE, existingSteepLine } from "../screen/score";
import { isPrimeFarmland, soilAt, type SoilUnit } from "../screen/soils";
import type { PartialScreenResult } from "../screen/types";
import { M2FT, M2_PER_ACRE } from "../screen/util";
import { steepLandingLine } from "./driveway";
import { LINE_LABEL, VERIFY_RIGHT_OF_WAY, routeLines, scoredRoute, startLine } from "./lines";

export type CardConfig = typeof SCREEN_CONSTANTS.card;
type BuildConfig = typeof SCREEN_CONSTANTS.build;

export type Letter = "A" | "B" | "C" | "D" | "F";
export type Person = keyof CardConfig["weights"];
export type RowKey = keyof CardConfig["weights"][Person];
export type GateKey = "floodplain" | "access" | "easement" | "septic";
/** "unknown": the data can't say (FEMA hasn't mapped the area, or the data didn't load). Never a warn. */
export type GateStatus = "pass" | "warn" | "fail" | "unknown";
export type Verdict = "Contender" | "Maybe" | "Pass";

export interface Gate {
  key: GateKey;
  label: string;
  status: GateStatus;
  /** A sentence without its full stop; the verdict's reason line can quote it. */
  reason: string;
  /** The data that didn't load ("the FEMA flood map"): the card is incomplete (owner, #109 review). */
  missing?: string;
}

export interface Row {
  key: RowKey;
  label: string;
  /** null: not graded, and left out of the parcel grade. */
  grade: Letter | null;
  detail: string;
  /** The data that didn't load, when that's why it isn't graded. */
  missing?: string;
  /** Something to check before anything else; it caps the verdict at Maybe (Room to build's F, owner #110). */
  checkFirst?: string;
  /** More for the row's panel than its one line holds (the homesite's quality grade). */
  panelNote?: string;
}

/** What the card says regardless of whose weights are on. */
export interface CardFacts {
  gates: Gate[];
  rows: Row[];
}

export interface Card extends CardFacts {
  person: Person;
  /** The weighted average of the graded rows' points (A 4 … F 0); null when no row is graded. */
  points: number | null;
  grade: Letter | null;
  /** Capped at Maybe when something didn't load. */
  verdict: Verdict;
  /** "Maybe. Check first: no soil on the parcel rates better than very limited for a septic field." */
  reason: string;
  /** What didn't load, in the card's order: the reason line says so, and asks for a re-run. */
  incomplete: string[];
}

const LETTERS: readonly Letter[] = ["A", "B", "C", "D"];

/** The grade whose lower edge `v` reaches, cutoffs best first; below the last, an F. */
export const atLeast = (v: number, cutoffs: readonly number[]): Letter =>
  LETTERS[cutoffs.findIndex((c) => v >= c)] ?? "F";

/** The grade whose upper edge `v` is within, cutoffs best first; beyond the last, an F. */
export const atMost = (v: number, cutoffs: readonly number[]): Letter =>
  LETTERS[cutoffs.findIndex((c) => v <= c)] ?? "F";

const worse = (a: Letter, b: Letter): Letter => (a > b ? a : b);
const better = (a: Letter, b: Letter): Letter => (a < b ? a : b);

/** The whole build footprint in ft² (§5.4): the house and garage with their margins, the turnaround, the drainfield and its reserve. */
export function footprintFt2(b: BuildConfig = SCREEN_CONSTANTS.build): number {
  const withMargin = ([w, d]: readonly number[]) => (w! + 2 * b.marginFt) * (d! + 2 * b.marginFt);
  const drainfield = b.bedrooms * b.trenchFt2PerBedroom * b.trenchSpacingFactor;
  return (
    withMargin(b.houseRectFt) +
    withMargin(b.garageFt) +
    b.turnaroundFt[0]! * b.turnaroundFt[1]! +
    drainfield * (1 + b.reservePct / 100)
  );
}

const FT2_PER_ACRE = M2_PER_ACRE * M2FT * M2FT;
const KM_PER_MI = 1.609344;
/** Distances on the card are in miles (owner, #109 review); the cutoffs stay in km. */
const miles = (km: number): string => fmt(km / KM_PER_MI, km / KM_PER_MI < 1 ? 2 : 1);

/** "fits as is" for a sentence's start, but an acronym stays: "FEMA has…". */
const lowerFirst = (s: string): string => (/^[A-Z]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));

type Result = PartialScreenResult;

/**
 * The build site: the house when you've placed one (owner, #109 review), else site #1. null when there's neither;
 * undefined when the homesites weren't ranked and there's no house.
 */
export interface BuildSite {
  label: string;
  elevFt: number | null;
  inSfha: boolean;
  /** A flood zone touches the site's own ground (v4); null for a placed house, which has no footprint. */
  sfhaOnSite: boolean | null;
}
export function buildSite(r: Result): BuildSite | null | undefined {
  const h = r.house;
  if (h && !("outside" in h))
    return { label: "the marked house", elevFt: h.elevFt, inSfha: h.inSFHA, sfhaOnSite: null };
  if (!r.sites) return undefined;
  const s = r.sites[0];
  return s ? { label: "site #1", elevFt: s.elevFt, inSfha: !!s.flood, sfhaOnSite: s.sfhaOnSite } : null;
}

// ---------- the gates ----------

const gate =
  (key: GateKey, label: string) =>
  (status: GateStatus, reason: string, missing?: string): Gate => ({
    key,
    label,
    status,
    reason,
    ...(missing ? { missing } : {}),
  });

/**
 * The owner's rule (#109 review): a fail when the build site is in a flood zone; a warn when one touches the build
 * site's ground or the scored driveway (schema v4); a flood zone elsewhere on the parcel is a pass, with a note.
 */
function floodplain(r: Result, site: BuildSite | null | undefined): Gate {
  const g = gate("floodplain", "Floodplain");
  if (!r.flood) return g("unknown", "The FEMA flood map didn't load", "the FEMA flood map");
  if (!r.flood.mapped) return g("unknown", "FEMA has no flood mapping here");
  if (site?.inSfha) return g("fail", "The build site is in a FEMA flood zone");
  const route = r.driveway && (r.driveway.overLimit ?? r.driveway.routes[0]);
  const routeFt = route?.metrics.sfhaFt ?? 0;
  const touches = [
    site?.sfhaOnSite ? "A FEMA flood zone touches the build site's ground" : null,
    routeFt > 0 ? `the driveway runs ${fmt(routeFt)} ft through a FEMA flood zone` : null,
  ].filter((t): t is string => !!t);
  if (touches.length)
    return g("warn", touches.map((t, i) => (i ? t : t.charAt(0).toUpperCase() + t.slice(1))).join("; "));
  if (r.flood.sfha)
    return g(
      "pass",
      `A FEMA flood zone covers ${fmt(r.flood.sfhaAcres, 1)} ac of the parcel, away from the build site and driveway`,
    );
  return g("pass", "No FEMA flood zone on the parcel");
}

/**
 * A drawn line the scored driveway starts from (follow-up 34): the Access gate asks that it be verified, after what it
 * says of the frontage (rule 7: appended), and warns at least.
 */
function access(r: Result): Gate {
  const frontage = accessByFrontage(r);
  const rt = r.driveway && scoredRoute(r.driveway);
  const line = rt ? startLine(r, rt) : null;
  if (!line) return frontage;
  const ask = `${LINE_LABEL[line.kind]}: ${VERIFY_RIGHT_OF_WAY}`;
  return {
    ...frontage,
    status: frontage.status === "fail" ? "fail" : "warn",
    reason: `${frontage.reason}; ${lowerFirst(ask)}`,
  };
}

function accessByFrontage(r: Result): Gate {
  const g = gate("access", "Legal road access");
  const d = r.driveway;
  if (!d) return g("unknown", "The roads didn't load", "the roads");
  if (!d.entrances.length)
    return g(
      "fail",
      `No road within ${miles(SCREEN_CONSTANTS.driveway.fallbackMaxM / 1000)} mi of the boundary (landlocked, or TIGER is wrong)`,
    );
  const front = d.entrances.find((e) => !e.fallback && e.source !== "drawn");
  // An OpenStreetMap way TIGER doesn't show (v4): possible frontage, which the deed or plat must confirm.
  if (front?.source === "osm") {
    const what = front.name.startsWith("unmapped ")
      ? "an unmapped track"
      : `${front.name}, a road TIGER doesn't show`;
    const reaches = front.reaches
      ? `; it reaches ${front.reaches.road} after ${fmt(front.reaches.ft)} ft`
      : "";
    return g("warn", `Possible frontage on ${what} (verify it's a legal road or easement)${reaches}`);
  }
  if (front) return g("pass", `Frontage on ${front.name === "road" ? "an unnamed road" : front.name}`);
  return g(
    "warn",
    `No road frontage found within 130 ft; routed from the nearest road point, ${fmt(d.entrances[0]!.gapFt ?? NaN)} ft off the line (the deed or plat must show access)`,
  );
}

function easement(r: Result): Gate {
  const g = gate("easement", "Easement needed");
  const d = r.driveway;
  if (!d) return g("unknown", "The driveway wasn't routed", "the roads");
  if (d.note?.includes(NO_PRACTICAL_ROUTE)) {
    // The steep-landing flag is the reason only when no route avoids it (owner, #101 Q4).
    const steep =
      d.steepLanding && !d.steepLanding.avoided ? `: ${lowerFirst(steepLandingLine(d.steepLanding))}` : "";
    return g("fail", NO_PRACTICAL_ROUTE + steep);
  }
  const scored = d.overLimit ?? d.routes[0];
  if (!scored)
    return g("fail", d.entrances.length ? "No driveway route found" : "No road to route a driveway from");
  const warns = [
    scored.needsEasement ? "The driveway needs an easement across neighbouring land" : null,
    // "No practical drive" (owner, #99 decisions): stored by B2a for this gate.
    d.practical ? "The drive needs a steeper paved alignment or an easement" : null,
    // A drawn easement it uses across neighbouring land (follow-up 34): counted as the parcel's for the route, so asked.
    // A drawn track there isn't legal access (owner, #116): the route needs an easement, said above.
    ...routeLines(r, scored)
      .filter((l) => l.kind === "easement" && l.outsideFt > 0)
      .map((l) => `${LINE_LABEL[l.kind]}: ${VERIFY_RIGHT_OF_WAY}`),
    // An existing drive it starts from, steeper than the veto (owner, #116): warned of here, as for any route.
    existingSteepLine(scored.existing),
  ].filter((w): w is string => !!w);
  if (warns.length) return g("warn", warns.map((w, i) => (i ? lowerFirst(w) : w)).join("; "));
  return g("pass", "The driveway stays on the parcel");
}

/** The owner's rule: a warn when no soil on the parcel rates better than "very limited" (never a fail). */
function septic(r: Result): Gate {
  const g = gate("septic", "Septic");
  if (!r.soils) return g("unknown", "The NRCS soils didn't load", "the NRCS soils");
  if (!r.soils.length) return g("unknown", "NRCS returned no soils for the parcel");
  const better = r.soils.filter((x) => /not limited|somewhat/i.test(x.septic || x.engstafdcd || ""));
  if (!better.length)
    return g("warn", "No soil on the parcel rates better than very limited for a septic field");
  const names = [...new Set(better.map((x) => x.compname).filter((n): n is string => !!n))];
  return g(
    "pass",
    `Some soil on the parcel rates better than very limited for a septic field${names.length ? ` (${names.join(", ")})` : ""}`,
  );
}

// ---------- the rows ----------

const row =
  (key: RowKey, label: string) =>
  (grade: Letter | null, detail: string): Row => ({ key, label, grade, detail });

/** A row that isn't graded because `source` didn't load. */
const notLoaded = (g: ReturnType<typeof row>, source: string): Row => ({
  ...g(null, `${source} didn't load`),
  missing: source,
});

function elevation(site: BuildSite | null | undefined, K: CardConfig): Row {
  const g = row("elevation", "Elevation at the build site");
  if (site === undefined) return notLoaded(g, "the homesite ranking");
  // No build site: left out, as the Best homesite row's F carries it (owner, #109 review).
  if (site === null || site.elevFt === null) return g(null, "no build site to measure");
  return g(atLeast(site.elevFt, K.rows.elevationFt), `${fmt(site.elevFt)} ft at ${site.label}`);
}

/**
 * Site #1's quality grade only (owner, #95 review): its build cost picks the site, but never grades the parcel. The
 * line says it in plain words; the quality score is the panel's (owner, #110).
 */
function homesite(r: Result): Row {
  const g = row("homesite", "Best homesite");
  if (!r.sites) return notLoaded(g, "the homesite ranking");
  const s = r.sites[0];
  if (!s) return g("F", "no build site found");
  return {
    ...g(
      s.qGrade,
      `faces ${compass(s.aspectDeg)}, ${fmt(s.sunH, 1)} h of December sun, ${fmt(s.slopeDeg)}° slope`,
    ),
    panelNote: `site #1's quality ${s.qGrade} (${fmt(s.quality)})`,
  };
}

/** The zone in words (owner, #109 review); mag/arcsec² is the panel's. */
function sky(r: Result, K: CardConfig): Row {
  const g = row("sky", "Night sky");
  if (!r.sky) return notLoaded(g, "the sky atlas");
  return g(atLeast(r.sky.mag, K.rows.skyMag), `${r.sky.zoneWord} sky (zone ${r.sky.zone})`);
}

/**
 * Room to build (value-ranking.md §5.4 (b); v4): the pad on site #1, and the drainfield with its reserve on the gentle
 * ground (15% or less) within 300 ft of where the house goes. Graded by that ground over the whole footprint; an F
 * when the build doesn't fit, which is also the first thing to check (owner, #110).
 */
function room(r: Result, K: CardConfig, footprintAc: number): Row {
  const g = row("room", "Room to build");
  if (!r.sites) return notLoaded(g, "the homesite ranking");
  const s = r.sites[0];
  if (!s) return g("F", "no build site to place the build on");
  if (s.fit !== "fits")
    return {
      ...g("F", `site #1 ${s.fit === "house only" ? "fits the house only" : "is too small for the house"}`),
      checkFirst: "your build doesn't fit on any homesite",
    };
  const x = s.gentleNearAc / footprintAc;
  const grade = atLeast(x, K.rows.roomX);
  const line = g(
    grade,
    `${fmt(s.gentleNearAc, 1)} ac of gentle ground near the house site, ${fmt(x, x < 10 ? 1 : 0)}× the build footprint`,
  );
  return grade === "F"
    ? {
        ...line,
        checkFirst: `your build doesn't fit on the gentle ground (${fmt(s.gentleNearAc, 1)} ac, ${fmt(x, 1)}× the footprint)`,
      }
    : line;
}

function trails(r: Result, K: CardConfig): Row {
  const g = row("trails", "Trails and public land");
  if (!r.protected) return notLoaded(g, "PAD-US");
  if (!r.near) return notLoaded(g, "the places");
  const open = r.protected.filter((p) => p.access === "OA");
  const adjoining = open.find((p) => p.adjoins);
  if (adjoining) return g("A", `adjoins open public land (${adjoining.name ?? "unnamed"})`);
  const head = [...r.near.trailheads].sort((a, b) => a.km - b.km)[0];
  const byHead = head ? atMost(head.km, K.rows.trailheadKm) : "F";
  const mile = open
    .filter((p) => p.distFt != null && p.distFt <= K.rows.openLandWithinFt)
    .sort((a, b) => a.distFt! - b.distFt!)[0];
  if (mile && better(byHead, "B") === "B")
    return g("B", `open public land ${fmt(mile.distFt! / 5280, 1)} mi away (${mile.name ?? "unnamed"})`);
  if (!head) return g("F", `no trailhead found within ${miles(SCREEN_CONSTANTS.near.trailheadKm)} mi`);
  return g(byHead, `a trailhead ${miles(head.km)} mi away in a straight line (${head.name})`);
}

/** The worse of the ER's and the grocery's; the grocery is the nearer of the real one and the closer one. */
function town(r: Result, K: CardConfig): Row {
  const g = row("town", "Town and hospital");
  if (!r.drives) return notLoaded(g, "the drive times");
  const h = r.drives.find((d) => d.label === NEAREST_HOSPITAL);
  const groceries = [r.drives.find((d) => d.label === REAL_GROCERY), r.closerGrocery].filter(
    (d): d is DriveEntry => !!d,
  );
  const gr = groceries.sort((a, b) => a.min - b.min)[0];
  const grade = worse(h ? atMost(h.min, K.rows.erMin) : "F", gr ? atMost(gr.min, K.rows.groceryMin) : "F");
  const toH = h
    ? `a ${fmt(h.min)}-minute drive to ${h.er === "yes" ? "an ER" : "the nearest hospital"}`
    : "no hospital found";
  const toG = gr ? `${fmt(gr.min)} to a grocery` : "no grocery found";
  return g(grade, `${toH}, ${toG}`);
}

function garden(r: Result, K: CardConfig): Row {
  const g = row("garden", "Garden ground");
  if (!r.gardens) return notLoaded(g, "the terrain");
  if (!r.gardens.length) return g("F", "no garden ground found");
  const units: SoilUnit[] | null = r.soilUnits
    ? r.soilUnits.map((u) => ({
        mukey: u.mukey,
        muname: u.muname,
        acres: u.acres,
        color: u.color,
        geos: u.geometries,
      }))
    : null;
  const classOf = (ll: [number, number]) => {
    const fl = soilAt(units, r.soils ?? null, ll)?.farmlndcl ?? null;
    return isPrimeFarmland(fl)
      ? "prime farmland"
      : /statewide/i.test(fl || "")
        ? "farmland of statewide importance"
        : null;
  };
  const [aAc, ...rest] = K.rows.gardenAc;
  const best = r.gardens
    .filter((x) => x.acres >= aAc!)
    .map((x) => ({ x, cls: classOf(x.ll) }))
    .find((y) => y.cls);
  if (best) return g("A", `a ${fmt(best.x.acres, 2)} ac garden on ${best.cls}`);
  const largest = Math.max(...r.gardens.map((x) => x.acres));
  const i = rest.findIndex((c) => largest >= c);
  const grade = i < 0 ? "F" : LETTERS[i + 1]!;
  return g(grade, `the largest garden is ${fmt(largest, 2)} ac`);
}

// ---------- the card ----------

/** The gates and rows: the same for everyone. */
export function cardFacts(
  r: Result,
  K: CardConfig = SCREEN_CONSTANTS.card,
  build: BuildConfig = SCREEN_CONSTANTS.build,
): CardFacts {
  const footprintAc = footprintFt2(build) / FT2_PER_ACRE;
  const site = buildSite(r);
  return {
    gates: [floodplain(r, site), access(r), easement(r), septic(r)],
    rows: [
      elevation(site, K),
      homesite(r),
      sky(r, K),
      room(r, K, footprintAc),
      trails(r, K),
      town(r, K),
      garden(r, K),
    ],
  };
}

/** "a", "a and b", "a, b and c". */
const listOf = (xs: string[]): string =>
  xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`;

/**
 * One person's card: the weighted grade, the verdict, and its reason (owner, #109 review): "Pass: {fail}.",
 * "{Verdict}. Check first: {warn}.", or "{Verdict}. Weakest part: {row} ({grade}, {detail})." A Pass for a low grade
 * names the weakest row. A build that doesn't fit (Room to build's F) comes first after a fail, and caps the verdict at
 * Maybe (owner, #110). When something didn't load, the verdict is at most a Maybe and the line says what.
 */
export function cardFor(facts: CardFacts, person: Person, K: CardConfig = SCREEN_CONSTANTS.card): Card {
  const w = K.weights[person];
  const graded = facts.rows.filter((x): x is Row & { grade: Letter } => x.grade !== null);
  const weight = graded.reduce((a, x) => a + w[x.key], 0);
  const points = weight > 0 ? graded.reduce((a, x) => a + w[x.key] * K.points[x.grade], 0) / weight : null;
  const grade = points === null ? null : atLeast(points, K.gradeCutoffs);
  const fail = facts.gates.find((x) => x.status === "fail");
  const warns = facts.gates.filter((x) => x.status === "warn");
  const check = facts.rows.find((x) => x.checkFirst)?.checkFirst;
  const incomplete = [
    ...new Set([...facts.gates, ...facts.rows].map((x) => x.missing).filter((m): m is string => !!m)),
  ];
  const verdict: Verdict =
    fail || (points !== null && points < K.verdict.pass)
      ? "Pass"
      : points !== null &&
          points >= K.verdict.contender &&
          warns.length <= K.verdict.contenderMaxWarns &&
          !incomplete.length &&
          !check
        ? "Contender"
        : "Maybe";
  // The lowest row; among equals, the one this person weighs most, then the card's order.
  const weakest = [...graded].sort((a, b) => K.points[a.grade] - K.points[b.grade] || w[b.key] - w[a.key])[0];
  const why = fail
    ? `${verdict}: ${lowerFirst(fail.reason)}`
    : check && verdict !== "Pass"
      ? `${verdict}. Check first: ${check}`
      : warns[0] && verdict !== "Pass"
        ? `${verdict}. Check first: ${lowerFirst(warns[0].reason)}`
        : weakest
          ? `${verdict}. Weakest part: ${lowerFirst(weakest.label)} (${weakest.grade}, ${weakest.detail})`
          : `${verdict}. Not enough of the screen ran to grade the land`;
  const more = incomplete.length ? ` (incomplete: ${listOf(incomplete)} didn't load, run again)` : "";
  return { ...facts, person, points, grade, verdict, reason: `${why}${more}.`, incomplete };
}

/** The card for a result and a person. */
export const reportCard = (r: Result, person: Person, K: CardConfig = SCREEN_CONSTANTS.card): Card =>
  cardFor(cardFacts(r, K), person, K);
