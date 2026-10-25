/**
 * The parcel report card (value-ranking.md §3.2, approved #95; VR2): the dealbreaker gates, the graded rows, and,
 * per person, the parcel grade, the verdict and its one-line reason. Pure, from a result and the card's config.
 * It isn't stored: the rubric switches per person (step 1: lib/rubric), and the result's shape is frozen. VR5 renders it.
 *
 * Money can fix the driveway, clearing, septic, the well and power, so they never reach the grade (§3.3): the
 * gates only warn or fail, and the rows are the qualities money can't add.
 */
import { distance } from "@turf/turf";
import { compass, fmt } from "../format";
import { SCREEN_CONSTANTS } from "../screen/config";
import {
  NEAREST_HOSPITAL,
  REAL_GROCERY,
  TRAILHEAD_DRIVES,
  TRAILHEAD_PARKING,
  type DriveEntry,
} from "../screen/driveList";
import { derivedSites } from "../screen/derive";
import { lpZone } from "../screen/sky";
import { NO_PRACTICAL_ROUTE, existingSteepLine } from "../screen/score";
import { servesLine, trailheadSourceLabel } from "../screen/trailheads";
import { isPrimeFarmland, soilAt, type SoilUnit } from "../screen/soils";
import type { PartialScreenResult, RoadClass, ScoredDriveway, ScoredSite, Site } from "../screen/types";
import type { LatLon } from "../geo/types";
import { M2FT, M2_PER_ACRE } from "../screen/util";
import { steepLandingLine } from "./driveway";
import {
  DRIVES_FROM_PICK,
  chosenDrive,
  drivenRoute,
  isUserName,
  lineLabel,
  recordedIn,
  routeLost,
  steeperThanVeto,
  VERIFY_RIGHT_OF_WAY,
  routeLines,
  startLine,
  type ChosenDrive,
  type Driven,
  type LineNames,
} from "./lines";
import { rankSites, type RankedSite } from "./sites";
import {
  floodLetterOnFile,
  INTERNET_CONFIRMED,
  nearestFt,
  PERMIT_ON_FILE,
  permitFar,
  SPRING_MARKED,
  type Drawn,
  type Facts,
  type Mark,
} from "./marks";
import {
  BUDGET_SITS,
  budgetStatusOf,
  COST_WORDS,
  costRange,
  costToEnjoy,
  type BudgetStatus,
  type CostToEnjoy,
} from "./cost";
import { shortPrice } from "../client/askingPrice";
import { DEFAULT_PAVING } from "../config/costs";
import type { PavingContext } from "./ground";
import { NOT_MEASURED, OUTSIDE_AREA, stationLine, stationName } from "./climate";
import { IN_WINTER } from "./privacy";
import { LONG_TRAIL_DRIVES } from "../screen/longTrail";
import { openPct, viewLine, viewShort } from "./view";
import { atLeast, atMost, gradedRows, parcelGrade, verdictLines } from "../rubric/grade";
import { EDITOR_TITLES, FACTOR_LABELS } from "../rubric/words";
import { thresholdStatus, thresholdWords, type Measure } from "../rubric/musts";
import type { Budgets, Factor, GateKey, Letter, NamedRubric, RowKey, Rubric } from "../rubric/types";
import { weightsOf } from "../rubric/weights";
import {
  asideLabel,
  asideOf,
  isMustOf,
  withoutFactors,
  type Adjusted,
  type Adjustment,
  type SetAside,
  letterText,
  shownLetter,
} from "./adjust";

export type { GateKey, Letter, NamedRubric, RowKey } from "../rubric/types";
export { atLeast, atMost } from "../rubric/grade";

export type CardConfig = typeof SCREEN_CONSTANTS.card;
type BuildConfig = typeof SCREEN_CONSTANTS.build;

/** "unknown": the data can't say (FEMA hasn't mapped the area, or the data didn't load). Never a warn. */
export type GateStatus = "pass" | "warn" | "fail" | "unknown";
export type Verdict = "Contender" | "Maybe" | "Pass";
/**
 * The verdict as people read it (owner, 2026-10-20, polish #11): "Pass" read as "passes", so it says "Not for us".
 * The stored and compared value stays "Pass"; every word on screen and in report text comes from here.
 */
export const VERDICT_WORD: Record<Verdict, string> = {
  Contender: "Contender",
  Maybe: "Maybe",
  Pass: "Not for us",
};

export interface Gate {
  key: GateKey;
  label: string;
  status: GateStatus;
  /** A sentence without its full stop; the verdict's reason line can quote it. */
  reason: string;
  /** The data that didn't load ("the FEMA flood map"): the card is incomplete (owner, #109 review). */
  missing?: string;
  /**
   * The reason's own first clause when more follows it ("Frontage on an unnamed road"): the card's row puts what follows,
   * what made it a warning, on its own line (polish #7). The reason's words are the same.
   */
  first?: string;
  /** The person's override on this parcel (step 12): the status above is theirs. */
  adjusted?: Adjusted;
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
  /** The number the band graded, in its unit (step 1): what a threshold Must is compared with (lib/rubric/musts.ts). */
  measure?: Measure;
  /**
   * Within budget's outcome as a Must (step 10): the worse of the two budgets', and its reason, the parts at that
   * status ("ready to build $330–595k, over your $300k").
   */
  budget?: { status: BudgetStatus; reason: string };
  /** The person's override on this parcel (step 12): the letter above, or the Must's result, is theirs. */
  adjusted?: Adjusted;
  /** A limit's result the person set on this parcel (step 12): it stands for the measure's. */
  mustStatus?: "pass" | "fail";
}

export type { BudgetStatus };

/** What the card says regardless of whose weights are on, at one build site. */
export interface CardFacts {
  gates: Gate[];
  rows: Row[];
  /**
   * The ranked site the site rows read (step 7): an index into the result's `sites`, the person's best by reportCard.
   * A marked house is the build site whatever this says, as before.
   */
  at: number;
  /** The household chose a line as its driveway and this screen has no route from it (WF5): said under the reason. */
  routeNote?: string;
  /** The line whose route the card scores (WF5), when the household chose one and this screen routed it. */
  drivewayLine?: string;
  /** The cost to enjoy at the build site (step 10), when the parcel's lines, price and rates came with the result. */
  cost?: CostToEnjoy | null;
  /** Settings' paving choice and the parcel's lines, with them (step 10): the Driveway section's Paving row reads them. */
  paving?: PavingContext;
  /** What the person set aside on this parcel (step 12): off the grade, still listed in its tier. */
  setAside?: SetAside[];
}

export interface Card extends CardFacts {
  /** The rubric that graded it (step 1): whose grade this is. */
  rubric: NamedRubric;
  /** The weighted average of the graded rows' points (A 4 … F 0); null when no row is graded. */
  points: number | null;
  grade: Letter | null;
  /** Capped at Maybe when something didn't load. */
  verdict: Verdict;
  /** "Maybe. Check first: no soil on the parcel rates better than very limited for a septic field." */
  reason: string;
  /** What the reason line leads with, in its own words (step 7: the answer line reuses it, lib/report/answer.ts). */
  lead: Lead;
  /** What didn't load, in the card's order: the reason line says so, and asks for a re-run. */
  incomplete: string[];
  /**
   * What holds a grade good enough for a Contender at Maybe, by name (polish #5, owner 2026-10-20): the answer's
   * joining words since J-4 (UX part 2), "Maybe · A, held by: legal road access". Absent when nothing does.
   */
  heldBy?: string[];
  /** Within budget, when this rubric holds it as a Must (step 10): its status and reason, for the Must rows. */
  budgetMust?: { status: BudgetStatus; reason: string };
  /** The homesites in this person's order (step 7, lib/report/sites.ts); empty before they're ranked. */
  sites: readonly RankedSite[];
}

/**
 * What a card's reason leads with: a failed Must (a gate), a limit not met, something to check first (a warning, or a
 * build that doesn't fit), the weakest row, or none. `text` is the phrase the reason line puts after its lead-in.
 */
export interface Lead {
  kind: "fail" | "limit" | "check" | "weakest" | "none";
  text: string;
}

const LETTERS: readonly Letter[] = ["A", "B", "C", "D"];

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
export const lowerFirst = (s: string): string =>
  /^[A-Z]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1);

type Result = PartialScreenResult;

/**
 * The build site: the house when you've placed one (owner, #109 review), else the ranked site at `at` (step 7: the
 * person's best site, lib/report/sites.ts; site #1 by default). null when there's neither; undefined when the
 * homesites weren't ranked and there's no house.
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
export function buildSite(r: Result, at = 0): BuildSite | null | undefined {
  const h = r.house;
  if (h && !("outside" in h))
    return { label: "the marked house", elevFt: h.elevFt, inSfha: h.inSFHA, sfhaOnSite: null, ll: h.ll };
  if (!r.sites) return undefined;
  const s = r.sites[at];
  return s
    ? { label: siteLabel(s), elevFt: s.elevFt, inSfha: !!s.flood, sfhaOnSite: s.sfhaOnSite, ll: s.ll }
    : null;
}

/** A ranked site as the report names it, by the engine's rank (its pin's number): "site #3". */
export const siteLabel = (s: { rank: number }): string => `site #${s.rank}`;

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
function floodplain(r: Result, site: BuildSite | null | undefined, driven: Driven, known?: Facts): Gate {
  const byMap = floodplainByMap(r, site, driven);
  // J-5 (UX part 2 PR 3c): a flood letter marked for the parcel passes it, whatever the map says, with a reminder
  // appended (rule 7), as a septic permit does for Septic.
  const letter = known?.floodLetter;
  if (!letter) return byMap;
  return { ...byMap, status: "pass", reason: [byMap.reason, floodLetterOnFile(letter.kind)].join("; ") };
}

function floodplainByMap(r: Result, site: BuildSite | null | undefined, driven: Driven): Gate {
  const g = gate("floodplain", FACTOR_LABELS.floodplain);
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
    first: frontage.reason,
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
  const g = gate("access", FACTOR_LABELS.access);
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
  const g = gate("easement", FACTOR_LABELS.easement);
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
  const g = gate("septic", FACTOR_LABELS.septic);
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
  const g = row("elevation", FACTOR_LABELS.elevation);
  if (site === undefined) return notLoaded(g, "the homesite ranking");
  // No build site: left out, as the Best homesite row's F carries it (owner, #109 review).
  if (site === null || site.elevFt === null) return g(null, "no build site to measure");
  return {
    ...g(atLeast(site.elevFt, K.rows.elevationFt), `${fmt(site.elevFt)} ft at ${site.label}`),
    short: `${fmt(site.elevFt)} ft`,
    measure: { value: site.elevFt, unit: "ft" },
  };
}

/**
 * The site's quality grade only (owner, #95 review): its build cost picks the engine's site #1, but never grades the
 * parcel. The line says it in plain words; the quality score is the panel's (owner, #110). Step 7: the site at `at`.
 */
function homesite(r: Result, at: number, derived: ScoredSite[] | undefined): Row {
  const g = row("homesite", FACTOR_LABELS.homesite);
  if (!r.sites) return notLoaded(g, "the homesite ranking");
  // A site's quality derives from its measurements (v8; lib/screen/derive.ts).
  const s = derived?.[at];
  if (!s) return g("F", "no build site found");
  return {
    ...g(
      s.qGrade,
      `faces ${compass(s.aspectDeg)}, ${fmt(s.sunH, 1)} h of December sun, ${fmt(s.slopeDeg)}° slope`,
    ),
    panelNote: `${siteLabel(s)}'s quality ${s.qGrade} (${fmt(s.quality)})`,
    short: `${fmt(s.sunH, 1)} h sun, faces ${compass(s.aspectDeg)}`,
    // What a Best homesite limit is checked against (step 4, §9.50 amended): December sun at the site.
    measure: { value: s.sunH, unit: "h" },
  };
}

/**
 * The zone in words (owner, #109 review); mag/arcsec² is the panel's. Site #1 reads the parcel's reading, as before;
 * another site its own (step 7; v8 stores each site's), with the zone its mag falls in.
 */
function sky(r: Result, K: CardConfig, at: number): Row {
  const g = row("sky", FACTOR_LABELS.sky);
  if (!r.sky) return notLoaded(g, "the sky atlas");
  const own = at > 0 ? r.sites?.[at]?.sky : undefined;
  const mag = own?.mag ?? r.sky.mag;
  const [zone, zoneWord] = own ? zoneOfMag(own.mag) : [r.sky.zone, r.sky.zoneWord];
  return {
    ...g(atLeast(mag, K.rows.skyMag), `${zoneWord} sky (zone ${zone})`),
    short: `zone ${zone}`,
    measure: { value: mag, unit: "mag" },
  };
}

/** The zone and its word for a zenith brightness in mag/arcsec²: lpMag inverted, then lpZone (sky.ts). */
export function zoneOfMag(mag: number): [zone: string, word: string] {
  return lpZone(Math.pow(100, (22 - mag) / 5) - 1);
}

/**
 * Room to build (value-ranking.md §5.4 (b); v4): the pad on the site, and the drainfield with its reserve on the gentle
 * ground (15% or less) within 300 ft of where the house goes. Graded by that ground over the whole footprint; an F
 * when the build doesn't fit, which is also the first thing to check (owner, #110). Step 7: the site at `at`.
 */
function room(r: Result, K: CardConfig, footprintAc: number, at: number): Row {
  const g = row("room", FACTOR_LABELS.room);
  if (!r.sites) return notLoaded(g, "the homesite ranking");
  const s = r.sites[at];
  if (!s) return g("F", "no build site to place the build on");
  if (s.fit !== "fits")
    return {
      ...g(
        "F",
        `${siteLabel(s)} ${s.fit === "house only" ? "fits the house only" : "is too small for the house"}`,
      ),
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
    measure: { value: x, unit: "x" },
  };
  return grade === "F"
    ? {
        ...line,
        checkFirst: `your build doesn't fit on the gentle ground (${fmt(s.gentleNearAc, 1)} ac, ${fmt(x, 1)}× the footprint)`,
      }
    : line;
}

/**
 * The grade the Driveway row reads (step 7 plan §3.1): the steepest grade on the chosen route, over 30 m (its design
 * grade where the router designed an alternative), or the existing drive's raw grade when that's steeper, as the
 * over-limit term reads them (score.ts overLimitPointsFrom).
 */
export function drivewayGradePct(f: ScoredDriveway): number {
  const route = f.legal || f.limitPct === null ? f.maxGradePct : (f.designPct ?? f.maxGradePct);
  return Math.max(route, f.existing?.maxGradePct ?? -Infinity);
}

/**
 * The Driveway row (step 7): the build site's chosen driveway, graded on its steepest grade against the rubric's band
 * (question 10 sets its edge). Its length is in the line; its cost is Cost to enjoy's. No route, or no practical drive:
 * an F.
 */
function driveway(r: Result, K: CardConfig, at: number): Row {
  const g = row("driveway", FACTOR_LABELS.driveway);
  const notRouted = (): Row => ({ ...g(null, "the driveway wasn't routed"), missing: "the roads" });
  if (!r.driveway) return notRouted();
  const h = r.house;
  const house = h && !("outside" in h) ? { label: "the marked house", dw: h.driveway } : null;
  if (!house && !r.sites) return notLoaded(g, "the homesite ranking");
  const s = r.sites?.[at];
  const spot = house ?? (s ? { label: siteLabel(s), dw: s.driveway } : null);
  if (!spot) return g(null, "no build site to measure");
  if (spot.dw === undefined) return notRouted();
  if (spot.dw === null) return { ...g("F", `no driveway route reaches ${spot.label}`), short: "no route" };
  if (spot.dw.noPractical)
    return { ...g("F", `no practical driveway to ${spot.label}`), short: "no practical route" };
  return drivewayGraded(
    { lengthFt: spot.dw.lengthFt, gradePct: drivewayGradePct(spot.dw), needsEasement: spot.dw.needsEasement },
    K,
  );
}

/** The Driveway row for a driveway: its length and steepest grade in the line, graded on the steepest. */
function drivewayGraded(dw: ChosenDrive, K: CardConfig): Row {
  const g = row("driveway", FACTOR_LABELS.driveway);
  const pct = dw.gradePct;
  const easement = dw.needsEasement ? "; needs an easement across neighbouring land" : "";
  return {
    ...g(atMost(pct, K.rows.drivewayPct), `${fmt(dw.lengthFt)} ft, ${fmt(pct)}% at its steepest${easement}`),
    short: `${fmt(pct)}% steepest`,
    measure: { value: pct, unit: "%" },
  };
}

/** Appended to the Trails row when the drives went to the trailhead points, the parking lookup unanswered (#140). */
export const TIMED_TO_THE_TRAILHEAD =
  "timed to the trailhead, not its parking (the parking lookup didn't answer)";

function trails(r: Result, K: CardConfig): Row {
  const g0 = row("trails", FACTOR_LABELS.trails);
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
    r.failed.includes("drive") ||
    (r.noResponse ?? []).includes(TRAILHEAD_DRIVES) ||
    r.cancelled === undefined;
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
    // The parking lookup didn't answer (owner, #140 review): the drive went to the trailhead itself. Said, appended.
    const parking = (r.noResponse ?? []).includes(TRAILHEAD_PARKING) ? `; ${TIMED_TO_THE_TRAILHEAD}` : "";
    return {
      ...g(
        byHead,
        `a trailhead ${fmt(d.min)} min (${fmt(d.mi, 1)} mi) by road${track}, ${miles(d.km)} mi straight (${driven.name})${parking}${serves(driven)}`,
      ),
      short: `trailhead ${fmt(d.min)} min`,
      measure: { value: d.min, unit: "min" },
    };
  }
  return {
    ...g(byHead, `a trailhead ${miles(head.km)} mi away in a straight line (${head.name})${serves(head)}`),
    short: `trailhead ${miles(head.km)} mi`,
    measure: { value: head.km, unit: "km" },
  };
}

/** The TREC trails the named trailhead serves (step 2), appended: "; serves: A, B". Empty when none. */
function serves(t: { name: string; serves?: readonly string[] | undefined }): string {
  const line = servesLine(t);
  return line ? `; ${line}` : "";
}

/** Whether the drive step ran: a failed one (OSRM down) is unknown, never "none found" (owner, #216). */
const drivesLoaded = (r: Result): boolean => !!r.drives && !r.failed.includes("drive");

/**
 * The grocery drive: the nearer of the real one and the closer one. Step 11 (plan §2.1) split the ER out into Hospital;
 * until then this row was the worse of the two.
 */
function town(r: Result, K: CardConfig): Row {
  const g = row("town", FACTOR_LABELS.town);
  if (!drivesLoaded(r)) return notLoaded(g, "the drive times");
  const groceries = [r.drives!.find((d) => d.label === REAL_GROCERY), r.closerGrocery].filter(
    (d): d is DriveEntry => !!d,
  );
  const gr = groceries.sort((a, b) => a.min - b.min)[0];
  // Appended (rule 7; owner, #124): the drives start on tracks, as Trails says.
  return {
    ...g(
      gr ? atMost(gr.min, K.rows.groceryMin) : "F",
      `${gr ? `${articleFor(gr.min)} ${fmt(gr.min)}-minute drive to a grocery` : "no grocery found"}${trackNote(r)}`,
    ),
    short: gr ? `grocery ${fmt(gr.min)} min` : "no grocery",
    ...(gr ? { measure: { value: gr.min, unit: "min" } } : {}),
  };
}

/**
 * The drive to the nearest hospital, an ER where it has one (step 11, plan §2.1: the old Town and hospital row's ER
 * half, its words unchanged). The ER drive is the measure a threshold Must reads ("over 30 min to an ER").
 */
function hospital(r: Result, K: CardConfig): Row {
  const g = row("hospital", FACTOR_LABELS.hospital);
  if (!drivesLoaded(r)) return notLoaded(g, "the drive times");
  const h = r.drives!.find((d) => d.label === NEAREST_HOSPITAL);
  const toH = h
    ? `${articleFor(h.min)} ${fmt(h.min)}-minute drive to ${h.er === "yes" ? "an ER" : "the nearest hospital"}`
    : "no hospital found";
  return {
    ...g(h ? atMost(h.min, K.rows.erMin) : "F", `${toH}${trackNote(r)}`),
    short: h ? `ER ${fmt(h.min)} min` : "no ER",
    ...(h ? { measure: { value: h.min, unit: "min" } } : {}),
  };
}

/**
 * Climate at the build site (step 11, plan §2.2): the worse of January's mean low and July's mean high against the
 * person's limits, at the site the card reads (the marked house, if any); the station's snowfall and frost-free days
 * beside them, not graded. A screen made before it has no reading: "not measured", unknown, never a fail.
 */
function climate(r: Result, K: CardConfig, at: number): Row {
  const g = row("climate", FACTOR_LABELS.climate);
  if (!r.climate) return { ...g(null, NOT_MEASURED), short: "not measured" };
  const house = r.house && !("outside" in r.house) ? r.house : null;
  const spot = house ?? r.sites?.[at];
  if (!spot && !r.climate.outside) {
    if (!r.sites) return notLoaded(g, "the homesite ranking");
    // No build site: left out, as Elevation is (the Best homesite row's F carries it).
    return g(null, "no build site to measure");
  }
  const c = spot?.climate;
  if (!c) return { ...g(null, OUTSIDE_AREA), short: "not measured" };
  const where = house ? "the marked house" : siteLabel(spot as Site);
  const st = c.station ? r.climate.stations.find((x) => x.id === c.station) : undefined;
  const grade = worse(atLeast(c.janLowF, K.rows.janLowF), atMost(c.julHighF, K.rows.julHighF));
  return {
    ...g(
      grade,
      `January lows ${fmt(c.janLowF)} °F, July highs ${fmt(c.julHighF)} °F at ${where} (${fmt(spot!.elevFt ?? 0)} ft)` +
        (st ? `; ${stationLine(st)} at ${stationName(st, c.stationMi)}` : ""),
    ),
    short: `Jan ${fmt(c.janLowF)}°, Jul ${fmt(c.julHighF)}°F`,
  };
}

/**
 * Privacy at the build site (step 11, plan §2.3): the worse of the nearest house's distance and the houses in sight
 * within a mile, against the person's limits. The houses in sight are the measure a limit reads ("no house in sight").
 */
function privacy(r: Result, K: CardConfig, at: number): Row {
  const g = row("privacy", FACTOR_LABELS.privacy);
  if (!r.privacy) return { ...g(null, NOT_MEASURED), short: "not measured" };
  if (r.privacy.outside) return { ...g(null, OUTSIDE_AREA), short: "not measured" };
  const house = r.house && !("outside" in r.house) ? r.house : null;
  const spot = house ?? r.sites?.[at];
  if (!spot) {
    if (!r.sites) return notLoaded(g, "the homesite ranking");
    return g(null, "no build site to measure");
  }
  const p = spot.privacy;
  if (!p) return { ...g(null, NOT_MEASURED), short: "not measured" };
  const grade = worse(
    p.nearestFt === null ? "A" : atLeast(p.nearestFt, K.rows.privacyFt),
    atMost(p.inSight, K.rows.privacySight),
  );
  return {
    ...g(grade, privacyLine(p)),
    short:
      p.nearestFt === null
        ? "no house within a mile"
        : `nearest ${fmt(p.nearestFt)} ft, ${fmt(p.inSight)} in sight`,
    measure: { value: p.inSight, unit: "houses" },
  };
}

/**
 * Long view at the build site (step 11, plan §2.4): the share of the horizon open past 3 mi, against the person's
 * limit; the longest view and its direction beside it.
 */
function longView(r: Result, K: CardConfig, at: number): Row {
  const g = row("longView", FACTOR_LABELS.longView);
  const house = r.house && !("outside" in r.house) ? r.house : null;
  const spot = house ?? r.sites?.[at];
  if (!spot) {
    if (!r.sites) return notLoaded(g, "the homesite ranking");
    return g(null, "no build site to measure");
  }
  const v = spot.view;
  if (!v) return { ...g(null, NOT_MEASURED), short: "not measured" };
  const pct = openPct(v);
  return {
    ...g(atLeast(pct, K.rows.viewOpenPct), viewLine(v)),
    short: viewShort(v),
    measure: { value: pct, unit: "%" },
  };
}

/**
 * "the nearest house 1,100 ft away; 2 within a quarter mile; 1 in sight within a mile (in winter, with leaves down)".
 */
export function privacyLine(p: { near: number; inSight: number; nearestFt: number | null }): string {
  if (p.nearestFt === null) return "no house within a mile";
  return (
    `the nearest house ${fmt(p.nearestFt)} ft away; ${fmt(p.near)} within a quarter mile; ` +
    `${p.inSight === 0 ? "none" : fmt(p.inSight)} in sight within a mile (${IN_WINTER})`
  );
}

/**
 * A drive-time place that's an airport (step 11, plan §2.5): its name says "airport", or ends in a three-letter code in
 * parentheses, as Settings' defaults do ("Greenville-Spartanburg (GSP)").
 */
export const isAirport = (name: string): boolean => /airport/i.test(name) || /\([A-Z]{3}\)\s*$/.test(name);

/** The drive to the nearest airport on Settings' list (step 11, plan §2.5), as Hospital's to an ER. */
function airport(r: Result, K: CardConfig): Row {
  const g = row("airport", FACTOR_LABELS.airport);
  if (!drivesLoaded(r)) return notLoaded(g, "the drive times");
  const a = r.drives!.filter((d) => isAirport(d.label)).sort((x, y) => x.min - y.min)[0];
  if (!a)
    return {
      ...g(null, "no airport on your list of places to time drives to (Settings)"),
      short: "none listed",
    };
  return {
    ...g(
      atMost(a.min, K.rows.airportMin),
      `${articleFor(a.min)} ${fmt(a.min)}-minute drive to ${a.label}${trackNote(r)}`,
    ),
    short: `${a.label.match(/\(([A-Z]{3})\)/)?.[1] ?? "airport"} ${fmt(a.min)} min`,
    measure: { value: a.min, unit: "min" },
  };
}

/**
 * Bike to a long trail (step 11, plan §2.6): the drive to the nearest access point of a long rail-trail, from where
 * the drives start. A screen made before it has none: "not measured".
 */
function longTrail(r: Result, K: CardConfig): Row {
  const g = row("longTrail", FACTOR_LABELS.longTrail);
  if (!drivesLoaded(r) || r.noResponse.includes(LONG_TRAIL_DRIVES)) return notLoaded(g, "the drive times");
  if (r.longTrail === undefined) return { ...g(null, NOT_MEASURED), short: "not measured" };
  if (r.longTrail === null) return { ...g("F", "no long trail within reach"), short: "none near" };
  const t = r.longTrail;
  return {
    ...g(
      atMost(t.min, K.rows.longTrailMin),
      `${articleFor(t.min)} ${fmt(t.min)}-minute drive to the ${t.trail} at ${t.point}${trackNote(r)}`,
    ),
    short: `${t.trail.replace(/ Trail$| Greenway$/, "")} ${fmt(t.min)} min`,
    measure: { value: t.min, unit: "min" },
  };
}

/**
 * Satellite internet (step 11, plan §2.7; renamed from Internet, owner, #272): the parcel's best spot for a satellite dish, graded on how clear its view is, with its
 * distance from the site the card reads.
 */
function internet(r: Result, K: CardConfig, at: number, known?: Facts): Row {
  const byDish = internetByDish(r, K, at);
  // J-5: internet service confirmed at the address settles it (an A), whatever the dish spot, with the reminder appended.
  if (!known?.service?.internet) return byDish;
  const { missing: _missing, ...rest } = byDish;
  return {
    ...rest,
    grade: "A",
    detail: `${byDish.detail}; ${INTERNET_CONFIRMED}`,
    short: "service confirmed",
  };
}

function internetByDish(r: Result, K: CardConfig, at: number): Row {
  const g = row("internet", FACTOR_LABELS.internet);
  if (r.dish === undefined) return { ...g(null, NOT_MEASURED), short: "not measured" };
  if (r.dish === null) return { ...g(null, "no spot on the parcel could be read"), short: "not read" };
  const pct = Math.round(r.dish.clearShare * 100);
  const house = r.house && !("outside" in r.house) ? r.house : null;
  const site = house ?? r.sites?.[at];
  const ft = site
    ? Math.round(distance([site.ll[1], site.ll[0]], [r.dish.ll[1], r.dish.ll[0]], { units: "feet" }))
    : null;
  const where = house ? "the house" : site ? siteLabel(site as Site) : null;
  return {
    ...g(
      atLeast(pct, K.rows.dishClearPct),
      `best dish spot: ${pct}% open sky${ft !== null && where ? `, ${fmt(ft)} ft from ${where}` : ""} (trees not counted)`,
    ),
    short: `${pct}% open sky`,
    measure: { value: pct, unit: "%" },
  };
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
  const g = row("garden", FACTOR_LABELS.garden);
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
        measure: { value: best.x.acres, unit: "ac" },
      },
      best.x.ll,
    );
  const big = r.gardens.reduce((a, x) => (x.acres > a.acres ? x : a));
  const largest = big.acres;
  const i = rest.findIndex((c) => largest >= c);
  const grade = i < 0 ? "F" : LETTERS[i + 1]!;
  return spring(
    {
      ...g(grade, `the largest garden is ${fmt(largest, 2)} ac`),
      short: `${fmt(largest, 2)} ac`,
      measure: { value: largest, unit: "ac" },
    },
    big.ll,
  );
}

// ---------- Within budget (step 10) ----------

const STATUS_ORDER: readonly BudgetStatus[] = ["pass", "unknown", "warn", "fail"];
const worseStatus = (a: BudgetStatus, b: BudgetStatus): BudgetStatus =>
  STATUS_ORDER.indexOf(a) >= STATUS_ORDER.indexOf(b) ? a : b;

/**
 * Within budget (step 10 plan §3): each budget given against its cost, Ready to camp's and Ready to build's. Ranked,
 * its letter is the worse of the two, by the high end as a share of the budget (card.budgetBands); as a Must, its
 * status is the worse of the two. Not graded without a cost or an asking price. Null without budgets: no row, so a card
 * graded without them is the card as before step 10.
 */
export function budgetRow(
  cost: CostToEnjoy | null | undefined,
  budgets: Budgets | undefined,
  K: CardConfig,
): Row | null {
  const g = (grade: Letter | null, detail: string, status: BudgetStatus, reason = detail): Row => ({
    key: "budget",
    label: FACTOR_LABELS.budget,
    grade,
    detail,
    budget: { status, reason },
  });
  const given = (["camp", "build"] as const).filter((w) => budgets?.[w] != null);
  if (!given.length) return null;
  if (!cost) return g(null, "Not priced yet: the driveway hasn't been routed", "unknown");
  if (cost.kind === "noWay") return g(null, COST_WORDS.noWay, "unknown");
  const word = { camp: COST_WORDS.camp, build: COST_WORDS.build };
  if (cost.camp.land === null) {
    const ranges = given.map((w) => `${word[w].toLowerCase()} ${costRange(cost[w].total)}`).join(", ");
    return g(null, `No asking price: ${ranges}, ${COST_WORDS.plusLand}`, "unknown");
  }
  const each = given.map((w) => {
    const budget = budgets![w]!;
    const { low, high } = cost[w].total;
    const status = budgetStatusOf({ low, high }, budget);
    const sits = BUDGET_SITS[status as Exclude<BudgetStatus, "unknown">];
    return {
      status,
      letter: atMost(budget > 0 ? high / budget : Infinity, K.budgetBands),
      text: `${word[w].toLowerCase()} ${costRange(cost[w].total)}, ${sits} your ${shortPrice(budget)}`,
      short: `${w} ${costRange(cost[w].total)}`,
    };
  });
  const status = each.map((x): BudgetStatus => x.status).reduce(worseStatus);
  const row = g(
    each.map((x) => x.letter).reduce(worse),
    each.map((x) => x.text).join("; "),
    status,
    each
      .filter((x) => x.status === status)
      .map((x) => x.text)
      .join("; "),
  );
  return { ...row, short: each.map((x) => x.short).join(", ") };
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
  /** The ranked site to read the site rows at (step 7): site #1 unless reportCard picks the person's best. */
  at = 0,
  /** The rubric's budgets (step 10): what Within budget grades against. */
  budgets?: Budgets,
): CardFacts {
  const site = buildSite(r, at);
  const names = drawn?.names,
    marks = drawn?.marks ?? [],
    records = drawn?.records;
  // The route scored: the household's when it chose a line and this screen has a route from it (WF5). The Access and
  // Easement gates, and Floodplain's driveway part, read it whichever site the rows read (step 7 plan §2, §11 Q5).
  const driven = drivenRoute(r, drawn?.driveway);
  const [elevationRow, homesiteRow, skyRow, roomRow, siteDrivewayRow, climateRow, privacyRow, longViewRow] =
    siteRows(r, K, build, at);
  // The Driveway row grades the household's route whenever it chose a line this screen routed from, the app's route
  // only when it didn't (owner, #308): the row, Best homesite and the cost then read the same driveway.
  const chosen = driven.yours ? chosenDrive(r, drawn?.driveway) : null;
  const drivewayRow = chosen ? drivewayGraded(chosen, K) : siteDrivewayRow;
  // The cost to enjoy at this site (step 10), when the parcel's lines, price and rates came with it.
  const cost = drawn?.cost
    ? costToEnjoy({
        result: r,
        siteAt: at,
        lines: drawn.cost.lines,
        marks,
        driveway: drawn.driveway ?? null,
        askingPrice: drawn.cost.askingPrice,
        rates: drawn.cost.rates,
        ...(drawn.cost.paving ? { paving: drawn.cost.paving } : {}),
        ...(drawn.facts?.service?.power ? { powerConfirmed: true } : {}),
      })
    : undefined;
  const facts = {
    gates: [
      floodplain(r, site, driven, drawn?.facts),
      access(r, driven, names, records),
      easement(r, driven, names, records),
      septic(r, site, marks, K),
    ],
    rows: [
      elevationRow!,
      homesiteRow!,
      skyRow!,
      roomRow!,
      drivewayRow!,
      trails(r, K),
      town(r, K),
      hospital(r, K),
      airport(r, K),
      longTrail(r, K),
      internet(r, K, at, drawn?.facts),
      garden(r, K, marks),
      climateRow!,
      privacyRow!,
      longViewRow!,
      ...[budgetRow(cost, budgets, K)].filter((x): x is Row => x !== null),
    ],
    at,
    ...(cost !== undefined ? { cost } : {}),
    ...(drawn?.cost
      ? { paving: { paving: drawn.cost.paving ?? DEFAULT_PAVING, lines: drawn.cost.lines } }
      : {}),
  };
  return withYourRoute(facts, r, driven, drawn);
}

/**
 * The rows that differ from site to site (step 7, lib/report/sites.ts SITE_ROWS), read at the ranked site `at`:
 * Elevation, Best homesite, Night sky, Room to build and Driveway, in the card's order. A marked house is still where
 * Elevation and Driveway are read, as before. `derived`: the sites' scores, when the caller has them already.
 */
export function siteRows(
  r: Result,
  K: CardConfig = SCREEN_CONSTANTS.card,
  build: BuildConfig = SCREEN_CONSTANTS.build,
  at = 0,
  derived: ScoredSite[] | undefined = derivedSites(r),
): Row[] {
  const footprintAc = footprintFt2(build) / FT2_PER_ACRE;
  return [
    elevation(buildSite(r, at), K),
    homesite(r, at, derived),
    sky(r, K, at),
    room(r, K, footprintAc, at),
    driveway(r, K, at),
    // Step 11: by each site's elevation, so it ranks the sites too (plan §4).
    climate(r, K, at),
    privacy(r, K, at),
    longView(r, K, at),
  ];
}

/**
 * The household's route (WF5): the Town and Trails panels say their drive times start where the app's pick meets the
 * road, when the chosen route meets it elsewhere (the drives are timed from there until WF6 re-times them); and the card
 * says so when a line was chosen and this screen has no route from it.
 */
function withYourRoute(facts: CardFacts, r: Result, driven: Driven, drawn?: Drawn): CardFacts {
  // Step 12: a screen timed from your route (a run with the choice, or a Try it kept) says nothing of the pick's start.
  const pickE = driven.pick ? r.driveway?.entrances[driven.pick.entranceIndex] : undefined;
  const fromPick =
    !r.driveFrom ||
    !pickE ||
    pickE.source === "drawn" ||
    distance([r.driveFrom.ll[1], r.driveFrom.ll[0]], [pickE.ll[1], pickE.ll[0]], { units: "meters" }) < 1;
  const moved =
    !!driven.yours && !!driven.pick && driven.route?.entranceIndex !== driven.pick.entranceIndex && fromPick;
  const rows = moved
    ? facts.rows.map((x) =>
        x.key === "town" || x.key === "hospital" || x.key === "airport" || x.key === "trails"
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
export const listOf = (xs: string[]): string =>
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

export function cardFor(facts: CardFacts, nr: NamedRubric): Card {
  const R = nr.rubric;
  const w = weightsOf(R);
  // Won't rows are hidden and left out of the grade; the gates the rubric keeps as Musts decide the verdict. A row the
  // rubric doesn't rank is Don't care too (step 7: a rubric saved before the Driveway row; words.ts tierOf).
  const rows = facts.rows.filter((x) => !R.wonts.includes(x.key) && R.ranked.some((c) => c.factor === x.key));
  const graded = gradedRows(rows, R);
  const { points, grade } = parcelGrade(graded, R, w);
  const gates = facts.gates.filter((g) =>
    R.musts.some((m) => m.factor === g.key && m.threshold === undefined),
  );
  // Within budget as a Must (step 10): the interview's "Over budget" walk-away. A fail is a Pass, a warn a warning, as a
  // gate's; an unknown (no asking price) holds the verdict at Maybe, as a threshold Must's does.
  const budgetMust = R.musts.some((m) => m.factor === "budget" && m.threshold === undefined)
    ? facts.rows.find((x) => x.key === "budget")?.budget
    : undefined;
  const fail =
    gates.find((x) => x.status === "fail") ??
    (budgetMust?.status === "fail" ? { reason: budgetMust.reason } : undefined);
  const warns: { key: Factor; reason: string }[] = [
    ...gates.filter((x) => x.status === "warn"),
    ...(budgetMust?.status === "warn" ? [{ key: "budget" as const, reason: budgetMust.reason }] : []),
  ];
  const budgetUnknown = budgetMust?.status === "unknown";
  // A threshold Must on a ranked row (lib/rubric/musts.ts): a fail is a Pass that names the row; an unknown holds
  // the verdict at Maybe. None in the default rubric.
  const thresholds = R.musts
    .filter((m) => m.threshold !== undefined)
    .flatMap((must) => {
      const row = facts.rows.find((x) => x.key === must.factor);
      return row ? [{ must, row, status: row.mustStatus ?? thresholdStatus(must, row.measure) }] : [];
    });
  const thresholdFail = thresholds.find((t) => t.status === "fail");
  const thresholdUnknown = thresholds.some((t) => t.status === "unknown");
  const check = rows.find((x) => x.checkFirst)?.checkFirst;
  const incomplete = [
    ...new Set([...facts.gates, ...facts.rows].map((x) => x.missing).filter((m): m is string => !!m)),
  ];
  // Letter edges (step 3, §9.51): A or B a Contender, D or F a Pass.
  const lines = verdictLines(R);
  const verdict: Verdict =
    fail || thresholdFail || (points !== null && points < lines.pass)
      ? "Pass"
      : points !== null &&
          points >= lines.contender &&
          warns.length <= R.verdict.contenderMaxWarns &&
          !thresholdUnknown &&
          !budgetUnknown &&
          !Object.values(maybeCaps(facts)).some(Boolean)
        ? "Contender"
        : "Maybe";
  // The lowest row; among equals, the one this rubric weighs most, then the card's order.
  const weakest = [...graded].sort((a, b) => R.points[a.grade] - R.points[b.grade] || w[b.key] - w[a.key])[0];
  const lead: Lead = fail
    ? { kind: "fail", text: lowerFirst(fail.reason) }
    : thresholdFail
      ? {
          kind: "limit",
          text: `${lowerFirst(thresholdFail.row.label)} fails your must (${thresholdFail.row.short ?? thresholdFail.row.detail}; you asked for ${thresholdWords(thresholdFail.must, (n) => fmt(n))})`,
        }
      : check && verdict !== "Pass"
        ? { kind: "check", text: check }
        : warns[0] && verdict !== "Pass"
          ? { kind: "check", text: lowerFirst(warns[0].reason) }
          : weakest
            ? {
                kind: "weakest",
                text: `${lowerFirst(weakest.label)} (${letterText(shownLetter(facts, weakest.key))}, ${weakest.detail})`,
              }
            : { kind: "none", text: "Not enough of the screen ran to grade the land" };
  const why =
    lead.kind === "fail" || lead.kind === "limit"
      ? `${VERDICT_WORD[verdict]}: ${lead.text}`
      : lead.kind === "check"
        ? `${VERDICT_WORD[verdict]}. Check first: ${lead.text}`
        : lead.kind === "weakest"
          ? `${VERDICT_WORD[verdict]}. Weakest part: ${lead.text}`
          : `${VERDICT_WORD[verdict]}. ${lead.text}`;
  const more = incomplete.length ? ` (incomplete: ${listOf(incomplete)} didn't load, grade again)` : "";
  // A Contender's grade held at Maybe (polish #5): the warnings past the allowance, a Must that couldn't be checked, a
  // "Check first" item, and what didn't load, as MAYBE_CAPS and the verdict above count them.
  const heldBy =
    verdict === "Maybe" && points !== null && points >= lines.contender
      ? [
          // In the card's own words for each Must ("Driveway on your land", not the factor's "Easement needed").
          ...(warns.length > R.verdict.contenderMaxWarns ? warns.map((g) => EDITOR_TITLES[g.key]) : []),
          ...thresholds.filter((t) => t.status === "unknown").map((t) => t.row.label),
          ...(budgetUnknown ? [EDITOR_TITLES.budget] : []),
          ...facts.rows.filter((x) => x.checkFirst).map((x) => x.label),
          ...(incomplete.length ? ["something that didn't load"] : []),
        ]
      : [];
  return {
    ...facts,
    rows,
    rubric: nr,
    points,
    grade,
    verdict,
    reason: `${why}${more}.`,
    lead,
    incomplete,
    ...(heldBy.length ? { heldBy: [...new Set(heldBy)] } : {}),
    ...(budgetMust ? { budgetMust } : {}),
    sites: [],
  };
}

/**
 * The card for a result and a rubric: the rubric's bands grade the rows, its weights and lines grade the parcel.
 * Step 7 (plan §2): it's graded at this person's best homesite, the first of `rankSites` over the site rows; or at
 * `opts.at`, a ranked site's index, when the caller names one (the guard test grades site #1 this way). A marked house
 * is the build site either way, as before.
 */
export const reportCard = (
  r: Result,
  nr: NamedRubric,
  drawn?: Drawn,
  K: CardConfig = SCREEN_CONSTANTS.card,
  opts: { at?: number } = {},
): Card => {
  const KR = { ...K, rows: nr.rubric.bands };
  const build = SCREEN_CONSTANTS.build;
  const derived = derivedSites(r);
  // Step 12: this person's adjustments on this parcel. What they set aside doesn't rank their homesites either.
  const adjust = drawn?.adjust?.get(nr.id) ?? [];
  const aside = asideOf(adjust);
  const rankBy = withoutFactors(nr.rubric, aside);
  const sites = r.sites
    ? rankSites(r.sites, (i) => siteRows(r, KR, build, i, derived).filter((x) => !aside.has(x.key)), rankBy)
    : [];
  // A marked house grades as before (§11 Q6): its own elevation and driveway, site #1's quality and room.
  const house = !!r.house && !("outside" in r.house);
  const at = opts.at ?? (house ? 0 : (sites[0]?.index ?? 0));
  const facts = withAdjustments(cardFacts(r, KR, build, drawn, at, nr.rubric.budgets), adjust, nr.rubric);
  return { ...cardFor(facts, nr), sites };
};

/**
 * A person's adjustments on the card's facts (step 12, plan §3), before their rubric grades them:
 *   - an override sets a row's letter, a gate's status, or a limit's or Within budget's result, and keeps what the app
 *     said beside it;
 *   - a set-aside row or Must leaves the facts (so nothing counts it) and is listed in `setAside`.
 */
export function withAdjustments(facts: CardFacts, adjust: readonly Adjustment[], R: Rubric): CardFacts {
  if (!adjust.length) return facts;
  const by = new Map(adjust.map((a) => [a.factor, a]));
  const aside = asideOf(adjust);
  const note = (a: Adjustment, from: string, to: string): Adjusted => ({
    from,
    to,
    reason: a.reason,
    then: a.was,
    at: a.at,
  });
  const gates = facts.gates.flatMap((g): Gate[] => {
    if (aside.has(g.key)) return [];
    const a = by.get(g.key);
    return a?.status ? [{ ...g, status: a.status, adjusted: note(a, g.status, a.status) }] : [g];
  });
  const rows = facts.rows.flatMap((x): Row[] => {
    const a = by.get(x.key);
    if (aside.has(x.key)) return [];
    if (!a) return [x];
    let row: Row = x;
    if (a.grade) row = { ...row, grade: a.grade, adjusted: note(a, x.grade ?? "–", a.grade) };
    if (a.status) {
      const from = x.budget?.status ?? "–";
      row = {
        ...row,
        mustStatus: a.status,
        ...(x.budget ? { budget: { ...x.budget, status: a.status } } : {}),
        adjusted: note(a, row.adjusted?.from ?? from, a.status),
      };
    }
    return [row];
  });
  const own = (f: Factor) =>
    facts.rows.find((x) => x.key === f)?.label ?? facts.gates.find((g) => g.key === f)?.label;
  const setAside = adjust
    .filter((a) => a.kind === "setAside")
    .map((a): SetAside => ({
      key: a.factor,
      label: asideLabel(a.factor, own(a.factor)),
      reason: a.reason,
      must: isMustOf(R, a.factor),
      at: a.at,
    }));
  return { ...facts, gates, rows, ...(setAside.length ? { setAside } : {}) };
}
