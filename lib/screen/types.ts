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

/** Bumped when ScreenResult changes shape; stored with every result. */
export const SCREEN_SCHEMA_VERSION = 2 as const;

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
  dw: DrivewayCostsSchema,
  demResM: num,
  anchors: z.array(AnchorSchema),
  endpoints: EndpointsSchema,
  timeZone: z.string(),
});
export type UserConfig = z.infer<typeof UserConfigSchema>;

// ---------- input and progress ----------

export const ScreenInputSchema = z.strictObject({
  polygon: PolygonGeometrySchema, // WGS84
  config: UserConfigSchema,
  house: LatLonSchema.optional(),
  evaluateAt: LatLonSchema.optional(),
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

const FlagSchema = z.strictObject({ lvl: z.enum(["fatal", "warn", "good"]), t: z.string() });
const Grade = z.enum(["A", "B", "C", "D", "F"]);
const CostTier = z.enum(["$", "$$", "$$$", "$$$$"]);

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

const ScoreFields = {
  score: num, // overall = 0.7·quality + 0.3·(100 − cost)
  why: z.array(z.string()),
  sunH: num,
  daylightH: num,
  q: z.strictObject({ sun: num, aspect: num, frost: num, slope: num, sky: num }),
  soil: z.string().nullable(),
  c: z.strictObject({ septic: num, foundation: num, rock: num, pad: num, driveway: num }),
  costIdx: num,
  costTier: CostTier,
  quality: num,
  qGrade: Grade,
  grade: Grade,
  driveFt: num.optional(),
  roadGrade: num.optional(),
  roadRunFt: num.optional(),
  roadName: z.string().optional(),
  flood: z.literal(true).optional(),
};
const CellSchema = z.strictObject({ score: num, slope: num, aspect: num, thermal: num });

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
  }),
  cost: z.strictObject({ mid: num, low: num, high: num }),
  culverts: z.array(LatLonSchema),
  needsEasement: z.boolean(),
  maxGrade: num,
  label: z.string(),
  /** Index into `driveway.entrances` (the prototype shared the object itself). */
  entranceIndex: z.number().int(),
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
});

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
  score: num,
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
});
export type RunParams = z.infer<typeof RunParamsSchema>;

export const ScreenResultSchema = z.strictObject({
  schemaVersion: z.literal(SCREEN_SCHEMA_VERSION),
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
      trailheads: z.array(PlaceSchema),
      trailheadCount: z.number().int(),
    })
    .optional(),
  /** "Places came from Overpass (Photon was unavailable)." */
  nearNote: z.string().optional(),
  road: z.strictObject({ name: z.string(), riseFt: num, runFt: num, gradePct: num }).optional(),
  roadNote: z.string().optional(),
  drives: z.array(z.strictObject({ label: z.string(), name: z.string(), min: num, mi: num })).optional(),
  excluded: z.array(z.strictObject({ acres: num, ll: LatLonSchema, why: z.string() })).optional(),
  sites: z.array(SiteSchema).optional(),
  house: HouseSchema.nullable().optional(),
  driveway: DrivewaySchema.optional(),
  flags: z.array(FlagSchema),
  failed: z.array(StepSchema),
  cancelled: z.boolean(),
  verdict: z.enum(["fatal", "marginal", "ok"]),
});
export type ScreenResult = z.infer<typeof ScreenResultSchema>;

/** A snapshot during the run: no verdict yet, not yet known whether it was cancelled. */
export const PartialScreenResultSchema = ScreenResultSchema.partial({ verdict: true, cancelled: true });
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
