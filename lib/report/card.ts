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
import { NEAREST_HOSPITAL, REAL_GROCERY, TRAILHEAD_DRIVES, type DriveEntry } from "../screen/driveList";
import { NO_PRACTICAL_ROUTE, existingSteepLine } from "../screen/score";
import { trailheadSourceLabel } from "../screen/trailheads";
import { isPrimeFarmland, soilAt, type SoilUnit } from "../screen/soils";
import type { PartialScreenResult, RoadClass } from "../screen/types";
import type { LatLon } from "../geo/types";
import { M2FT, M2_PER_ACRE } from "../screen/util";
import { steepLandingLine } from "./driveway";
import {
  DRIVES_FROM_PICK,
  drivenRoute,
  isUserName,
  lineLabel,
  recordedIn,
  routeLost,
  steeperThanVeto,
  VERIFY_RIGHT_OF_WAY,
  routeLines,
  startLine,
  type Driven,
  type LineNames,
} from "./lines";
import { nearestFt, PERMIT_ON_FILE, permitFar, SPRING_MARKED, type Drawn, type Mark } from "./marks";

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
  /** The value in a few words, for a comparison table's cell (VR6): "3,543 ft", "zone 3a", "38 min ER". */
  short?: string;
}

/** What the card says regardless of whose weights are on. */
export interface CardFacts {
  gates: Gate[];
  rows: Row[];
  /** The household chose a line as its driveway and this screen has no route from it (WF5): said under the reason. */
  routeNote?: string;
  /** The line whose route the card scores (WF5), when the household chose one and this screen routed it. */
  drivewayLine?: string;
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
  /** Where it is, [lat, lon]: what a marker's distance is measured from (WF4). */
  ll: LatLon;
}
export function buildSite(r: Result): BuildSite | null | undefined {
  const h = r.house;
  if (h && !("outside" in h))
    return { label: "the marked house", elevFt: h.elevFt, inSfha: h.inSFHA, sfhaOnSite: null, ll: h.ll };
  if (!r.sites) return undefined;
  const s = r.sites[0];
  return s
    ? { label: "site #1", elevFt: s.elevFt, inSfha: !!s.flood, sfhaOnSite: s.sfhaOnSite, ll: s.ll }
    : null;
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
function floodplain(r: Result, site: BuildSite | null | undefined, driven: Driven): Gate {
  const g = gate("floodplain", "Floodplain");
  if (!r.flood) return g("unknown", "The FEMA flood map didn't load", "the FEMA flood map");
  if (!r.flood.mapped) return g("unknown", "FEMA has no flood mapping here");
  if (site?.inSfha) return g("fail", "The build site is in a FEMA flood zone");
  // The scored driveway: the household's route when it chose one (WF5).
  const routeFt = driven.route?.metrics.sfhaFt ?? 0;
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
 * says of the frontage (rule 7: appended), and warns at least. An easement whose record the household typed (WF5) isn't
 * asked about: the gate says where it's recorded instead, and doesn't warn for it. The household's route, steeper than
 * its veto, warns (WF5).
 */
function access(r: Result, driven: Driven, names?: LineNames, records?: ReadonlyMap<string, string>): Gate {
  const frontage = accessByFrontage(r);
  const rt = driven.route;
  const line = rt ? startLine(r, rt) : null;
  const record = line?.kind === "easement" ? records?.get(line.id) : undefined;
  // The road in (follow-up 55; owner, #123): a 4WD trail, a track or a private road at the scored route's entrance.
  const roadClass = rt ? (r.driveway!.entrances[rt.entranceIndex]?.roadClass ?? null) : null;
  const roadIn = roadInWords(roadClass);
  const asks = [
    // The line by its current name (owner, 2026-10-14), kept as typed; the kind's label otherwise, in the sentence.
    ...(line && !record
      ? [
          isUserName(line, names)
            ? `${lineLabel(line, names)}: ${VERIFY_RIGHT_OF_WAY}`
            : lowerFirst(`${lineLabel(line, names)}: ${VERIFY_RIGHT_OF_WAY}`),
        ]
      : []),
    ...(roadIn ? [`${roadIn}; check that it's public and drivable year-round`] : []),
    ...(rt && markedPrivateOutside(roadClass, rt.metrics.privateFt) ? [MARKED_PRIVATE] : []),
    ...(driven.yours && rt?.existing && rt.existing.maxGradePct > rt.existing.vetoPct
      ? [steeperThanVeto(rt.existing)]
      : []),
  ];
  // Where the easement is recorded (owner, WF5): appended, after any warnings, and not one itself.
  const notes = record ? [recordedIn(record)] : [];
  if (!asks.length && !notes.length) return frontage;
  return {
    ...frontage,
    status: frontage.status === "fail" ? "fail" : asks.length ? "warn" : frontage.status,
    reason: [frontage.reason, ...asks, ...notes].join("; "),
  };
}

/** The owner's wording (#126), appended to Legal road access. */
export const MARKED_PRIVATE =
  "the road in is marked private (OpenStreetMap); if it isn't this parcel's own drive, you need a recorded right to use it";

/**
 * A way OpenStreetMap marks private (access=private or no) outside the parcel (owner, #126): the entrance is on one
 * that runs osmRoads.privateOutsideMinM or more outside the outline, or the route runs that far along one before it
 * reaches the boundary. One inside the parcel is the parcel's own drive.
 */
export function markedPrivateOutside(c: RoadClass | null, routePrivateFt: number): boolean {
  const minFt = SCREEN_CONSTANTS.osmRoads.privateOutsideMinM * M2FT;
  const entrance = (c?.osm?.access === "private" || c?.osm?.access === "no") && c.osm.outsideFt >= minFt;
  return entrance || routePrivateFt >= minFt;
}

/**
 * "the road in is a track (OpenStreetMap)" (follow-up 55; owner, #123): from the entrance road's Census class (S1500
 * a 4WD vehicular trail, S1740 a private road) and the OpenStreetMap way on it (highway=track, or a track grade).
 * Null for an ordinary road, or when nothing is known. OSM's access=private is markedPrivateOutside's (owner, #126).
 */
export function roadInWords(c: RoadClass | null): string | null {
  if (!c) return null;
  const trail4wd = c.mtfcc === "S1500";
  const censusPrivate = c.mtfcc === "S1740";
  const track = c.osm?.highway === "track" || !!c.osm?.tracktype;
  if (!trail4wd && !censusPrivate && !track) return null;
  const noun = trail4wd ? "4WD trail" : track ? "track" : "road";
  const census = trail4wd || censusPrivate;
  const source = census && track ? "Census and OpenStreetMap" : census ? "Census" : "OpenStreetMap";
  return `the road in is a ${censusPrivate ? "private " : ""}${noun} (${source})`;
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

/**
 * As the prototype's driveway and follow-up 34's lines: the scored route (the household's, WF5) on neighbouring land,
 * with no practical drive, a drawn easement it uses there, or a steep existing drive. A drawn easement whose record the
 * household typed (WF5) isn't asked about: its record is appended instead, and it doesn't warn for it.
 */
function easement(r: Result, driven: Driven, names?: LineNames, records?: ReadonlyMap<string, string>): Gate {
  const g = gate("easement", "Easement needed");
  const d = r.driveway;
  if (!d) return g("unknown", "The driveway wasn't routed", "the roads");
  if (d.note?.includes(NO_PRACTICAL_ROUTE)) {
    // The steep-landing flag is the reason only when no route avoids it (owner, #101 Q4).
    const steep =
      d.steepLanding && !d.steepLanding.avoided ? `: ${lowerFirst(steepLandingLine(d.steepLanding))}` : "";
    return g("fail", NO_PRACTICAL_ROUTE + steep);
  }
  const scored = driven.route;
  if (!scored)
    return g("fail", d.entrances.length ? "No driveway route found" : "No road to route a driveway from");
  const warns = [
    scored.needsEasement ? "The driveway needs an easement across neighbouring land" : null,
    // "No practical drive" (owner, #99 decisions): stored by B2a for this gate.
    d.practical ? "The drive needs a steeper paved alignment or an easement" : null,
    // A drawn easement it uses across neighbouring land (follow-up 34): counted as the parcel's for the route, so asked.
    // A drawn track there isn't legal access (owner, #116): the route needs an easement, said above.
    ...outsideEasements(r, scored)
      .filter((l) => !records?.get(l.id))
      .map((l) => `${lineLabel(l, names)}: ${VERIFY_RIGHT_OF_WAY}`),
    // An existing drive it starts from, steeper than the veto (owner, #116): warned of here, as for any route.
    existingSteepLine(scored.existing),
    // The household's route, steeper than its veto (owner, WF5): it can still be chosen.
    driven.yours && scored.existing && scored.existing.maxGradePct > scored.existing.vetoPct
      ? steeperThanVeto(scored.existing)
      : null,
  ].filter((w): w is string => !!w);
  // Where the easements it uses are recorded (owner, WF5): appended, after any warnings, and not warnings.
  const notes = outsideEasements(r, scored).flatMap((l) => {
    const ref = records?.get(l.id);
    return ref ? [recordedIn(ref)] : [];
  });
  if (warns.length) return g("warn", [...warns.map((w, i) => (i ? lowerFirst(w) : w)), ...notes].join("; "));
  return g("pass", ["The driveway stays on the parcel", ...notes].join("; "));
}

/** The drawn easements a route uses that lie on neighbouring land (follow-up 34): what the Easement gate asks about. */
const outsideEasements = (r: Result, rt: NonNullable<Driven["route"]>) =>
  routeLines(r, rt).filter((l) => l.kind === "easement" && l.outsideFt > 0);

/**
 * The owner's rule: a warn when no soil on the parcel rates better than "very limited" (never a fail). A septic permit
 * you marked (WF4, owner #128) passes it, whatever the soils say, with a reminder appended (rule 7), and where the
 * permit is when it's farther than K.marks.permitFarFt from the build site: it covers the spot that was tested.
 */
function septic(r: Result, site: BuildSite | null | undefined, marks: readonly Mark[], K: CardConfig): Gate {
  const soils = septicBySoils(r);
  const permits = marks.filter((m) => m.kind === "septic");
  if (!permits.length) return soils;
  const ft = site ? nearestFt(permits, site.ll) : null;
  const far = site && ft !== null && ft > K.marks.permitFarFt ? permitFar(ft, site.label) : null;
  return {
    ...soils,
    status: "pass",
    reason: [soils.reason, PERMIT_ON_FILE, ...(far ? [far] : [])].join("; "),
  };
}

function septicBySoils(r: Result): Gate {
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
  return {
    ...g(atLeast(site.elevFt, K.rows.elevationFt), `${fmt(site.elevFt)} ft at ${site.label}`),
    short: `${fmt(site.elevFt)} ft`,
  };
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
    short: `${fmt(s.sunH, 1)} h sun, faces ${compass(s.aspectDeg)}`,
  };
}

/** The zone in words (owner, #109 review); mag/arcsec² is the panel's. */
function sky(r: Result, K: CardConfig): Row {
  const g = row("sky", "Night sky");
  if (!r.sky) return notLoaded(g, "the sky atlas");
  return {
    ...g(atLeast(r.sky.mag, K.rows.skyMag), `${r.sky.zoneWord} sky (zone ${r.sky.zone})`),
    short: `zone ${r.sky.zone}`,
  };
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
      short: s.fit === "house only" ? "house only" : "too small",
    };
  const x = s.gentleNearAc / footprintAc;
  const grade = atLeast(x, K.rows.roomX);
  const line = {
    ...g(
      grade,
      `${fmt(s.gentleNearAc, 1)} ac of gentle ground near the house site, ${fmt(x, x < 10 ? 1 : 0)}× the build footprint`,
    ),
    short: `${fmt(x, x < 10 ? 1 : 0)}× footprint`,
  };
  return grade === "F"
    ? {
        ...line,
        checkFirst: `your build doesn't fit on the gentle ground (${fmt(s.gentleNearAc, 1)} ac, ${fmt(x, 1)}× the footprint)`,
      }
    : line;
}

function trails(r: Result, K: CardConfig): Row {
  const g0 = row("trails", "Trails and public land");
  if (!r.protected) return notLoaded(g0, "PAD-US");
  const open = r.protected.filter((p) => p.access === "OA");
  const adjoining = open.find((p) => p.adjoins);
  // Before the places: with PAD-US loaded, adjoining open land is an A whatever trailheads there are, so the places
  // failing doesn't hold it back (owner, #122 review).
  if (adjoining)
    return {
      ...g0("A", `adjoins open public land (${adjoining.name ?? "unnamed"})`),
      short: "adjoins public land",
    };
  if (!r.near) return notLoaded(g0, "the places");
  // Follow-up 54 (owner, #123): graded on the quickest drive to the nearest trailheads, at their parking. Without
  // them, the straight-line cutoffs: marked incomplete only when the result says the drives failed (the drive step
  // failed, or OSRM routed none of the trailheads), or while the run is still going. Never from their absence alone
  // (#123 testing: a result screened before the drives were stored read "the drive times didn't load").
  const driven = r.near.trailheads
    .filter((t) => t.drive)
    .sort((a, b) => a.drive!.min - b.drive!.min || a.drive!.km - b.drive!.km)[0];
  const drivesFailed =
    r.failed.includes("drive") || (r.noResponse ?? []).includes(TRAILHEAD_DRIVES) || r.verdict === undefined;
  const noDrives = !driven && r.near.trailheads.length > 0 && drivesFailed;
  // An official trailhead list that didn't answer (follow-up 53): a nearer trailhead may be missing, so the row is
  // incomplete, which holds the verdict at Maybe. Not when the parcel adjoins open public land: an A either way.
  const unloaded = [
    ...(r.noResponse ?? []).map(trailheadSourceLabel).filter((x): x is string => x !== null),
    ...(noDrives ? ["the drive times"] : []),
  ];
  const g = (grade: Letter | null, detail: string): Row =>
    unloaded.length
      ? { ...g0(grade, `${detail}; incomplete: ${listOf(unloaded)} didn't load`), missing: listOf(unloaded) }
      : g0(grade, detail);
  const head = [...r.near.trailheads].sort((a, b) => a.km - b.km)[0];
  const byHead = driven
    ? atMost(driven.drive!.min, K.rows.trailheadMin)
    : head
      ? atMost(head.km, K.rows.trailheadKm)
      : "F";
  const mile = open
    .filter((p) => p.distFt != null && p.distFt <= K.rows.openLandWithinFt)
    .sort((a, b) => a.distFt! - b.distFt!)[0];
  if (mile && better(byHead, "B") === "B")
    return {
      ...g("B", `open public land ${fmt(mile.distFt! / 5280, 1)} mi away (${mile.name ?? "unnamed"})`),
      short: `public land ${fmt(mile.distFt! / 5280, 1)} mi`,
    };
  if (!head)
    return {
      ...g("F", `no trailhead found within ${miles(SCREEN_CONSTANTS.near.trailheadKm)} mi`),
      short: "no trailhead",
    };
  if (driven) {
    const d = driven.drive!;
    // An approved replacement under rule 7 (owner, #123; phase-0.md §9.35): the drive, then the straight line.
    const track = trackNote(r);
    return {
      ...g(
        byHead,
        `a trailhead ${fmt(d.min)} min (${fmt(d.mi, 1)} mi) by road${track}, ${miles(d.km)} mi straight (${driven.name})`,
      ),
      short: `trailhead ${fmt(d.min)} min`,
    };
  }
  return {
    ...g(byHead, `a trailhead ${miles(head.km)} mi away in a straight line (${head.name})`),
    short: `trailhead ${miles(head.km)} mi`,
  };
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
    ? `${articleFor(h.min)} ${fmt(h.min)}-minute drive to ${h.er === "yes" ? "an ER" : "the nearest hospital"}`
    : "no hospital found";
  const toG = gr ? `${fmt(gr.min)} to a grocery` : "no grocery found";
  const short = [h ? `ER ${fmt(h.min)} min` : "no ER", gr ? `grocery ${fmt(gr.min)}` : "no grocery"].join(
    ", ",
  );
  // Appended (rule 7; owner, #124): the drives start on tracks, as Trails says.
  return { ...g(grade, `${toH}, ${toG}${trackNote(r)}`), short };
}

/**
 * "an 82-minute drive", "a 48-minute drive": the article for a number said aloud (owner, #124: an approved correction,
 * phase-0.md §9.36): "an" for 8, 11, 18 and 80–89.
 */
export const articleFor = (n: number): "a" | "an" => {
  const r = Math.round(n);
  return r === 8 || r === 11 || r === 18 || (r >= 80 && r <= 89) ? "an" : "a";
};

/** " (the first 2.6 mi on unnamed tracks)" when the drives from the entrance start on tracks (follow-up 54). */
const trackNote = (r: Result): string =>
  r.driveFrom?.trackMi ? ` (the first ${fmt(r.driveFrom.trackMi, 1)} mi on unnamed tracks)` : "";

/**
 * The garden the row names (its best, or its largest), with "a spring is marked" appended (WF4, owner #128; rule 7)
 * when a spring you marked is within K.marks.springNearFt of it. Measured to the garden's centre: the result keeps no
 * outline (WF7 adds them).
 */
function garden(r: Result, K: CardConfig, marks: readonly Mark[]): Row {
  const springs = marks.filter((m) => m.kind === "spring");
  const spring = (row: Row, ll: LatLon): Row => {
    const ft = nearestFt(springs, ll);
    return ft !== null && ft <= K.marks.springNearFt
      ? { ...row, detail: `${row.detail}; ${SPRING_MARKED}` }
      : row;
  };
  return gardenRow(r, K, spring);
}

function gardenRow(r: Result, K: CardConfig, spring: (row: Row, ll: LatLon) => Row): Row {
  const g = row("garden", "Garden ground");
  if (!r.gardens) return notLoaded(g, "the terrain");
  if (!r.gardens.length) return { ...g("F", "no garden ground found"), short: "none" };
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
  if (best)
    return spring(
      {
        ...g("A", `a ${fmt(best.x.acres, 2)} ac garden on ${best.cls}`),
        short: `${fmt(best.x.acres, 2)} ac, ${best.cls}`,
      },
      best.x.ll,
    );
  const big = r.gardens.reduce((a, x) => (x.acres > a.acres ? x : a));
  const largest = big.acres;
  const i = rest.findIndex((c) => largest >= c);
  const grade = i < 0 ? "F" : LETTERS[i + 1]!;
  return spring(
    { ...g(grade, `the largest garden is ${fmt(largest, 2)} ac`), short: `${fmt(largest, 2)} ac` },
    big.ll,
  );
}

// ---------- the card ----------

/**
 * The gates and rows: the same for everyone. `drawn`: what the parcel holds besides its result (marks.ts), when the
 * report is drawn with the parcel: its names for its drawn lines (without them a line reads by its kind), and its
 * markers (WF4).
 */
export function cardFacts(
  r: Result,
  K: CardConfig = SCREEN_CONSTANTS.card,
  build: BuildConfig = SCREEN_CONSTANTS.build,
  drawn?: Drawn,
): CardFacts {
  const footprintAc = footprintFt2(build) / FT2_PER_ACRE;
  const site = buildSite(r);
  const names = drawn?.names,
    marks = drawn?.marks ?? [],
    records = drawn?.records;
  // The route scored: the household's when it chose a line and this screen has a route from it (WF5).
  const driven = drivenRoute(r, drawn?.driveway);
  const facts = {
    gates: [
      floodplain(r, site, driven),
      access(r, driven, names, records),
      easement(r, driven, names, records),
      septic(r, site, marks, K),
    ],
    rows: [
      elevation(site, K),
      homesite(r),
      sky(r, K),
      room(r, K, footprintAc),
      trails(r, K),
      town(r, K),
      garden(r, K, marks),
    ],
  };
  return withYourRoute(facts, r, driven, drawn);
}

/**
 * The household's route (WF5): the Town and Trails panels say their drive times start where the app's pick meets the
 * road, when the chosen route meets it elsewhere (the drives are timed from there until WF6 re-times them); and the card
 * says so when a line was chosen and this screen has no route from it.
 */
function withYourRoute(facts: CardFacts, r: Result, driven: Driven, drawn?: Drawn): CardFacts {
  const moved = !!driven.yours && !!driven.pick && driven.route?.entranceIndex !== driven.pick.entranceIndex;
  const rows = moved
    ? facts.rows.map((x) =>
        x.key === "town" || x.key === "trails"
          ? { ...x, panelNote: [x.panelNote, DRIVES_FROM_PICK].filter(Boolean).join(" ") }
          : x,
      )
    : facts.rows;
  const lostName = driven.lost && drawn?.driveway ? (drawn.names.get(drawn.driveway) ?? "your line") : null;
  return {
    ...facts,
    rows,
    ...(lostName ? { routeNote: routeLost(lostName) } : {}),
    ...(driven.yours ? { drivewayLine: driven.yours.id } : {}),
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
/**
 * What holds a parcel at Maybe whatever its grade, besides its warnings (cardFor), in the words the Grade and verdict
 * panel uses for them (#118 review): the two lists are one, so the panel can't fall out of step with the rule.
 */
export const MAYBE_CAPS = {
  incomplete: "something didn't load (run it again)",
  checkFirst: "there's a 'Check first' item, such as a build that doesn't fit (Room to build F)",
} as const;

/** Which of MAYBE_CAPS hold for these gates and rows. */
export function maybeCaps(facts: CardFacts): Record<keyof typeof MAYBE_CAPS, boolean> {
  return {
    incomplete: [...facts.gates, ...facts.rows].some((x) => !!x.missing),
    checkFirst: facts.rows.some((x) => !!x.checkFirst),
  };
}

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
          !Object.values(maybeCaps(facts)).some(Boolean)
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
export const reportCard = (
  r: Result,
  person: Person,
  drawn?: Drawn,
  K: CardConfig = SCREEN_CONSTANTS.card,
): Card => cardFor(cardFacts(r, K, SCREEN_CONSTANTS.build, drawn), person, K);
