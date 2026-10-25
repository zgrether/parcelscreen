/**
 * Every string the land uses say (step 14, docs/plans/step-14-land-uses.md §9; CLAUDE.md rule 7: all new, additive).
 * The card's and the report's own words aren't here: where a use restates the card, it quotes the card's reason.
 */
import { fmt } from "../format";
import type { EasementType, Hoa } from "../client/parcelStore";
import type { Answer, UseKey } from "./types";

/** The panel's own words (§9 Panel). */
export const USE_WORDS = {
  section: "What you can do here",
  tab: "Uses",
  decides: "What decides it",
  notAdvice: "Not advice: check with the county, a surveyor or a land-use attorney before acting.",
  notGraded: "Grade this parcel to see what you can do here",
  /**
   * Grade's shortcut line to Uses (step 14 §6, ux-audit P-3): "What you can do here: 1 yes, 4 maybe, 2 no". A count of
   * none is left out.
   */
  tally: (t: Record<Answer, number>) =>
    `What you can do here: ${(["yes", "maybe", "no"] as const)
      .filter((a) => t[a] > 0)
      .map((a) => `${t[a]} ${a}`)
      .join(", ")}`,
} as const;

/** One page's Divide line (§9 Report). */
export const REPORT_DIVIDE = {
  /** Owner, #311: the panel's two numbers, each with what binds it. */
  can: (ways: string) => `Can divide: ${ways.charAt(0).toLowerCase()}${ways.slice(1)}`,
  cant: (reason: string) => `Can't divide: ${reason}`,
} as const;

/** Map layers' power lines (§9 Map, §2.1): the toggle, the key's line, and a line's tip on the map. */
export const POWER_MAP = {
  toggle: "Power lines",
  key: "A power line near the parcel, when Power lines is on.",
  tip: (kV: number | null) => (kV !== null ? `A ${fmt(kV)} kV power line` : "A power line"),
} as const;

/** An easement line's purpose picker, in Details (§3.2). */
export const EASEMENT_TYPE_CAPTION = "What it's for";

export const ANSWER_WORD: Record<Answer, string> = { yes: "Yes", maybe: "Maybe", no: "No" };

export const USE_NAME: Record<UseKey | "limits", string> = {
  camp: "Camp now",
  build: "Build",
  trails: "Trails and walking woods",
  garden: "Garden, orchard, animals",
  hunt: "Hunt",
  ride: "Ride, ski, snowshoe from home",
  divide: "Divide",
  limits: "What limits you",
};

/** Where a fact's number comes from (each fact's `source`). */
export const SOURCE = {
  nlcd: "NLCD land cover",
  nhd: "USGS NHD flowlines",
  nhdPonds: "USGS NHD waterbodies",
  lidar: "USGS 3DEP lidar (our estimate)",
  dem: "USGS 3DEP lidar",
  padus: "USGS PAD-US",
  footprints: "Microsoft building footprints",
  fema: "FEMA flood map",
  nrcs: "NRCS soils",
  tiger: "Census TIGER roads",
  parcel: "the parcel's outline",
  hifld: "HIFLD transmission lines",
  osm: "OpenStreetMap power lines",
  drives: "OSRM drive",
  marks: "your marks",
  lines: "your lines",
  listing: "your listing notes",
  /** J-5: a survey's figures, marked as a fact. */
  survey: "your survey (marked)",
  /** Owner, after #312: copied to a piece added from a split. */
  original: "from the original parcel",
  cost: "Cost to enjoy (published ranges)",
} as const;

/** What didn't load, said in place of the answer it would have decided (§8 States). */
export const MISSING = {
  cover: (what: string) => `Land cover didn't load: ${what} not known`,
  trails: "The trail estimate wasn't measured: grade again",
  streams: "Mapped streams didn't load",
  county: "The county didn't load: grade again",
  frontage: "Road frontage wasn't measured: grade again",
  privacy: "Houses nearby weren't measured",
  protected: "Public land (PAD-US) didn't load",
  longTrail: "The drive to a long trail didn't load",
  terrain: "The terrain didn't load",
  sites: "The homesite ranking didn't load",
  notPriced: "The way in isn't priced yet: the driveway hasn't been routed",
} as const;

const ac = (n: number): string => fmt(n, n < 10 ? (n < 1 ? 2 : 1) : 0);
const ft = (n: number): string => fmt(n);
/** A rule's lot size as the county writes it: "2", "10", "0.69" (not "2.0"). */
const lotSize = (n: number): string => (Number.isInteger(n) ? fmt(n) : fmt(n, 2));
const mi = (n: number): string => fmt(n, n < 10 ? 1 : 0);

// ---------- Camp now ----------

export const CAMP = {
  markLabel: "Campsite marks",
  clearingLabel: "Clearings marked",
  openNearLabel: (nearFt: number) => `Open gentle ground within ${ft(nearFt)} ft of a road`,
  openLabel: "Open gentle ground",
  trackLabel: "Pioneer track to camp",
  costLabel: "Ready to camp",
  noTrack: "none: the way in is drawn",
  acres: (n: number) => `${ac(n)} ac`,
  feet: (n: number) => `${ft(n)} ft`,
  /** Yes: what the camp is, then its cost. */
  yesMark: "Your campsite mark, reached by the way you drew",
  yesClearing: "Your clearing, reached by the way you drew",
  yesOpen: (n: number, nearFt: number) =>
    `${ac(n)} ac of open gentle ground within ${ft(nearFt)} ft of a road`,
  withCost: (what: string, range: string) => `${what}; ready to camp ${range}`,
  track: (n: number) => `Reachable only after a pioneer track (${ft(n)} ft to cut)`,
  far: (nearFt: number) => `Open ground only, farther than ${ft(nearFt)} ft from a road`,
  easement: "The way in needs an easement first",
  siteOnly: (site: string) => `No open or marked spot yet: you'd camp at ${site} once it's cleared`,
  none: "No open or marked spot, and the best site is too small",
  noneMarked: "none",
} as const;

// ---------- Build ----------

export const BUILD = {
  /** "A 2.1 ac site at 3,640 ft, conventional septic likely" (§3.1, restated plainly). */
  yes: (acres: number | null, elevFt: number | null, septic: string) =>
    `${acres !== null ? `A ${ac(acres)} ac site` : "The marked house"}${elevFt !== null ? ` at ${ft(elevFt)} ft` : ""}, ${septic}`,
  conventional: "conventional septic likely",
  permit: "a septic permit is on file",
  septicUnknown: "septic class not known",
  /** A modified or alternative system at the build site: a warning, though the card's Septic gate passes. */
  septicClass: (cls: "modified" | "alternative", site: string) =>
    `Septic at ${site} likely needs ${cls === "modified" ? "a modified" : "an alternative"} system`,
  noSite: "No build site found",
  siteLabel: "Build site",
  septicLabel: "Septic class at the site",
  site: (label: string, acres: number | null, elevFt: number | null) =>
    [label, acres !== null ? `${ac(acres)} ac` : null, elevFt !== null ? `${ft(elevFt)} ft` : null]
      .filter(Boolean)
      .join(", "),
} as const;

// ---------- Trails and walking woods ----------

export const TRAILS = {
  /** "About 1.4 mi of trail on 8 ac of gentle ground, at a path every 100 ft" (§2.2). */
  estimate: (miles: number, gentleAc: number, spacingFt: number) =>
    `About ${mi(miles)} mi of trail on ${ac(gentleAc)} ac of gentle ground, at a path every ${ft(spacingFt)} ft`,
  steep: (gradePct: number) => `Mostly steeper than ${fmt(gradePct)}%`,
  gentleLabel: (gradePct: number) => `Gentle ground (${fmt(gradePct)}% or less)`,
  milesLabel: "Trail it could hold",
  howLabel: "How it's estimated",
  how: (gradePct: number, minPatchAc: number, spacingFt: number) =>
    `The lidar's ground at ${fmt(gradePct)}% or less, leaving out drainages and the flood zone, in patches of ${ac(minPatchAc)} ac or more, at one path every ${ft(spacingFt)} ft`,
  acres: (n: number) => `${ac(n)} ac`,
  miles: (n: number) => `about ${mi(n)} mi`,
} as const;

// ---------- Garden, orchard, animals ----------

export const GARDEN = {
  gardenLabel: "Garden ground",
  frostLabel: "Frost position",
  waterLabel: "Water",
  openLabel: "Open gentle ground for animals",
  garden: (n: number) => `a ${ac(n)} ac garden`,
  noGarden: "none found",
  outOfPocket: "out of the frost pocket",
  pocket: "in the frost pocket",
  /** Yes: the garden, with its water; animals after it when there's room. */
  yes: (gardenAc: number, water: string) =>
    `A ${ac(gardenAc)} ac garden out of the frost pocket, with water (${water})`,
  yesAnimals: (openAc: number, water: string) =>
    `${ac(openAc)} ac of open gentle ground for animals, with water (${water})`,
  animals: (openAc: number) => `${ac(openAc)} ac of open gentle ground for animals`,
  pocketOnly: "The garden ground is in a frost pocket",
  smallStock: (openAc: number) => `Room for small stock (${ac(openAc)} ac of open gentle ground)`,
  none: (smallAc: number) => `No garden ground, and under ${ac(smallAc)} ac of open ground`,
  /**
   * The water, as the reason names it (owner, after #312: water doesn't decide the answer, its source is named): what
   * the household marked, then a year-round stream or a pond the NHD maps on the parcel, else the well.
   */
  waterSpring: "your spring",
  waterStream: "your stream",
  waterWell: "your well",
  streamOnParcel: "a stream on the parcel",
  pondOnParcel: "a pond on the parcel",
  fromWell: "from the well; no stream or spring mapped",
  fromWellNotLoaded: "from the well; mapped streams didn't load",
  /** What decides it's Water: the source, and the mapped water's names. */
  waterNamed: (water: string, names: readonly string[]) =>
    names.length ? `${water} (${names.join(", ")})` : water,
  acres: (n: number) => `${ac(n)} ac`,
} as const;

// ---------- Hunt ----------

export const HUNT = {
  acresLabel: "Acres",
  forestLabel: "Forest",
  publicLabel: "Open public land next door",
  /** Owner, after #312: counted from the boundary, not the build site. */
  housesBoundaryLabel: "Houses within a quarter mile of the boundary",
  countyLabel: (county: string) => `${county} County's rule on where you can shoot`,
  countyNotCoveredLabel: "The county's rule on where you can shoot",
  licenseLabel: "License",
  sundayLabel: "Sunday hunting",
  orangeLabel: "Hunter orange",
  roadsLabel: "Near roads",
  /** Yes: what makes it huntable. */
  big: (acres: number, forestPct: number) => `${ac(acres)} ac, ${fmt(forestPct)}% forest`,
  adjoins: (name: string) => `Adjoins open public land (${name})`,
  small: (acres: number, minAc: number) => `Under ${ac(minAc)} ac (${ac(acres)} ac)`,
  thin: (forestPct: number, minPct: number) => `${fmt(forestPct)}% forest, under ${fmt(minPct)}%`,
  housesBoundary: (n: number) =>
    `${fmt(n)} ${n === 1 ? "house" : "houses"} within a quarter mile of the boundary`,
  notCovered: "The county's rules aren't covered here yet",
  notCoveredValue: "Not covered here yet",
  acres: (n: number) => `${ac(n)} ac`,
  pct: (n: number) => `${fmt(n)}%`,
  none: "none",
  count: (n: number) => fmt(n),
} as const;

// ---------- Ride, ski, snowshoe from home ----------

/** Said with every Ride answer (§3.1). */
const RIDE_PRIVATE = "neighbours' land is private unless they agree";

export const RIDE = {
  privateCorridors: RIDE_PRIVATE,
  /** "Ski" makes no snow claim (§3.1). */
  snowLabel: "Snow",
  snow: "snow cover isn't measured",
  publicLabel: "Open public land next door",
  longTrailLabel: "Long trail, by road",
  loopLabel: "Your own loop",
  adjoins: (name: string) => `Adjoins open public land (${name})`,
  longTrail: (trail: string, point: string, miles: number) =>
    `The ${trail} at ${point} is ${mi(miles)} mi by road`,
  loop: (miles: number) => `Gentle ground for your own loop (about ${mi(miles)} mi of trail)`,
  neither: (miles: number | null) =>
    miles === null
      ? "No public land next door, and no long trail within reach"
      : `No public land next door, and the nearest long trail is ${mi(miles)} mi away by road`,
  /** The reason, with the corridors said after it. */
  withPrivate: (reason: string) => `${reason}; ${RIDE_PRIVATE}`,
  none: "none",
  noLongTrail: "none within reach",
  longTrailValue: (trail: string, point: string, miles: number) =>
    `the ${trail} at ${point}, ${mi(miles)} mi`,
  loopValue: (miles: number) => `about ${mi(miles)} mi of trail`,
} as const;

// ---------- Divide (lib/uses/divide.ts says the count) ----------

export const DIVIDE = {
  /**
   * Owner, #311: the two numbers, each with what binds it, in the county's terms. "Up to 3 lots without subdivision
   * review (a farm division approved by staff; limited by 30.15 ac at 10 ac a lot) · up to 8 with an approved
   * subdivision plat (limited by 885 ft of road frontage at 100 ft per lot; more lots need a road built to the
   * county's standard)".
   */
  withoutReview: (n: number, term: string, limit: string) =>
    `Up to ${n} lots without subdivision review (${term}; ${limit})`,
  withPlat: (n: number, binding: string, first: boolean) =>
    first
      ? `Up to ${n} lots with an approved subdivision plat (${binding})`
      : `up to ${n} with an approved subdivision plat (${binding})`,
  bothWays: (a: string, b: string) => `${a} · ${b}`,
  roadStandard: "more lots need a road built to the county's standard",
  /** No public road frontage at all: the no-review lots each still need a way in. */
  needsAccess: "each new lot still needs legal access to a road",
  /** What holds the no-review count: the acres at its lot size, or the county's cap. */
  noReviewBySize: (acres: string, lotAc: number, inclusive: boolean) =>
    `limited by ${acres} ac at ${inclusive ? "" : "over "}${lotSize(lotAc)} ac a lot`,
  noReviewByCap: (max: number) => `limited to ${max} lots by the county's rule`,
  /** What decides it: the parcel's arithmetic, each line naming what binds. */
  withoutReviewLabel: "Without subdivision review",
  withoutReviewMath: (
    acres: string,
    lotAc: number,
    inclusive: boolean,
    byAcres: number,
    max: number | null,
  ) =>
    `${acres} ac ÷ ${inclusive ? "" : "over "}${lotSize(lotAc)} ac a lot = ${byAcres} ${byAcres === 1 ? "lot" : "lots"}` +
    (max !== null ? `; the rule allows at most ${max}` : ""),
  bySizeLabel: "Lots by size",
  bySize: (acres: string, minLot: number, n: number) =>
    `${acres} ac ÷ ${lotSize(minLot)} ac minimum lot = ${n} ${n === 1 ? "lot" : "lots"}`,
  byFrontageLabel: "Lots by frontage",
  byFrontage: (frontage: number, per: number, n: number) =>
    `${ft(frontage)} ft of public road frontage ÷ ${ft(per)} ft a lot = ${n} ${n === 1 ? "lot" : "lots"}`,
  withPlatLabel: "With a subdivision plat",
  /** "8 lots: road frontage binds". */
  binds: (n: number, what: string) => `${n} ${n === 1 ? "lot" : "lots"}: ${what} binds`,
  bindsSize: "lot size",
  bindsFrontage: "road frontage",
  bindsBoth: "lot size and road frontage",
  bindsCap: "the county's cap",
  /** The parcel's acres to two places, as the arithmetic uses them. */
  exactAcres: (n: number) => `${fmt(n, 2)} ac`,
  /** The listing's acres as typed: "24.7 ac". */
  listedAcres: (n: number) => `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} ac`,
  /**
   * Owner, #311: the listing's acres differ from the county map's by more than $/ac's cutoff, and Divide counts on the
   * listing's: "on 24.7 listed ac (the county map shows 30.15)".
   */
  onListed: (listed: string, boundary: string) => `on ${listed} listed ac (the county map shows ${boundary})`,
  /** J-5 (UX part 2 PR 3c2): a survey's acres, used before the listing's. */
  onSurveyed: (surveyed: string, boundary: string) =>
    `on ${surveyed} surveyed ac (the county map shows ${boundary})`,
  acresSurveyed: (surveyed: string, boundary: string) =>
    `${surveyed} ac from the survey (used); the county map shows ${boundary} ac`,
  frontageSurveyed: (feet: number) => `${ft(feet)} ft, from the survey`,
  /** What decides it's Acres when the listing gives them: both, and which the count used. */
  acresBoth: (listed: string, boundary: string) =>
    `${listed} ac from the listing (used); the county map shows ${boundary} ac`,
  /** The frontage as measured, and what it's measured along (owner, #311). */
  frontageMeasured: (feet: number) =>
    feet === 0
      ? "None: no public road runs along the county map's boundary; a survey may differ"
      : `${ft(feet)} ft, measured along the county map's boundary; a survey may differ`,
  boundaryDisagrees: (listed: string, boundary: string) =>
    `The county map's boundary (${boundary} ac) disagrees with the listing (${listed} ac): the road frontage is measured along that boundary, so it may be off too`,
  /** §9 Divide. */
  couldAllowMore: (exception: string) => `Could allow more: ${exception}`,
  notCovered: "Not covered here yet",
  assumedDefault: "Assumes the rural default (no zoning map online)",
  trySplit: "Try a split",
  /** The headline, with what holds it at Maybe after it. */
  withNote: (headline: string, note: string) =>
    `${headline}; ${note.charAt(0).toLowerCase()}${note.slice(1)}`,
  noFrontage: "road frontage wasn't measured",
  countyLabel: "County",
  ordinanceLabel: "Ordinance",
  zoningLabel: "Zoning",
  minLotLabel: "Minimum lot",
  frontageRuleLabel: "Road frontage per lot",
  frontageLabel: "Public road frontage",
  acresLabel: "Acres",
  exceptionLabel: "Also allowed",
  reviewLabel: "Review",
  exemptLabel: "Not a subdivision",
  noteLabel: "To re-check",
  district: (code: string, name: string | null) => (name ? `${name} (${code})` : code),
  feet: (n: number) => `${ft(n)} ft`,
  acres: (n: number) => `${ac(n)} ac`,
  /** A county fact's words, with its confidence when it isn't read from the ordinance itself. */
  says: (says: string, confidence: string) =>
    confidence === "from the ordinance" ? says : `${says} (${confidence})`,
} as const;

// ---------- What limits you ----------

export const LIMIT_WORDS = {
  easements: "Easements",
  noEasements: "None drawn",
  deed: "Deed restrictions",
  hoa: "HOA",
  notKnown: "Not known",
  flood: "Flood zone",
  power: "Power lines",
  /** §9 Limits. */
  floodAc: (acres: number) => `${fmt(acres, 1)} ac in the flood zone`,
  noFlood: "No FEMA flood zone on the parcel",
  floodNotMapped: "FEMA has no flood mapping here",
  floodMissing: "The FEMA flood map didn't load",
  powerMissing: "Power lines didn't load",
  crosses: "A power line crosses the parcel",
  crossesFt: (insideFt: number) => `A power line crosses the parcel (${ft(insideFt)} ft of it inside)`,
  fromSite: (kV: number | null, feet: number) =>
    kV !== null
      ? `A ${fmt(kV)} kV power line ${ft(feet)} ft from the house site`
      : `A power line ${ft(feet)} ft from the house site`,
  fromBoundary: (kV: number | null, feet: number) =>
    kV !== null
      ? `A ${fmt(kV)} kV power line ${ft(feet)} ft from the boundary`
      : `A power line ${ft(feet)} ft from the boundary`,
  noPower: (km: number) => `No power line within ${fmt(km)} km`,
  easement: (type: string | null, recordedIn: string) =>
    [type ?? "type not given", recordedIn ? `recorded in ${recordedIn}` : null].filter(Boolean).join("; "),
} as const;

/** An easement's purpose (§9 Limits, §3.2). */
export const EASEMENT_TYPE_WORD: Record<EasementType, string> = {
  row: "Road right-of-way",
  utility: "Utility",
  scenic: "Scenic",
  other: "Other",
};

export const HOA_WORD: Record<Hoa, string> = { yes: "Yes", no: "No", unknown: "Not known" };
