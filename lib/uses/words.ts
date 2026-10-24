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
} as const;

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
  lidar: "USGS 3DEP lidar (our estimate)",
  dem: "USGS 3DEP lidar",
  padus: "USGS PAD-US",
  footprints: "Microsoft building footprints",
  fema: "FEMA flood map",
  nrcs: "NRCS soils",
  tiger: "Census TIGER roads",
  hifld: "HIFLD transmission lines",
  osm: "OpenStreetMap power lines",
  drives: "OSRM drive",
  marks: "your marks",
  lines: "your lines",
  listing: "your listing notes",
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
  noWater:
    "Garden ground, but no water found: no spring, stream or well marked, and no year-round stream mapped",
  waterUnknown: "Garden ground, but mapped streams didn't load: water not known",
  animalsNoWater:
    "Room for animals, but no water found: no spring, stream or well marked, and no year-round stream mapped",
  animalsWaterUnknown: "Room for animals, but mapped streams didn't load: water not known",
  smallStock: (openAc: number) => `Room for small stock (${ac(openAc)} ac of open gentle ground)`,
  none: (smallAc: number) => `No garden ground, and under ${ac(smallAc)} ac of open ground`,
  /** The water found, as the reason names it. */
  waterSpring: "your spring",
  waterStream: "your stream",
  waterWell: "your well",
  waterMapped: (names: readonly string[]) =>
    names.length ? `a year-round stream: ${names.join(", ")}` : "a year-round stream",
  noWaterFound: "none found",
  acres: (n: number) => `${ac(n)} ac`,
} as const;

// ---------- Hunt ----------

export const HUNT = {
  acresLabel: "Acres",
  forestLabel: "Forest",
  publicLabel: "Open public land next door",
  housesLabel: "Houses within a quarter mile",
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
  houses: (n: number, site: string) =>
    `${fmt(n)} ${n === 1 ? "house" : "houses"} within a quarter mile of ${site}`,
  notCovered: "The county's rules aren't covered here yet",
  notCoveredValue: "Not covered here yet",
  acres: (n: number) => `${ac(n)} ac`,
  pct: (n: number) => `${fmt(n)}%`,
  none: "none",
  count: (n: number) => fmt(n),
} as const;

// ---------- Ride, ski, snowshoe from home ----------

/** Said with every Ride answer (§3.1). */
const RIDE_PRIVATE = "neighbours' corridors are private unless they agree";

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
  exceptionLabel: "Exception",
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
