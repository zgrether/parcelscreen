/**
 * The pipeline contract (docs/REQUIREMENTS.md §2, with the additions approved in plan §9.7).
 *
 * `ScreenResult` is what Phase 1 stores in `screens.result`. It is the prototype's result object `R`
 * minus everything session-only (rasters, raw road/flood features, the horizon's ridge cells), with three
 * structural moves: `when` → `runAt`, `valleyFloorFt` and `benchDiag` → `terrain.valleyFloorFt` /
 * `terrain.diag`, and soil-unit pieces → `soilUnits[].geometries`. Field names otherwise follow the
 * prototype, so test/support/fromPrototype.ts stays a short, reviewable mapping.
 *
 * Result objects are strict: an unknown field is a parse error, which is how the golden mapping proves it
 * accounted for every prototype field. Values the prototype can leave as NaN (no slope under a point outside
 * the fine DEM) are `null`, so a result survives JSON unchanged.
 */
import type { Feature, Geometry, LineString, MultiPolygon, Polygon } from "geojson";
import { z } from "zod";
import type { STEPS } from "./config";

/**
 * Bumped when ScreenResult changes shape; stored with every result. v3 (B2a, owner 2026-10-11) and v4 (VR3a, owner
 * 2026-10-12) are clean breaks: an older stored result isn't read or migrated, its parcel re-screens when opened
 * (phase-0.md §9.26, §9.30, §9.31). v9 (step 2, owner 2026-10-17; §9.49) is a clean break too: a trailhead lists the
 * Tennessee TREC trails it serves.
 */
export const SCREEN_SCHEMA_VERSION = 9 as const;

// ---------- shared ----------

export const LatLonSchema = z.tuple([z.number(), z.number()]);
const num = z.number();
const maybeNum = z.number().nullable();

/**
 * GeoJSON features are passed through untouched (turf output); only their outline is checked. Typed as the
 * GeoJSON interfaces themselves so pipeline code can hand turf results straight in.
 */
const featureOf = <G extends Geometry>(...types: G["type"][]) =>
  z.custom<Feature<G>>(
    (v) =>
      typeof v === "object" &&
      v !== null &&
      (v as { type?: unknown }).type === "Feature" &&
      types.includes((v as { geometry?: { type?: G["type"] } }).geometry?.type as G["type"]) &&
      Array.isArray((v as { geometry: { coordinates?: unknown } }).geometry.coordinates),
    { message: `expected a GeoJSON Feature of ${types.join(" or ")}` },
  );

export const PolygonGeometrySchema = z.strictObject({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(z.array(z.number()))),
});
export const MultiPolygonGeometrySchema = z.strictObject({
  type: z.literal("MultiPolygon"),
  coordinates: z.array(z.array(z.array(z.array(z.number())))),
});

// ---------- user config (Settings) ----------

export const EndpointsSchema = z.strictObject({
  _v: z.number(),
  dem: z.string(),
  terrarium: z.string(),
  sda: z.string(),
  padus: z.array(z.string()),
  nfhl: z.string(),
  overpass: z.array(z.string()),
  photon: z.string(),
  usfsRecSites: z.string(),
  stateParks: z.array(z.string()),
  tiger: z.string(),
  lpAtlasYear: z.number(),
  lpAtlasBinary: z.string(),
  lpAtlasTiles: z.string(),
  osrm: z.string(),
  parcels: z.array(z.string()),
});
export type Endpoints = z.infer<typeof EndpointsSchema>;

export const DrivewayCostsSchema = z.strictObject({
  clearPerAc: num,
  earthSoilPerYd: num,
  earthRockPerYd: num,
  stonePerTon: num,
  fabricPerSf: num,
  culvertEach: num,
  reliefCulvertEach: num,
  /** An existing drive's upgrade (follow-up 34, owner #116): the depth of stone laid over it, inches. */
  upgradeStoneIn: num,
  entrance: num,
  erosion: num,
  mobilize: num,
  woodedPct: num,
});

export const AnchorSchema = z.strictObject({ name: z.string(), lat: num, lon: num });
export type Anchor = z.infer<typeof AnchorSchema>;

export const UserConfigSchema = z.strictObject({
  houseMin: num,
  shelfMin: num,
  gardenMin: num,
  benchMinAcres: num,
  shelfMinAcres: num,
  compactMinAcres: num,
  gardenMinAcres: num,
  aspectFrom: num,
  aspectTo: num,
  thermalMinFt: num,
  shallowBedrockCm: num,
  sunHoursWanted: num,
  canopyDeg: num,
  roadMaxGradePct: num,
  /** A4b (owner, 2026-10-10): a driveway steeper than this over 30 m can't be chosen (`chooseDriveway`). */
  roadVetoGradePct: num,
  dw: DrivewayCostsSchema,
  /** value-ranking.md §4. The driveway's "no practical drive" rule reads readyToBuild (owner, 2026-10-11). */
  budget: z.strictObject({ readyToBuild: num }),
  demResM: num,
  anchors: z.array(AnchorSchema),
  endpoints: EndpointsSchema,
  timeZone: z.string(),
});
export type UserConfig = z.infer<typeof UserConfigSchema>;

// ---------- input and progress ----------

/**
 * A line drawn with the parcel (follow-up 34; lib/client/parcelStore.ts's Markup without its note): an existing drive
 * or ATV trail, or an easement's centre line with its recorded width.
 */
export const DrawnInputSchema = z.strictObject({
  id: z.string(),
  kind: z.enum(["track", "easement"]),
  line: z.array(LatLonSchema).min(2),
  widthFt: num.nullable(),
});
export type DrawnInput = z.infer<typeof DrawnInputSchema>;

export const ScreenInputSchema = z.strictObject({
  polygon: PolygonGeometrySchema, // WGS84
  /**
   * The parcel's own land when `polygon` bridges a gap between its parts (a road right-of-way; follow-up 29,
   * 13b's combinations): the acres and every site, shelf, garden and suitability cell come from it. The outline
   * stays for the driveway's connectivity and the drawing. Absent: the polygon is all own land.
   */
  ownLand: z.union([PolygonGeometrySchema, MultiPolygonGeometrySchema]).optional(),
  config: UserConfigSchema,
  house: LatLonSchema.optional(),
  evaluateAt: LatLonSchema.optional(),
  /** The lines drawn with the parcel (follow-up 34): a route may start from one's end or follow it. */
  lines: z.array(DrawnInputSchema).optional(),
  /**
   * The line chosen as the driveway (WF6, docs/plans/wf6-reroute.md §3), by id: the drives start from its route's road
   * end, and its route gets a pioneer-track estimate. The engine's own driveway fields, flags and verdict stay on the
   * app's pick. Absent or null: the app's pick.
   */
  drivewayLine: z.string().nullable().optional(),
});
export type ScreenInput = z.infer<typeof ScreenInputSchema>;

export type Step = (typeof STEPS)[number][0];
export const StepSchema = z.enum([
  "dem",
  "terrain",
  "soils",
  "sun",
  "sky",
  "flood",
  "padus",
  "near",
  "drive",
  "rank",
  "driveway",
]);

export interface ProgressEvent {
  step: Step;
  status: "run" | "done" | "fail" | "skip";
  message?: string;
  /** "Test the query" link shown when the places lookup fails (proto L1121). */
  link?: string;
  /** Snapshot after the step, for progressive rendering (verdict not yet set). */
  partial?: PartialScreenResult;
}

// ---------- result ----------

/** `step` (v4): the step that raised it, so the card can show it in its row's panel; null for the prototype's goldens. */
export const FlagSchema = z.strictObject({
  lvl: z.enum(["fatal", "warn", "good"]),
  t: z.string(),
  step: StepSchema.nullable(),
});
export type SiteGrade = "A" | "B" | "C" | "D" | "F";
export type CostTier = "$" | "$$" | "$$$" | "$$$$";

/**
 * The scores a spot's measurements give (lib/screen/derive.ts spotScores): the engine ranks the sites with them, and
 * the display derives them again; the saved screen holds none of them (v8, phase-0.md §9.44).
 */
export interface SpotScores {
  /** overall = 0.7·quality + 0.3·(100 − cost) */
  score: number;
  grade: SiteGrade;
  quality: number;
  qGrade: SiteGrade;
  q: { sun: number; aspect: number; frost: number; slope: number; sky: number };
  c: { septic: number; foundation: number; rock: number; pad: number; driveway: number };
  costIdx: number;
  costTier: CostTier;
}

const TerrainSchema = z.strictObject({
  elevMinFt: num,
  elevMaxFt: num,
  elevMeanFt: num,
  reliefFt: num,
  slopeMedDeg: num,
  slopeP90Deg: num,
  acresUnder15: num,
  acresOver25: num,
  heightAboveValleyFt: num,
  valleyFloorFt: num,
  diag: z.strictObject({ houseAc: num, shelfAc: num, gardenAc: num, totalAc: num }),
});

const BenchSchema = z.strictObject({
  acres: num,
  elevFt: num,
  slopeDeg: num,
  aspectDeg: num,
  score: num,
  ll: LatLonSchema,
  /** Set by the soils step: the bottomland reason, or null. Absent if soils didn't run. */
  veto: z.string().nullable().optional(),
});

const ShelfSchema = z.strictObject({
  acres: num,
  elevFt: num,
  slopeDeg: num,
  aspectDeg: num,
  score: num,
  ll: LatLonSchema,
  distFt: num.optional(),
  dropFt: num.optional(),
});

const GardenSchema = z.strictObject({
  acres: num,
  elevFt: num,
  slopeDeg: num,
  aspectDeg: num,
  score: num,
  aboveFt: num,
  ll: LatLonSchema,
  soil: z.string().nullable().optional(),
  soilNote: z.string().optional(),
  adj: num.optional(),
  finalScore: num.optional(),
});

/** One NRCS component row, as SDA returns it: every column a string (numbers included) or null. */
const sdaText = z.string().nullable();
const SoilRowSchema = z.strictObject({
  mukey: sdaText,
  muname: sdaText,
  farmlndcl: sdaText,
  cokey: sdaText,
  compname: sdaText,
  comppct_r: sdaText,
  drainagecl: sdaText,
  hydricrating: sdaText,
  slope_l: sdaText,
  slope_h: sdaText,
  brockdepmin: sdaText,
  drclassdcd: sdaText,
  hydgrpdcd: sdaText,
  wtdepannmin: sdaText,
  flodfreqdcd: sdaText,
  engdwbdcd: sdaText,
  engdwobdcd: sdaText,
  engstafdcd: sdaText,
  englrsdcd: sdaText,
  septic: sdaText,
});
export type SoilRow = z.infer<typeof SoilRowSchema>;

const SoilUnitSchema = z.strictObject({
  mukey: z.string(),
  muname: z.string(),
  acres: num,
  color: z.string(),
  /** The map unit's pieces inside the boundary (Polygon or MultiPolygon features). */
  geometries: z.array(featureOf<Polygon | MultiPolygon>("Polygon", "MultiPolygon")),
});

const CostRangeSchema = z.strictObject({ mid: num, low: num, high: num });

/**
 * The sky read at a spot with its own skyline (follow-up 58; v8): what its sky part derives from (sky.ts skyScore).
 * `domeW` is the brightest southern dome's weight, −1 with none.
 */
const SpotSkySchema = z.strictObject({ mag: num, coreClear: num, domeW: num });
export type SpotSky = z.infer<typeof SpotSkySchema>;

/**
 * The driveway candidate a spot is scored on (A4, chooseDriveway; v8): what its driveway points derive from
 * (score.ts drivewayPointsFrom). `limitPct` is the grade limit a route kept to the parcel was judged against, null for
 * a route within the limit; `designPct` the alternative's design grade when one is scored (follow-up 48).
 */
const ScoredDrivewaySchema = z.strictObject({
  lengthFt: num,
  cost: CostRangeSchema,
  needsEasement: z.boolean(),
  legal: z.boolean(),
  limitPct: maybeNum,
  maxGradePct: num,
  designPct: maybeNum,
  existing: z.strictObject({ maxGradePct: num, limitPct: num }).nullable(),
  noPractical: z.boolean(),
});
export type ScoredDriveway = z.infer<typeof ScoredDrivewaySchema>;

/**
 * Step 11 (plan §2.2; phase-0.md §9.66, the frozen v9 shape's declared exception): the spot's climate, PRISM's
 * January low and July high moved to its elevation, and the NOAA station its snowfall and frost dates are from
 * (`ScreenResult.climate.stations`), null when none is near enough. Optional: absent from a screen made before it.
 */
const SpotClimateSchema = z.strictObject({
  janLowF: num,
  julHighF: num,
  station: z.string().nullable(),
  stationMi: num.nullable(),
});

/** What a scored spot stores (v8): its measurements and reasons; its scores derive from them (SpotScores, derive.ts). */
const ScoreFields = {
  why: z.array(z.string()),
  sunH: num,
  daylightH: num,
  soil: z.string().nullable(),
  driveFt: num.optional(),
  roadGrade: num.optional(),
  roadRunFt: num.optional(),
  roadName: z.string().optional(),
  flood: z.literal(true).optional(),
  /**
   * v8: the sky read at the spot (the focus's reading when the spot's own failed); absent until the sky step has run,
   * when the part is score.skyIfMissing.
   */
  sky: SpotSkySchema.optional(),
  /** v8: the NRCS component under the spot (its cokey), or null without a soil polygon: its soil ratings derive from it. */
  soilKey: z.string().nullable(),
  /**
   * v8: the driveway candidate the spot is scored on. Null when no route reaches it; absent until the driveway step has
   * run, when the straight line to the road scores it.
   */
  driveway: ScoredDrivewaySchema.nullable().optional(),
  /** Step 11: absent outside the climate data's region, and on a screen made before it. */
  climate: SpotClimateSchema.optional(),
};
const CellSchema = z.strictObject({ score: num, slope: num, aspect: num, thermal: num });

/** One of a "no practical drive" target's alternatives, as the paragraph names it (v3, B2a). */
const PracticalAltSchema = z.strictObject({
  lengthFt: num,
  switchbacks: num,
  cost: CostRangeSchema,
  /** The length steeper than driveway.paveAbovePct: paved, cost TBD (follow-up 47). 0 for the easement route. */
  pavedFt: num,
});

/**
 * "No practical drive" (owner, #99 decisions; stored in v3, B2a): the target's chosen route costs more than `share`
 * of the ready-to-build budget, so it's scored on the alternative `scoredOn` (null: none found, the chosen route
 * stands). The driveway section leads with its paragraph; VR2's gate panel warns from it.
 */
const PracticalSchema = z.strictObject({
  limitPct: num,
  /** The steeper alternative's design grade (driveway.practicalMaxPct when it ran). */
  steeperPct: num,
  readyToBuild: num,
  share: num,
  /** The chosen route's cost. */
  cost: CostRangeSchema,
  steeper: PracticalAltSchema.nullable(),
  easement: PracticalAltSchema.nullable(),
  scoredOn: z.enum(["steeper", "easement"]).nullable(),
});
export type Practical = z.infer<typeof PracticalSchema>;

const SiteSchema = z.strictObject({
  rank: z.number().int(),
  ll: LatLonSchema,
  acres: num,
  elevFt: num,
  aspectDeg: num,
  slopeDeg: num,
  compact: z.literal(true).optional(),
  cell: CellSchema,
  ...ScoreFields,
  /** "No practical drive" for this site (v3, B2a): null when its chosen route is within the budget share. */
  practical: PracticalSchema.nullable(),
  /** Whether the build fits on the site (v4, VR3a; value-ranking.md §5.4): a site that doesn't can't be #1. */
  fit: z.enum(["fits", "house only", "too small"]),
  /** Gentle ground (15% or less) within the drainfield distance of the placed house, acres (§5.4 (b)). */
  gentleNearAc: num,
  /** Whether a FEMA Special Flood Hazard Area touches the site's own ground (v4, VR3a). */
  sfhaOnSite: z.boolean(),
});
export type Site = z.infer<typeof SiteSchema>;

const HouseSchema = z.union([
  z.strictObject({
    ll: LatLonSchema,
    inside: z.boolean(),
    elevFt: maybeNum,
    slopeDeg: maybeNum,
    aspectDeg: maybeNum,
    onBench: z.boolean(),
    benchAcres: maybeNum,
    veto: z.string().nullable(),
    inSFHA: z.boolean(),
    /** score is null when the house is outside the parcel (no suitability there). */
    cell: CellSchema.extend({ score: maybeNum }).nullable(),
    ...ScoreFields,
  }),
  /** The bulls-eye is outside the fine DEM window. */
  z.strictObject({ ll: LatLonSchema, outside: z.literal(true) }),
]);

/**
 * The road an entrance is on (v7, follow-up 55; owner, #123): its Census MTFCC (S1400 local road, S1500 4WD vehicular
 * trail, S1740 private road…) and the OpenStreetMap way lying on it, when one does (the tracks, service roads and
 * unclassified ways VR3a fetches): its highway, track grade, access and service tags. Either may be missing.
 */
const RoadClassSchema = z.strictObject({
  mtfcc: z.string().nullable(),
  osm: z
    .strictObject({
      highway: z.string(),
      tracktype: z.string().nullable(),
      access: z.string().nullable(),
      service: z.string().nullable(),
      /** How much of that way lies outside the parcel's outline: a private way inside it is the parcel's own drive. */
      outsideFt: num,
    })
    .nullable(),
});
export type RoadClass = z.infer<typeof RoadClassSchema>;

const EntranceSchema = z.strictObject({
  ll: LatLonSchema,
  name: z.string(),
  roadGrade: num,
  bend: num,
  bankFt: num,
  score: num,
  /** No frontage: the nearest road point, `gapFt` off the line. */
  fallback: z.literal(true).optional(),
  gapFt: num.optional(),
  /**
   * Where the road came from (v4, VR3a): Census TIGER, or an OpenStreetMap track, service road or unclassified way
   * when TIGER shows no frontage (owner, #110 follow-up: "possible frontage on an unmapped track").
   */
  source: z.enum(["tiger", "osm", "drawn"]),
  /** An OSM entrance's way to the nearest TIGER road along the OSM network, when it joins one; null otherwise. */
  reaches: z.strictObject({ road: z.string(), ft: num }).nullable(),
  /** A drawn entrance's line (v5, follow-up 34): index into `lines`, the end away from the road; null otherwise. */
  line: z.number().int().nullable(),
  /** The road it's on (v7, follow-up 55); null for a drawn line's end. */
  roadClass: RoadClassSchema.nullable(),
});

/**
 * The existing drive a route starts from (v5, follow-up 34; owner, #116): the drawn line whose end is the route's
 * entrance, priced as an upgrade, not new construction (dw.upgradeStoneIn of stone, relief culverts by its grade, and
 * the length over driveway.paveAbovePct to pave, cost TBD until follow-up 47), and graded on its raw ground: over the
 * grade limit it takes the over-limit term, over the veto a warning, never a veto. Included in the route's `cost`,
 * which then has no entrance of its own (the drive's is shared).
 */
const ExistingDriveSchema = z.strictObject({
  /** Index into `lines`. */
  line: z.number().int(),
  lengthFt: num,
  maxGradePct: num,
  avgGradePct: num,
  /** The grade limit and the veto it was judged against (Settings' roadMaxGradePct and roadVetoGradePct when routed). */
  limitPct: num,
  vetoPct: num,
  pavedFt: num,
  reliefCulverts: z.number().int(),
  stoneTons: num,
  /** Its length on neighbouring land outside every drawn easement: it counts towards the easement need. */
  outsideFt: num,
  cost: CostRangeSchema,
  /**
   * Its grade profile, [distance m, elevation m] every 3 m (owner, 10/21: the existing-drive follow-up), so its paving
   * follows Settings' threshold as the route's does. Optional, a declared exception to the frozen v9 shape (phase-0.md
   * §9.65): a screen saved before it reads as before, with the drive's stored paving text.
   */
  profile: z.array(z.tuple([num, num])).optional(),
});

const RouteSchema = z.strictObject({
  line: featureOf<LineString>("LineString"),
  profile: z.array(z.tuple([num, num])), // [distance m, elevation m] every 3 m
  metrics: z.strictObject({
    lengthFt: num,
    riseFt: num,
    maxGradePct: num,
    avgGradePct: num,
    switchbacks: num,
    earthYd: num,
    rockYd: num,
    stoneTons: num,
    fabricSf: num,
    clearAc: num,
    culverts: num,
    outsideFt: num,
    /** The length inside a FEMA Special Flood Hazard Area (v4, VR3a). */
    sfhaFt: num,
    /** The length along a drawn track or inside a drawn easement (v5, follow-up 34). */
    drawnFt: num,
    /**
     * The length outside the parcel along an OpenStreetMap way marked private (access=private or no) (v7, follow-up
     * 55; owner, #126): the route uses someone's private road before reaching the boundary.
     */
    privateFt: num,
  }),
  cost: CostRangeSchema,
  culverts: z.array(LatLonSchema),
  needsEasement: z.boolean(),
  maxGrade: num,
  label: z.string(),
  /** Index into `driveway.entrances` (the prototype shared the object itself). */
  entranceIndex: z.number().int(),
  /** The drawn lines it starts from or runs along (v5, follow-up 34): indices into `lines`. */
  lines: z.array(z.number().int()),
  /** The existing drive it starts from (v5, follow-up 34); null when it starts from a road. */
  existing: ExistingDriveSchema.nullable(),
  track: z
    .strictObject({ hours: num, waterBars: num, cost: z.strictObject({ mid: num, low: num, high: num }) })
    .optional(),
});

const DrivewaySchema = z.strictObject({
  toLabel: z.string(),
  entrances: z.array(EntranceSchema),
  routes: z.array(RouteSchema),
  note: z.string().nullable(),
  /** The direct ≤15% pioneer-track alignment, when one exists. */
  direct: RouteSchema.optional(),
  /**
   * New in the port (owner, after 15c): when no route fits the grade limit, the least-steep one found, with
   * its stretches over the limit (metres along the route). Shown as suspect; scoring doesn't use it.
   */
  overLimit: RouteSchema.extend({
    limitPct: num,
    overFt: num,
    overSpans: z.array(z.tuple([num, num])),
  }).optional(),
  /** Distance from the boundary to the nearest Census road, feet (feeds the "no frontage" note). */
  roadsNearestFt: maybeNum,
  /** "No practical drive" for the target (v3, B2a): the paragraph the section leads with. */
  practical: PracticalSchema.nullable(),
  /**
   * A switchback the router refused on a side slope over landingMaxSideSlopeDeg (owner, PR B decisions; filled by
   * B2b): where, how far along, how steep, and whether a route went around it.
   */
  steepLanding: z
    .strictObject({ ll: LatLonSchema, atFt: num, sideSlopeDeg: num, avoided: z.boolean() })
    .nullable(),
});

/**
 * A line drawn with the parcel, measured (v5, follow-up 34): its length, and its grades on the fine DEM over the part
 * the DEM covers (`gradedFt`), as a route's are measured: the mean of the 3 m steps, and the steepest over 30 m.
 */
const DrawnLineSchema = z.strictObject({
  id: z.string(),
  kind: z.enum(["track", "easement"]),
  lengthFt: num,
  widthFt: num.nullable(),
  /** The length outside the parcel's outline. */
  outsideFt: num,
  gradedFt: num,
  /** Null when the DEM didn't load or covers too little of the line. */
  avgGradePct: maybeNum,
  maxGradePct: maybeNum,
});
export type DrawnLine = z.infer<typeof DrawnLineSchema>;

const SkySchema = z.strictObject({
  mag: num,
  ratio: num,
  zone: z.string(),
  zoneWord: z.string(),
  year: num,
  coreAlt: num,
  ridgeS: num,
  coreClear: num,
  dome: z.strictObject({ az: num, km: num, ratio: num, w: num }).nullable(),
  domes: z.array(z.strictObject({ az: num, w: num, km: maybeNum, ratio: num })),
  notes: z.array(z.string()),
});

const SunSchema = z.strictObject({
  decDirectH: num,
  decDaylightH: num,
  noonAlt: num,
  noonClearance: num,
  worstAz: num,
  worstAngle: num,
  junDirectH: num,
  junDaylightH: num,
  profile: z.array(z.tuple([num, num])), // [azimuth°, skyline°] every 5°
});

const PlaceSchema = z.strictObject({ name: z.string(), ll: LatLonSchema, km: num });

/**
 * A trailhead's drive (v6, follow-up 54): by OSRM car from where the drives start (`driveFrom`) to its parking (an OSM
 * amenity=parking within drive.parkingWithinM tagged for it), else to the point. `km` is the straight line from the
 * start. Set for the nearest drive.trailheadCandidates; null for the rest, and when OSRM couldn't route it.
 */
const TrailDriveSchema = z.strictObject({
  min: num,
  mi: num,
  km: num,
  to: z.enum(["parking", "point"]),
  parkingLl: LatLonSchema.nullable(),
});

/**
 * Where the drives start (v6, follow-up 54; owner, #123): the scored driveway route's road entrance; a drawn line's
 * road end; the nearest road point when there's no frontage; the parcel's centre when no driveway was routed.
 */
const DriveFromSchema = z.strictObject({
  ll: LatLonSchema,
  kind: z.enum(["entrance", "drawn", "nearestRoad", "centre"]),
  /** The road at the entrance, as the driveway names it; null for a drawn line's end and the centre. */
  road: z.string().nullable(),
  /** A drawn line's kind (`drawn`); null otherwise. */
  line: z.enum(["track", "easement"]).nullable(),
  /** How far the nearest road point is off the parcel (`nearestRoad`); null otherwise. */
  gapFt: maybeNum,
  /** How far OSRM moved the start to its nearest road; null when OSRM didn't answer. */
  snapM: maybeNum,
  /** The route out's first miles on unnamed or track ways, from drive.trackMinMi; null below that or unknown. */
  trackMi: maybeNum,
  /** The drives are a full screen's, kept through a moved pin or house (owner, #123): the report says so. */
  kept: z.boolean(),
});
export type DriveFrom = z.infer<typeof DriveFromSchema>;

/**
 * A drive time. `er` (v3, B2a; phase-0.md §9.20 (e)): the hospital's emergency department as the snapshot lists it,
 * null on every other row. v2 appended the note to the name instead.
 */
const DriveSchema = z.strictObject({
  label: z.string(),
  name: z.string(),
  min: num,
  mi: num,
  er: z.enum(["yes", "not-listed", "unknown"]).nullable(),
});

/**
 * The settings a run used that its report shows (schema v2, step 14 plan Q1): the report renders from the
 * result alone, and a stored run keeps the thresholds it was screened with after Settings change.
 */
const RunParamsSchema = z.strictObject({
  houseMin: num,
  shelfMin: num,
  gardenMin: num,
  canopyDeg: num,
  /** The Soils section's plain-language readings flag bedrock shallower than this (14c). */
  shallowBedrockCm: num,
  /** v8: the thresholds the derived flags and scores read (lib/screen/flags.ts, derive.ts), kept with the run. */
  benchMinAcres: num,
  compactMinAcres: num,
  sunHoursWanted: num,
  thermalMinFt: num,
  roadMaxGradePct: num,
  roadVetoGradePct: num,
});
export type RunParams = z.infer<typeof RunParamsSchema>;

export const ScreenResultSchema = z.strictObject({
  schemaVersion: z.literal(SCREEN_SCHEMA_VERSION),
  /** The rules it was screened with (lib/screen/engine.ts; v3, B2a: was on the IndexedDB envelope only). */
  engine: z.number().int().positive(),
  runAt: z.string(),
  acres: num,
  params: RunParamsSchema,
  demSource: z.string().optional(),
  demResM: num.optional(),
  terrain: TerrainSchema.optional(),
  houseMinUsed: num.optional(),
  benches: z.array(BenchSchema).optional(),
  shelves: z.array(ShelfSchema).optional(),
  gardens: z.array(GardenSchema).optional(),
  soils: z.array(SoilRowSchema).optional(),
  /** null when the component query worked but the map-unit polygons didn't. */
  soilUnits: z.array(SoilUnitSchema).nullable().optional(),
  /**
   * v8: NRCS's septic and dwellings ratings without the map unit's slope (A3), by component: what a spot's cost parts
   * derive from. Null when they didn't load (then NRCS's own classes score); absent until the soils step.
   */
  soilLimits: z
    .array(
      z.strictObject({
        cokey: z.string(),
        septic: z.enum(["fine", "workable", "poor"]).nullable(),
        foundation: z.enum(["fine", "workable", "poor"]).nullable(),
      }),
    )
    .nullable()
    .optional(),
  focus: z.strictObject({ ll: LatLonSchema, label: z.string() }).optional(),
  point: z
    .strictObject({
      ll: LatLonSchema,
      elevFt: num,
      aboveFloorFt: num,
      slopeDeg: maybeNum,
      aspectDeg: maybeNum,
    })
    .optional(),
  sun: SunSchema.optional(),
  sky: SkySchema.optional(),
  flood: z
    .strictObject({ zones: z.array(z.string()), sfha: z.boolean(), sfhaAcres: num, mapped: z.boolean() })
    .optional(),
  protected: z
    .array(
      z.strictObject({
        name: z.string().nullable(),
        manager: z.string().nullable(),
        type: z.string().nullable(),
        access: z.string().nullable(),
        gap: z.string().nullable(),
        adjoins: z.boolean(),
        distFt: maybeNum,
      }),
    )
    .optional(),
  near: z
    .strictObject({
      hospitals: z.array(PlaceSchema),
      grocers: z.array(PlaceSchema.extend({ big: z.boolean() })),
      /** `source` (v3, B2a; phase-0.md §9.20 (b)): which list the point came from (lib/screen/trailheads.ts). */
      trailheads: z.array(
        PlaceSchema.extend({
          source: z.enum(["usfs", "state", "osm"]),
          /** v9 (step 2; §9.49): the TREC trails it serves, by name, when any merged into it. */
          serves: z.array(z.string()).optional(),
          drive: TrailDriveSchema.nullable(),
        }),
      ),
      trailheadCount: z.number().int(),
    })
    .optional(),
  /** "Places came from Overpass (Photon was unavailable)." */
  nearNote: z.string().optional(),
  road: z.strictObject({ name: z.string(), riseFt: num, runFt: num, gradePct: num }).optional(),
  roadNote: z.string().optional(),
  /** Destinations: "Nearest hospital", "Nearest real grocery", each anchor. */
  drives: z.array(DriveSchema).optional(),
  /** Where `drives` and the trailheads' drives start (v6, follow-up 54); absent until the drive step runs. */
  driveFrom: DriveFromSchema.optional(),
  /**
   * The closer non-chain grocery, an annotation of the grocery row, not a destination (owner, #81; v3, B2a: its own
   * field, phase-0.md §9.20 (d); v2 kept it last in `drives`). Null when there's none; absent when drives didn't run.
   */
  closerGrocery: DriveSchema.nullable().optional(),
  /**
   * Step 11 (plan §2.2; §9.66, an optional field on v9): the NOAA stations the spots' climate names, and whether the
   * parcel is outside the climate data's region (then no spot has a reading). Absent on a screen made before it.
   */
  climate: z
    .strictObject({
      outside: z.boolean(),
      stations: z.array(
        z.strictObject({
          id: z.string(),
          name: z.string(),
          elevFt: num,
          snowIn: num,
          lastFreeze: z.string(),
          firstFreeze: z.string(),
          frostFreeDays: num,
        }),
      ),
    })
    .optional(),
  excluded: z.array(z.strictObject({ acres: num, ll: LatLonSchema, why: z.string() })).optional(),
  sites: z.array(SiteSchema).optional(),
  house: HouseSchema.nullable().optional(),
  driveway: DrivewaySchema.optional(),
  /** The lines drawn with the parcel, measured (v5, follow-up 34); [] when none were drawn. */
  lines: z.array(DrawnLineSchema),
  failed: z.array(StepSchema),
  /**
   * Sources that didn't answer without failing their step (v4; phase-0.md §9.20 (c)): the wider public-land search,
   * an official trailhead list, the OpenStreetMap roads. Their absence isn't evidence.
   */
  noResponse: z.array(z.string()),
  cancelled: z.boolean(),
});
export type ScreenResult = z.infer<typeof ScreenResultSchema>;
/** A flag as a step raises it; the screen records the step with it (v4). */
/** A step's flag (v8: derived on display by lib/screen/flags.ts, not stored). */
export type Flag = z.infer<typeof FlagSchema>;
export type RawFlag = Omit<Flag, "step">;
/** The prototype's verdict, from the flags (flags.ts verdictOf). */
export type Verdict = "fatal" | "marginal" | "ok";

/** A site, or the house, with its scores: the engine's view while it ranks, and the display's once it derives. */
export type ScoredSite = Site & SpotScores;
export type HouseAssessed = Exclude<NonNullable<ScreenResult["house"]>, { outside: true }>;
export type ScoredHouse = HouseAssessed & SpotScores;

/** A snapshot during the run: not yet known whether it was cancelled (set only when the run ends). */
export const PartialScreenResultSchema = ScreenResultSchema.partial({ cancelled: true });
export type PartialScreenResult = z.infer<typeof PartialScreenResultSchema>;

// ---------- rasters (session-only, never persisted) ----------

/** A DEM on the UTM 17N grid: row 0 is the north edge, `z` in metres, NaN for no data. */
export interface Dem {
  z: Float32Array;
  w: number;
  h: number;
  /** UTM of the top-left corner (west edge, north edge). */
  x0: number;
  y0: number;
  /** Cell size east-west and north-south, metres. */
  res: number;
  resY: number;
  source: "USGS 3DEP" | "AWS Terrain Tiles (NED/SRTM)";
}
