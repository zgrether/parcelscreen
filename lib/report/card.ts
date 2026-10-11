/**
 * The parcel report card (value-ranking.md §3.2, approved #95; VR2): the dealbreaker gates, the graded rows, and,
 * per person, the parcel grade, the verdict and its one-line reason. Pure, from a result and the card's config.
 * It isn't stored: the weights switch per person, and the result's shape is frozen. VR5 renders it.
 *
 * Money can fix the driveway, clearing, septic, the well and power, so they never reach the grade (§3.3): the
 * gates only warn or fail, and the rows are the qualities money can't add.
 */
import { fmt } from "../format";
import { SCREEN_CONSTANTS } from "../screen/config";
import { NEAREST_HOSPITAL, REAL_GROCERY, type DriveEntry } from "../screen/driveList";
import { NO_PRACTICAL_ROUTE } from "../screen/score";
import { isPrimeFarmland, soilAt, type SoilUnit } from "../screen/soils";
import type { PartialScreenResult } from "../screen/types";
import { M2FT, M2_PER_ACRE } from "../screen/util";
import { steepLandingLine } from "./driveway";

export type CardConfig = typeof SCREEN_CONSTANTS.card;
type BuildConfig = typeof SCREEN_CONSTANTS.build;

export type Letter = "A" | "B" | "C" | "D" | "F";
export type Person = keyof CardConfig["weights"];
export type RowKey = keyof CardConfig["weights"][Person];
export type GateKey = "floodplain" | "access" | "easement" | "septic";
/** "unknown": the data didn't load (a step failed, or FEMA hasn't mapped the area). It counts as a warn. */
export type GateStatus = "pass" | "warn" | "fail" | "unknown";
export type Verdict = "Contender" | "Maybe" | "Pass";

export interface Gate {
  key: GateKey;
  label: string;
  status: GateStatus;
  /** A sentence without its full stop; the verdict's reason line can quote it. */
  reason: string;
}

export interface Row {
  key: RowKey;
  label: string;
  /** null: not graded (its step didn't run), and left out of the parcel grade. */
  grade: Letter | null;
  detail: string;
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
  verdict: Verdict;
  /** "Maybe: no soil on the parcel rates better than very limited for a septic field." */
  reason: string;
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

/** "fits as is" for a sentence's start, but an acronym stays: "FEMA has…". */
const lowerFirst = (s: string): string => (/^[A-Z]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));

// ---------- the gates ----------

type Result = PartialScreenResult;
const gate = (key: GateKey, label: string) => (status: GateStatus, reason: string) => ({
  key,
  label,
  status,
  reason,
});

function floodplain(r: Result): Gate {
  const g = gate("floodplain", "Floodplain");
  if (!r.flood) return g("unknown", "The FEMA flood map didn't load");
  if (!r.flood.mapped) return g("unknown", "FEMA has no flood mapping here");
  if (r.sites?.[0]?.flood) return g("fail", "The build site is in a FEMA flood zone");
  if (r.flood.sfha)
    return g(
      "warn",
      `A FEMA flood zone covers ${fmt(r.flood.sfhaAcres, 1)} ac of the parcel, not the build site`,
    );
  return g("pass", "No FEMA flood zone on the parcel");
}

function access(r: Result): Gate {
  const g = gate("access", "Legal road access");
  const d = r.driveway;
  if (!d) return g("unknown", "The roads didn't load");
  if (!d.entrances.length)
    return g(
      "fail",
      `No road within ${SCREEN_CONSTANTS.driveway.fallbackMaxM} m of the boundary (landlocked, or TIGER is wrong)`,
    );
  const front = d.entrances.find((e) => !e.fallback);
  if (front) return g("pass", `Frontage on ${front.name === "road" ? "an unnamed road" : front.name}`);
  return g(
    "warn",
    `No road frontage found within 130 ft; routed from the nearest road point, ${fmt(d.entrances[0]!.gapFt ?? NaN)} ft off the line (the deed or plat must show access)`,
  );
}

function easement(r: Result): Gate {
  const g = gate("easement", "Easement needed");
  const d = r.driveway;
  if (!d) return g("unknown", "The driveway wasn't routed");
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
  ].filter((w): w is string => !!w);
  if (warns.length) return g("warn", warns.map((w, i) => (i ? lowerFirst(w) : w)).join("; "));
  return g("pass", "The driveway stays on the parcel");
}

/** The owner's rule: a warn when no soil on the parcel rates better than "very limited" (never a fail). */
function septic(r: Result): Gate {
  const g = gate("septic", "Septic");
  if (!r.soils) return g("unknown", "The NRCS soils didn't load");
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

function elevation(r: Result, K: CardConfig): Row {
  const g = row("elevation", "Elevation at the build site");
  if (!r.sites) return g(null, "the homesites weren't ranked");
  const s = r.sites[0];
  if (!s) return g(null, "no build site to measure");
  return g(atLeast(s.elevFt, K.rows.elevationFt), `${fmt(s.elevFt)} ft at site #1`);
}

/** Site #1's quality grade only (owner, #95 review): its build cost picks the site, but never grades the parcel. */
function homesite(r: Result): Row {
  const g = row("homesite", "Best homesite");
  if (!r.sites) return g(null, "the homesites weren't ranked");
  const s = r.sites[0];
  if (!s) return g("F", "no build site found");
  return g(s.qGrade, `site #1's quality ${s.qGrade} (${fmt(s.quality)})`);
}

function sky(r: Result, K: CardConfig): Row {
  const g = row("sky", "Night sky");
  if (!r.sky) return g(null, "the sky wasn't measured");
  return g(atLeast(r.sky.mag, K.rows.skyMag), `${fmt(r.sky.mag, 2)} mag/arcsec² overhead`);
}

/**
 * Until VR3 places the footprint on the site (§5.4 (b)), the gentle acres over the whole footprint's: the same
 * multiples as §3.2's illustration.
 */
function room(r: Result, K: CardConfig, footprintAc: number): Row {
  const g = row("room", "Room to build");
  if (!r.terrain) return g(null, "the terrain wasn't read");
  const x = r.terrain.acresUnder15 / footprintAc;
  return g(
    atLeast(x, K.rows.roomX),
    `${fmt(r.terrain.acresUnder15, 1)} ac of gentle ground, ${fmt(x, x < 10 ? 1 : 0)}× the build footprint`,
  );
}

function trails(r: Result, K: CardConfig): Row {
  const g = row("trails", "Trails and public land");
  if (!r.protected || !r.near)
    return g(null, r.protected ? "the trailheads weren't searched" : "PAD-US didn't load");
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
  if (!head) return g("F", `no trailhead found within ${SCREEN_CONSTANTS.near.trailheadKm} km`);
  return g(byHead, `a trailhead ${fmt(head.km, 1)} km away in a straight line (${head.name})`);
}

/** The worse of the ER's and the grocery's; the grocery is the nearer of the real one and the closer one. */
function town(r: Result, K: CardConfig): Row {
  const g = row("town", "Town and hospital");
  if (!r.drives) return g(null, "the drive times weren't routed");
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
  if (!r.gardens) return g(null, "the gardens weren't searched");
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
  return {
    gates: [floodplain(r), access(r), easement(r), septic(r)],
    rows: [
      elevation(r, K),
      homesite(r),
      sky(r, K),
      room(r, K, footprintAc),
      trails(r, K),
      town(r, K),
      garden(r, K),
    ],
  };
}

/**
 * One person's card: the weighted grade, the verdict, and the reason from the weakest gate or row. A fail beats a
 * warn (an unknown counts as one), and a warn beats the lowest row; a Pass for a low grade names the lowest row.
 */
export function cardFor(facts: CardFacts, person: Person, K: CardConfig = SCREEN_CONSTANTS.card): Card {
  const w = K.weights[person];
  const graded = facts.rows.filter((x): x is Row & { grade: Letter } => x.grade !== null);
  const weight = graded.reduce((a, x) => a + w[x.key], 0);
  const points = weight > 0 ? graded.reduce((a, x) => a + w[x.key] * K.points[x.grade], 0) / weight : null;
  const grade = points === null ? null : atLeast(points, K.gradeCutoffs);
  const fail = facts.gates.find((x) => x.status === "fail");
  const warns = facts.gates.filter((x) => x.status === "warn" || x.status === "unknown");
  const verdict: Verdict =
    fail || (points !== null && points < K.verdict.pass)
      ? "Pass"
      : points !== null && points >= K.verdict.contender && warns.length <= K.verdict.contenderMaxWarns
        ? "Contender"
        : "Maybe";
  // The lowest row; among equals, the one this person weighs most, then the card's order.
  const weakest = [...graded].sort((a, b) => K.points[a.grade] - K.points[b.grade] || w[b.key] - w[a.key])[0];
  const rowWhy =
    weakest && `the weakest part is ${lowerFirst(weakest.label)} (${weakest.grade}, ${weakest.detail})`;
  const gateWhy = fail ?? (verdict === "Pass" ? undefined : warns[0]);
  const why = gateWhy
    ? lowerFirst(gateWhy.reason)
    : (rowWhy ?? "not enough of the screen ran to grade the land");
  return { ...facts, person, points, grade, verdict, reason: `${verdict}: ${why}.` };
}

/** The card for a result and a person. */
export const reportCard = (r: Result, person: Person, K: CardConfig = SCREEN_CONSTANTS.card): Card =>
  cardFor(cardFacts(r, K), person, K);
