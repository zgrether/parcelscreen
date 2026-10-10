// Every number the screen uses, as a snapshot: changing one shows up in this file's diff, which is the
// point (CLAUDE.md "Don't change the numbers silently"). Update with `vitest -u` only on purpose, and say
// so in the PR alongside the goldens it moves.
import { describe, expect, it } from "vitest";
import { DEFAULT_ENDPOINTS, DEFAULT_USER_CONFIG, migrateEndpoints, SCREEN_CONSTANTS, STEPS } from "./config";

describe("config", () => {
  it("user defaults are unchanged", () => {
    expect(DEFAULT_USER_CONFIG).toMatchInlineSnapshot(`
      {
        "anchors": [
          {
            "lat": 35.4362,
            "lon": -82.5418,
            "name": "Asheville airport (AVL)",
          },
          {
            "lat": 37.3255,
            "lon": -79.9754,
            "name": "Roanoke airport (ROA)",
          },
          {
            "lat": 36.4752,
            "lon": -82.4074,
            "name": "Tri-Cities airport (TRI)",
          },
          {
            "lat": 34.8957,
            "lon": -82.2189,
            "name": "Greenville-Spartanburg (GSP)",
          },
          {
            "lat": 35.214,
            "lon": -80.9431,
            "name": "Charlotte airport (CLT)",
          },
        ],
        "aspectFrom": 90,
        "aspectTo": 225,
        "benchMinAcres": 0.3,
        "canopyDeg": 3,
        "compactMinAcres": 0.15,
        "demResM": 3,
        "dw": {
          "clearPerAc": 6000,
          "culvertEach": 3500,
          "earthRockPerYd": 90,
          "earthSoilPerYd": 12,
          "entrance": 9000,
          "erosion": 3000,
          "fabricPerSf": 0.75,
          "mobilize": 2500,
          "stonePerTon": 38,
          "woodedPct": 100,
        },
        "endpoints": {
          "_v": 12,
          "dem": "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer",
          "lpAtlasBinary": "https://djlorenz.github.io/astronomy/binary_tiles",
          "lpAtlasTiles": "https://djlorenz.github.io/astronomy/image_tiles",
          "lpAtlasYear": 2025,
          "nfhl": "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28",
          "osrm": "https://router.project-osrm.org/route/v1/driving",
          "overpass": [
            "https://overpass-api.de/api/interpreter",
            "https://overpass.openstreetmap.fr/api/interpreter",
            "https://overpass.kumi.systems/api/interpreter",
          ],
          "padus": [
            "https://services.arcgis.com/v01gqwM5QqNysAAi/ArcGIS/rest/services/Fee_Managers_PADUS/FeatureServer/0",
          ],
          "parcels": [
            "https://services.nconemap.gov/secure/rest/services/NC1Map_Parcels/FeatureServer/1",
            "https://vginmaps.vdem.virginia.gov/arcgis/rest/services/VA_Base_Layers/VA_Parcels/FeatureServer/0",
            "https://geoviewer.cot.tn.gov/arcgis/rest/services/GeoViewer/Parcels_View/MapServer/0",
          ],
          "photon": "https://photon.komoot.io/api/",
          "sda": "https://SDMDataAccess.sc.egov.usda.gov/Tabular/post.rest",
          "stateParks": [
            "https://vginmaps.vdem.virginia.gov/arcgis/rest/services/VA_Base_Layers/VA_Landmarks/FeatureServer/1",
            "https://services6.arcgis.com/nRIB86xC7kq6wavB/arcgis/rest/services/NC_State_Parks_Points/FeatureServer/0",
            "https://services5.arcgis.com/bPacKTm9cauMXVfn/arcgis/rest/services/TN_State_Parks_Points/FeatureServer/0",
          ],
          "terrarium": "https://s3.amazonaws.com/elevation-tiles-prod/terrarium",
          "tiger": "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Transportation/MapServer",
          "usfsRecSites": "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_InfraRecreationSites_01/MapServer/0",
        },
        "gardenMin": 60,
        "gardenMinAcres": 0.05,
        "houseMin": 60,
        "roadMaxGradePct": 10,
        "roadVetoGradePct": 20,
        "shallowBedrockCm": 100,
        "shelfMin": 45,
        "shelfMinAcres": 0.1,
        "sunHoursWanted": 5,
        "thermalMinFt": 80,
        "timeZone": "America/New_York",
      }
    `);
  });

  it("screen constants are unchanged", () => {
    expect(SCREEN_CONSTANTS).toMatchInlineSnapshot(`
      {
        "combine": {
          "maxGapM": 30,
          "touchM": 1,
        },
        "dem": {
          "attempts": 3,
          "fineBufferKm": 0.15,
          "maxCells": 2400000,
          "minCellsPerSide": 8,
          "noDataBelowM": -1000,
          "resMaxM": 30,
          "resMinM": 1,
          "retryDelayMs": 1500,
          "terrarium": {
            "maxTiles": 64,
            "minResM": 8,
            "zoomFor": [
              [
                12,
                14,
              ],
              [
                25,
                13,
              ],
              [
                Infinity,
                12,
              ],
            ],
          },
          "timeoutMs": 45000,
          "wideBufferKm": 6,
          "wideResM": 30,
        },
        "drive": {
          "candidates": 3,
          "timeoutMs": 15000,
        },
        "driveway": {
          "benchWidthM": 3.66,
          "bottomlandFactor": 20,
          "chaikinPasses": 1,
          "clearingWidthM": 7.3,
          "costRange": {
            "high": 1.3,
            "low": 0.7,
          },
          "crossSlopeFactor": 3,
          "crossingCost": 120,
          "direct": {
            "label": "direct track at 15%",
            "maxGrade": 0.15,
            "wGrade": 0.5,
          },
          "easementOutsideFt": 100,
          "entranceBendM": 60,
          "entranceInwardM": 15,
          "entranceMaxDistM": 40,
          "entranceMinSeparationM": 60,
          "entranceSampleM": 10,
          "entranceScore": {
            "bankFt": 1.5,
            "bend": 0.5,
            "grade": 2,
          },
          "entrancesRouted": 2,
          "fallbackMaxM": 400,
          "gentlest": {
            "label": "gentlest",
            "maxGrade": 0.08,
            "wGrade": 4,
          },
          "gradeWindowsM": {
            "headline": 30,
            "long": 60,
            "short": 15,
          },
          "leastSteep": {
            "entranceM": 10,
            "label": "least steep",
            "maxPct": 30,
            "mergeM": 15,
            "wGrade": 1,
            "windowM": 15,
          },
          "m2ToSf": 10.764,
          "m3ToYd3": 1.308,
          "maxEntrances": 3,
          "neighbors16": true,
          "outsideFactor": 4,
          "overLimitMaxAtPct": 20,
          "overLimitMaxPts": 20,
          "overLimitPtsPerPct": 1,
          "practicalMaxPct": 15,
          "profileStepM": 3,
          "rockFactor": 1.5,
          "routesKept": 2,
          "shortest": {
            "label": "shortest legal",
            "wGrade": 1,
          },
          "stoneDepthM": 0.2,
          "stoneTPerM3": 1.8,
          "streamContributingM2": 20000,
          "switchbackTurnDeg": 100,
          "track": {
            "clearingRateShare": 0.5,
            "clearingShare": 0.6,
            "culvertEach": 900,
            "dozerPerHr": 200,
            "entranceShare": 0.4,
            "hrsPerPctOver8": 0.5,
            "hrsPerSwitchback": 1.5,
            "mPerHr": 60,
            "steepGrade": 0.08,
            "stoneTons": 20,
            "waterBarEach": 150,
            "waterBarEveryM": 40,
          },
          "turnWindowM": 15,
        },
        "flood": {
          "fatalShare": 0.3,
          "retryTimeoutMs": 45000,
          "timeoutMs": 30000,
        },
        "grocery": {
          "closerMinMin": 10,
        },
        "near": {
          "bigGrocer": /walmart\\|ingles\\|food lion\\|publix\\|harris teeter\\|kroger\\|lowes foods\\|food city\\|trader joe\\|whole foods\\|sprouts\\|aldi/i,
          "excludeHospital": /urgent\\|veterinar\\|animal\\|behavioral\\|psychiatric/i,
          "excludeHospitalSpeciality": /psychiatr\\|rehabilitat/i,
          "groceryKm": 40,
          "hospitalKm": 60,
          "maxGrocers": 6,
          "maxHospitals": 4,
          "maxTrailheads": 25,
          "officialTimeoutMs": 20000,
          "overpass429WaitMs": 5000,
          "overpassRetryAfterCapMs": 30000,
          "overpassRouteTimeoutMs": 180000,
          "overpassTimeoutMs": 25000,
          "photonLimit": 40,
          "photonTimeoutMs": 15000,
          "trailheadDedupeM": 300,
          "trailheadKm": 20,
        },
        "padus": {
          "adjoinsBufferKm": 0.02,
          "nearestOpenKm": 16,
          "openSimplifyDeg": 0.0002,
          "searchM": 1600,
        },
        "roads": {
          "layers": [
            8,
            6,
            2,
          ],
          "minDistM": 20,
          "radiusM": 1500,
          "timeoutMs": 20000,
        },
        "score": {
          "compactPad": 15,
          "costTiers": [
            [
              20,
              "$",
            ],
            [
              40,
              "$$",
            ],
            [
              65,
              "$$$",
            ],
          ],
          "drivewayCost": {
            "c0": 20000,
            "easement": 10,
            "k": 9,
            "max": 40,
          },
          "drivewayFtPerPoint": 100,
          "drivewayMax": 30,
          "drivewayOverGrade": 10,
          "foundation": {
            "fine": 0,
            "poor": 25,
            "unrated": 12,
            "workable": 10,
          },
          "grades": [
            [
              80,
              "A",
            ],
            [
              65,
              "B",
            ],
            [
              50,
              "C",
            ],
            [
              35,
              "D",
            ],
          ],
          "houseDefaultAcres": 0.25,
          "overall": {
            "cost": 0.3,
            "quality": 0.7,
          },
          "pad": [
            [
              6,
              0,
            ],
            [
              14,
              10,
            ],
            [
              22,
              20,
            ],
          ],
          "rock": 15,
          "rockDepthCm": {
            "full": 50,
            "none": 150,
          },
          "septic": {
            "fine": 0,
            "poor": 40,
            "unrated": 25,
            "workable": 20,
          },
          "sfhaQualityFactor": 0.25,
          "siteAspectTargetDeg": 165,
          "skyIfMissing": 60,
          "sunGoodShare": 0.75,
          "sunOkShare": 0.5,
          "weights": {
            "aspect": 0.15,
            "frost": 0.15,
            "sky": 0.15,
            "slope": 0.15,
            "sun": 0.4,
          },
        },
        "sites": {
          "maxCompact": 3,
          "maxGardens": 5,
          "maxRankedBenches": 5,
          "maxShelves": 6,
          "relaxBy": 15,
          "relaxFloor": 40,
        },
        "sky": {
          "atlasFinalFallbackYear": 2022,
          "coreBlockedPenalty": 30,
          "coreDecDeg": -29,
          "coreLowDeg": 8,
          "coreLowPenalty": 10,
          "coreRidgeArc": [
            150,
            210,
          ],
          "domeBrightW": 1.5,
          "domeGlowW": 0.5,
          "domePenaltyFullW": 8,
          "domePenaltyMax": 25,
          "domeWeightKm": 30,
          "flagBrightMag": 20.5,
          "flagDarkMag": 21.5,
          "magRange": [
            19,
            22,
          ],
          "sampleAzStepDeg": 15,
          "sampleKm": [
            8,
            16,
            24,
            32,
            48,
            64,
          ],
          "southArc": [
            120,
            240,
          ],
          "timeoutMs": 30000,
        },
        "soils": {
          "colors": [
            "#c2803a",
            "#4a7c9e",
            "#8a5ea8",
            "#b04a4a",
            "#3f8f6b",
            "#a89a2e",
            "#6b6b6b",
            "#d07aa0",
          ],
          "gardenAdj": {
            "noSoil": 1,
            "other": 1,
            "poorlyDrained": 0.4,
            "prime": 1.1,
            "somewhatPoorly": 0.8,
          },
          "gardenScoreCap": 100,
          "minUnitAcres": 0.02,
          "poorShareFlag": 0.15,
          "readingBedrockMaxCm": 201,
          "readingShallowWaterTableCm": 100,
          "readingSlopedPct": 15,
          "readingSteepPct": 25,
          "septicGentleMaxPct": 15,
          "septicGentleUnknownPct": 99,
          "septicMinAcres": 1,
          "shallowShareFlag": 0.1,
          "skipComponents": /\\^\\(water\\|urban land\\|pits\\|dumps\\)\\$/i,
        },
        "suitability": {
          "aspectCurve": [
            [
              0,
              100,
            ],
            [
              30,
              100,
            ],
            [
              60,
              85,
            ],
            [
              90,
              65,
            ],
            [
              135,
              45,
            ],
            [
              180,
              40,
            ],
          ],
          "cellAspectTargetDeg": 165,
          "flatBelowDeg": 3,
          "frostGarden": {
            "atFloor": 0,
            "beltTopFt": 350,
            "exposed": 60,
            "exposedFt": 800,
            "full": 100,
          },
          "frostHouse": {
            "atFloor": 40,
            "beltTopFt": 400,
            "exposed": 75,
            "exposedFt": 900,
            "full": 100,
          },
          "garden": {
            "aspectWeight": 0.7,
            "frostBase": 0.2,
            "frostWeight": 0.8,
            "slopeBase": 0.3,
          },
          "house": {
            "aspectWeight": 0.45,
            "frostBase": 0.75,
            "frostWeight": 0.25,
            "slopeBase": 0.55,
          },
          "slopeGarden": [
            [
              3,
              100,
            ],
            [
              6,
              70,
            ],
            [
              10,
              40,
            ],
            [
              15,
              0,
            ],
          ],
          "slopeHouse": [
            [
              6,
              100,
            ],
            [
              10,
              75,
            ],
            [
              14,
              50,
            ],
            [
              18,
              25,
            ],
            [
              22,
              0,
            ],
          ],
        },
        "sun": {
          "decemberDoy": 355,
          "eyeHeightM": 2,
          "horizonFloorDeg": -5,
          "horizonMaxM": 6000,
          "horizonStepDeg": 5,
          "hourAngleStepDeg": 0.25,
          "juneDoy": 172,
          "southArc": [
            120,
            240,
          ],
        },
        "terrain": {
          "gentleGradePct": 15,
          "steepGradePct": 25,
          "steepP90FlagDeg": 30,
          "valleyFloorRadiusM": 1500,
        },
      }
    `);
  });

  it("step order and labels match the prototype", () => {
    expect(STEPS.map(([id]) => id)).toEqual([
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
  });

  it("constants can't be mutated at runtime", () => {
    expect(Object.isFrozen(SCREEN_CONSTANTS.score.septic)).toBe(true);
    expect(() => {
      (SCREEN_CONSTANTS.score.weights as { sun: number }).sun = 1;
    }).toThrow();
  });
});

describe("migrateEndpoints (the prototype's _v rule)", () => {
  it("keeps a stored copy at the current version", () => {
    const stored = { ...DEFAULT_ENDPOINTS, photon: "https://photon.example/api/" };
    expect(migrateEndpoints(stored)).toBe(stored);
  });

  it("replaces an older, unversioned or unreadable copy with the defaults", () => {
    expect(migrateEndpoints({ ...DEFAULT_ENDPOINTS, _v: 9 })).toBe(DEFAULT_ENDPOINTS);
    expect(migrateEndpoints({ dem: "x" })).toBe(DEFAULT_ENDPOINTS);
    expect(migrateEndpoints(null)).toBe(DEFAULT_ENDPOINTS);
  });

  it("_v 11: settings saved at _v 10 pick up the new Overpass order", () => {
    const savedAtV10 = {
      ...DEFAULT_ENDPOINTS,
      _v: 10,
      overpass: [
        "https://overpass.kumi.systems/api/interpreter",
        "https://overpass.openstreetmap.fr/api/interpreter",
        "https://overpass.private.coffee/api/interpreter",
        "https://overpass-api.de/api/interpreter",
      ],
    };
    expect(migrateEndpoints(savedAtV10).overpass).toEqual([
      "https://overpass-api.de/api/interpreter",
      "https://overpass.openstreetmap.fr/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
    ]);
  });
});
