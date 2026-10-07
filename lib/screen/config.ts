/**
 * Every threshold, weight, curve and unit cost the screen uses (CLAUDE.md "Don't change the numbers
 * silently"). Values are the prototype's (legacy/parcelscreen.html build 2026-10-04 20:36 UTC); comments
 * give the line they came from. `config.test.ts` snapshots this whole file's output, so any change shows
 * in review. A change here must also update the fixture goldens and say so in the PR.
 *
 * Two kinds of numbers live here:
 * - DEFAULT_USER_CONFIG: what the Settings dialog edits (the prototype's DEFAULTS, proto L407–457).
 * - SCREEN_CONSTANTS: fixed for now, hard-coded inline in the prototype.
 */
import type { Endpoints, UserConfig } from "./types";
import type { Curve } from "./util";

/** Service endpoints. `_v` bumps when a default moves, so stale stored copies are replaced. */
export const DEFAULT_ENDPOINTS: Endpoints = {
  _v: 11,
  dem: "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer",
  terrarium: "https://s3.amazonaws.com/elevation-tiles-prod/terrarium",
  sda: "https://SDMDataAccess.sc.egov.usda.gov/Tabular/post.rest",
  padus: [
    "https://services.arcgis.com/v01gqwM5QqNysAAi/ArcGIS/rest/services/Fee_Managers_PADUS/FeatureServer/0",
  ],
  nfhl: "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28",
  // Owner's order (_v 11, after the step 13 CORS check): the main server first; private.coffee dropped (it
  // never answered). The first entry is the "main server" whose Retry-After is honoured (places.ts).
  overpass: [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.openstreetmap.fr/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ],
  photon: "https://photon.komoot.io/api/",
  tiger: "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Transportation/MapServer",
  lpAtlasYear: 2025,
  lpAtlasBinary: "https://djlorenz.github.io/astronomy/binary_tiles",
  lpAtlasTiles: "https://djlorenz.github.io/astronomy/image_tiles",
  osrm: "https://router.project-osrm.org/route/v1/driving",
  parcels: [
    "https://services.nconemap.gov/secure/rest/services/NC1Map_Parcels/FeatureServer/1",
    "https://vginmaps.vdem.virginia.gov/arcgis/rest/services/VA_Base_Layers/VA_Parcels/FeatureServer/0",
    "https://geoviewer.cot.tn.gov/arcgis/rest/services/GeoViewer/Parcels_View/MapServer/0",
  ],
};

export const DEFAULT_USER_CONFIG: UserConfig = {
  houseMin: 60, // cell score needed to count toward a house site (0–100)
  shelfMin: 45, // cell score needed to count toward a shop/barn shelf
  gardenMin: 60, // cell score needed to count toward a garden patch
  benchMinAcres: 0.3, // minimum contiguous acres for a house site
  shelfMinAcres: 0.1, // minimum contiguous acres for a shelf
  compactMinAcres: 0.15, // a shelf this big is ranked as a compact (cut-pad) house site
  gardenMinAcres: 0.05,
  // Unused by the screen (plan §9.4): kept so prototype exports still import; hidden in Settings.
  aspectFrom: 90,
  aspectTo: 225,
  thermalMinFt: 80,
  shallowBedrockCm: 100,
  sunHoursWanted: 5,
  canopyDeg: 3,
  roadMaxGradePct: 10,
  dw: {
    clearPerAc: 6000,
    earthSoilPerYd: 12,
    earthRockPerYd: 90,
    stonePerTon: 38,
    fabricPerSf: 0.75,
    culvertEach: 3500,
    entrance: 9000,
    erosion: 3000,
    mobilize: 2500,
    woodedPct: 100,
  },
  demResM: 3,
  anchors: [
    { name: "Asheville airport (AVL)", lat: 35.4362, lon: -82.5418 },
    { name: "Roanoke airport (ROA)", lat: 37.3255, lon: -79.9754 },
    { name: "Tri-Cities airport (TRI)", lat: 36.4752, lon: -82.4074 },
    { name: "Greenville-Spartanburg (GSP)", lat: 34.8957, lon: -82.2189 },
    { name: "Charlotte airport (CLT)", lat: 35.214, lon: -80.9431 },
  ],
  endpoints: DEFAULT_ENDPOINTS,
  // New in the port (plan §9.5): civil time zone for the 3D night sky's month/hour.
  timeZone: "America/New_York",
};

/**
 * The prototype's endpoint rule (proto L461): a stored endpoints object without `_v`, or with an older
 * `_v`, is replaced wholesale by the defaults.
 */
export function migrateEndpoints(stored: unknown): Endpoints {
  const v = (stored as { _v?: unknown } | null)?._v;
  return typeof v === "number" && v >= DEFAULT_ENDPOINTS._v ? (stored as Endpoints) : DEFAULT_ENDPOINTS;
}

/** Recursively freezes a constants tree so nothing can mutate it at runtime. */
function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

const SLOPE_HOUSE: Curve = [
  [6, 100],
  [10, 75],
  [14, 50],
  [18, 25],
  [22, 0],
];
const ASPECT_CURVE: Curve = [
  [0, 100],
  [30, 100],
  [60, 85],
  [90, 65],
  [135, 45],
  [180, 40],
];

export const SCREEN_CONSTANTS = deepFreeze({
  dem: {
    fineBufferKm: 0.15, // L1011
    wideBufferKm: 6, // L1013: horizon reach
    wideResM: 30, // L1014
    resMinM: 1, // L1012: demResM clamped to [1, 30]
    resMaxM: 30,
    minCellsPerSide: 8, // L722
    maxCells: 2_400_000, // L723
    attempts: 3, // L725
    retryDelayMs: 1500, // L735: × attempt number
    timeoutMs: 45_000, // L728
    noDataBelowM: -1000, // L733
    terrarium: {
      minResM: 8, // L749
      zoomFor: [
        [12, 14],
        [25, 13],
        [Infinity, 12],
      ] as const, // L750: resM ≤ 12 → z14, ≤ 25 → z13, else z12
      maxTiles: 64, // L754
    },
  },
  terrain: {
    valleyFloorRadiusM: 1500, // L1020: lowest ground within this of the centroid, on the wide DEM
    gentleGradePct: 15, // L1024: "acres under 15% grade"
    steepGradePct: 25, // L1024: "acres over 25% grade"
    steepP90FlagDeg: 30, // L1039
  },
  suitability: {
    // L912–928
    slopeHouse: SLOPE_HOUSE,
    slopeGarden: [
      [3, 100],
      [6, 70],
      [10, 40],
      [15, 0],
    ] as Curve,
    flatBelowDeg: 3, // aspect scores 100 on near-flat ground
    cellAspectTargetDeg: 165, // L913 (site quality uses 160: score.siteAspectTargetDeg; plan §9.4)
    aspectCurve: ASPECT_CURVE, // by angular distance from the target
    /** Frost curves take thermalMinFt (user config) as the x of their second point. */
    frostHouse: { atFloor: 40, full: 100, beltTopFt: 400, exposedFt: 900, exposed: 75 },
    frostGarden: { atFloor: 0, full: 100, beltTopFt: 350, exposedFt: 800, exposed: 60 },
    house: { slopeBase: 0.55, aspectWeight: 0.45, frostBase: 0.75, frostWeight: 0.25 },
    garden: { slopeBase: 0.3, aspectWeight: 0.7, frostBase: 0.2, frostWeight: 0.8 },
  },
  sites: {
    relaxBy: 15, // L950: houseMin − 15 if nothing qualifies…
    relaxFloor: 40, // …but never below 40
    maxShelves: 6, // L953
    maxGardens: 5, // L955
    maxRankedBenches: 5, // L1151
    maxCompact: 3, // L1156
  },
  soils: {
    skipComponents: /^(water|urban land|pits|dumps)$/i, // L1042
    gardenAdj: { poorlyDrained: 0.4, somewhatPoorly: 0.8, prime: 1.1, other: 1.0, noSoil: 1 }, // L1051
    gardenScoreCap: 100,
    shallowShareFlag: 0.1, // L1069: share of the parcel
    poorShareFlag: 0.15, // L1070
    septicGentleMaxPct: 15, // L1066
    septicGentleUnknownPct: 99,
    septicMinAcres: 1, // L1071
    readingBedrockMaxCm: 201, // L1417: deeper is "not within 2 m"
    readingSteepPct: 25, // L1420
    readingSlopedPct: 15,
    readingShallowWaterTableCm: 100, // L1421
    minUnitAcres: 0.02, // L807: map-unit slivers dropped
    colors: ["#c2803a", "#4a7c9e", "#8a5ea8", "#b04a4a", "#3f8f6b", "#a89a2e", "#6b6b6b", "#d07aa0"], // L1196
  },
  sun: {
    horizonStepDeg: 5, // L1250
    horizonMaxM: 6000,
    eyeHeightM: 2, // L960
    horizonFloorDeg: -5, // L962: initial "best" angle
    decemberDoy: 355, // L1251
    juneDoy: 172,
    hourAngleStepDeg: 0.25, // L977: one minute of time
    southArc: [120, 240] as const, // L1252: worst southern ridge
  },
  sky: {
    sampleAzStepDeg: 15, // L1265
    sampleKm: [8, 16, 24, 32, 48, 64] as const,
    domeWeightKm: 30, // w = ratio × min(1, 30/km)
    southArc: [120, 240] as const, // samples that count toward the southern dome
    coreDecDeg: -29.0, // L1267: core altitude = 90 − lat − 29
    coreRidgeArc: [150, 210] as const,
    magRange: [19.0, 22.0] as const, // L1269
    domePenaltyMax: 25, // L1270: × min(1, w/3)
    domePenaltyFullW: 3,
    coreBlockedPenalty: 30, // L1271
    coreLowPenalty: 10, // L1272
    coreLowDeg: 8,
    domeBrightW: 1.5, // L1274
    domeGlowW: 0.5,
    flagBrightMag: 20.5, // L1089
    flagDarkMag: 21.5, // L1090
    atlasFinalFallbackYear: 2022, // L823: tiles are tried for endpoints.lpAtlasYear, the year before, then 2022
    timeoutMs: 30_000,
  },
  flood: {
    fatalShare: 0.3, // L1097: SFHA acres > 30% of the parcel → fatal
    // Follow-up 22 (owner, after 14e): the NFHL query's limit per attempt (the client's default, as the
    // prototype's), and one retry after a timeout with a longer one. Other errors aren't retried.
    timeoutMs: 30_000,
    retryTimeoutMs: 45_000,
  },
  padus: {
    searchM: 1600, // L1101
    adjoinsBufferKm: 0.02, // L1103
  },
  // Combining parcels (step 13b, new in the port): the widest gap bridged (a road right-of-way between
  // tracts sold together), and the gap below which parcels count as touching (digitizing slivers).
  combine: { maxGapM: 30, touchM: 1 },
  near: {
    hospitalKm: 60, // L1114
    groceryKm: 40,
    trailheadKm: 20,
    photonLimit: 40, // L876
    photonTimeoutMs: 15_000,
    overpassTimeoutMs: 25_000, // per mirror (was 20 s)
    // A 429/503 from the main (first) mirror: wait its Retry-After, or this when it sends none (L867), then
    // retry once; a Retry-After over the cap moves on at once. Other mirrors: no wait.
    overpass429WaitMs: 5000,
    overpassRetryAfterCapMs: 30_000,
    // The browser's wait for /api/places/overpass (three queries, each trying the mirrors in turn on the
    // server). The route's maxDuration matches. Was 120 s.
    overpassRouteTimeoutMs: 180_000,
    excludeHospital: /urgent|veterinar|animal|behavioral|psychiatric/i, // L1125
    bigGrocer:
      /walmart|ingles|food lion|publix|harris teeter|kroger|lowes foods|food city|trader joe|whole foods|sprouts|aldi/i, // L1126
    maxHospitals: 4, // L1128
    maxGrocers: 6,
    maxTrailheads: 25,
  },
  roads: {
    layers: [8, 6, 2] as const, // L843: local, secondary, primary
    radiusM: 1500, // L1131
    timeoutMs: 20_000,
    minDistM: 20, // L1133: closer than this, no grade is computed
  },
  drive: {
    candidates: 3, // L1141: try the nearest 3 hospitals / grocers
    timeoutMs: 15_000,
  },
  score: {
    siteAspectTargetDeg: 160, // L1290 (cells use 165; plan §9.4 unifies to 165 after Phase 0)
    sunGoodShare: 0.75, // L1296: "good" / "acceptable" wording
    sunOkShare: 0.5,
    weights: { sun: 0.4, aspect: 0.15, frost: 0.15, slope: 0.15, sky: 0.15 }, // L1295
    skyIfMissing: 60, // L1293
    sfhaQualityFactor: 0.25, // L1311
    septic: { fine: 0, workable: 20, poor: 40, unrated: 25 }, // L1302
    foundation: { fine: 0, workable: 10, poor: 25, unrated: 12 },
    rock: 15,
    compactPad: 15,
    pad: [
      [6, 0],
      [14, 10],
      [22, 20],
    ] as Curve,
    drivewayMax: 30, // min(30, needed ft / 100)
    drivewayFtPerPoint: 100,
    drivewayOverGrade: 10, // + 10 if the straight-line grade exceeds roadMaxGradePct
    overall: { quality: 0.7, cost: 0.3 }, // L1313
    costTiers: [
      [20, "$"],
      [40, "$$"],
      [65, "$$$"],
    ] as const, // else "$$$$"
    grades: [
      [80, "A"],
      [65, "B"],
      [50, "C"],
      [35, "D"],
    ] as const, // else "F"
    houseDefaultAcres: 0.25, // L1324: a house not on a found bench
  },
  driveway: {
    streamContributingM2: 20_000, // 2 ha D8 contributing area marks a drainage
    neighbors16: true,
    crossSlopeFactor: 3, // cost × (1 + 3·tan(slope))
    bottomlandFactor: 20,
    rockFactor: 1.5,
    outsideFactor: 4,
    crossingCost: 120,
    entranceSampleM: 10,
    entranceMaxDistM: 40,
    entranceBendM: 60,
    entranceInwardM: 15,
    entranceScore: { grade: 2, bend: 0.5, bankFt: 1.5 },
    entranceMinSeparationM: 60,
    maxEntrances: 3,
    entrancesRouted: 2,
    fallbackMaxM: 400, // no frontage: route from the nearest road point within this
    shortest: { wGrade: 1, label: "shortest legal" }, // maxGrade = roadMaxGradePct
    gentlest: { maxGrade: 0.08, wGrade: 4, label: "gentlest" },
    routesKept: 2,
    direct: { maxGrade: 0.15, wGrade: 0.5, label: "direct track at 15%" },
    // New in the port (owner, after 15c): when no route fits the grade limit, the least-steep route found by
    // raising the cap a whole percent at a time up to this, shown as suspect (not scored).
    // Its stretches over the limit are measured over 15 m (the 3 m profile alone is noisy) and merged across
    // gaps under 15 m.
    // entranceM: how far off the parcel the least-steep route may start, at its entrance (owner, after #52).
    leastSteep: { maxPct: 30, wGrade: 1, label: "least steep", windowM: 15, mergeM: 15, entranceM: 10 },
    chaikinPasses: 1,
    profileStepM: 3,
    turnWindowM: 15,
    switchbackTurnDeg: 100,
    benchWidthM: 3.66, // 12 ft
    m3ToYd3: 1.308,
    stoneDepthM: 0.2, // 8 in
    stoneTPerM3: 1.8,
    m2ToSf: 10.764,
    clearingWidthM: 7.3, // 24 ft corridor
    easementOutsideFt: 100,
    costRange: { low: 0.7, high: 1.3 },
    track: {
      dozerPerHr: 200,
      mPerHr: 60,
      hrsPerPctOver8: 0.5,
      hrsPerSwitchback: 1.5,
      steepGrade: 0.08,
      waterBarEveryM: 40,
      waterBarEach: 150,
      culvertEach: 900,
      entranceShare: 0.4,
      stoneTons: 20,
      clearingShare: 0.6,
      clearingRateShare: 0.5,
    },
  },
});

/** The step list and its labels, in run order (proto L990). */
export const STEPS = [
  ["dem", "Pull elevation"],
  ["terrain", "Find benches and slopes"],
  ["soils", "Query soils"],
  ["sun", "Trace the December horizon"],
  ["sky", "Measure the night sky"],
  ["flood", "Check FEMA floodplain"],
  ["padus", "Check public land adjacency"],
  ["near", "Find hospitals, groceries, trailheads"],
  ["drive", "Route drive times"],
  ["rank", "Rank the homesites"],
  ["driveway", "Route the driveway"],
] as const;
