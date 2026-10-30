/**
 * The screen: `screen(input)` runs the eleven steps in the prototype's order and returns the JSON-safe
 * result plus the in-memory session; `evaluateAt` and `setHouse` re-evaluate an existing run (the
 * prototype's tap-a-pin and mark-a-house). Ported from runScreen / setFocus / setHouse (proto L994–1185,
 * L635–643, setFocus), with the step runner turned into typed progress events.
 *
 * No DOM here: this runs in a Web Worker and in Node.
 */
import { area, bbox, centroid, feature, polygon } from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { CancelledError, createHttpClient, type HttpClient } from "../http";
import { SCREEN_CONSTANTS, STEPS } from "./config";
import { DemCache, fetchDEM, fineResM, parcelBboxes, rcToLL } from "./dem";
import { driveStart, driveTimes, trailCandidates } from "./drive";
import { TRAILHEAD_DRIVES, TRAILHEAD_PARKING } from "./driveList";
import { parkingFor, parkingFromPlaces, type ParkingLot, type ParkingSource } from "./trailheadParking";
import { ENGINE_VERSION } from "./engine";
import {
  bedrockDepth,
  buildDriveway,
  flowAccum,
  poorlyDrained,
  practicalAlternatives,
  siteDriveways,
  soilMask,
  steepLanding,
  withScoredRoute,
  type DrawnGrid,
  type PracticalAlternatives,
  type RouteContext,
  type RoutingOpts,
  type SiteDriveway,
  type SiteRoutes,
  trackCost,
} from "./driveway";
import { floodStep, sfhaMask, type FloodFeature } from "./flood";
import { nearStep } from "./near";
import { padusStep } from "./padus";
import type { HospitalCandidate, HospitalSource } from "./hospitals";
import { loadClimate, withClimate, type ClimateSource } from "./climate";
import { loadBuildings, withPrivacy, type BuildingSource } from "./privacy";
import { LONG_TRAIL_DRIVES, longTrailDrive } from "./longTrail";
import { CLIMB_DRIVES, climbingNear } from "./climbing";
import { PADDLE_DRIVES, paddlingNear } from "./paddling";
import { dishSpot } from "./dish";
import { OverpassMirrors, placesOf } from "./places";
import type { PlacesSource } from "./placeData";
import type { OsmWay } from "./osmRoads";
import { measureFrontage } from "./frontage";
import { fetchLandCover, measureCover, type Box } from "./landcover";
import { fetchFlowlines, fetchWaterbodies, measurePonds, measureStreams } from "./streams";
import { findCounty } from "./county";
import { trailNetwork } from "./trailNetwork";
import type { OsmPowerSource } from "./power";
import { drawnGrid, insideWithLines, measureLines } from "./drawn";
import type { RoadFeature } from "./roads";
import { storedHouse, storedSite } from "./derive";
import type { ScoredHouse, ScoredSite } from "./types";
import {
  assessHouse,
  chooseDriveway,
  grade,
  impracticalLine,
  practicalOutcome,
  isImpractical,
  noPracticalLine,
  practicalDriveway,
  rankSites,
  rerank,
  shelvesFromBest,
  withDrivewayChoice,
  withDrivewayCost,
  withRoutedLineAppended,
  withRoutedWhy,
  withoutVetoed,
  type ScoreContext,
} from "./score";
import { findSites, siteResults, type SiteSearch } from "./sites";
import { AtlasCache, computeSky, spotSkyOf } from "./sky";
import {
  fetchSoilLimits,
  fetchSoilPolygons,
  fetchSoils,
  screenableRows,
  vetBenches,
  vetGardens,
  type SoilLimits,
  type SoilUnit,
  type VettedBench,
} from "./soils";
import { chooseFocus, computeSun, type HorizonPoint } from "./sun";
import { insideMasks, slopeAspect, terrainStats, valleyFloor } from "./terrain";
import type {
  Dem,
  DrawnInput,
  PartialScreenResult,
  Practical,
  ProgressEvent,
  ScreenInput,
  ScreenResult,
  SoilRow,
  Step,
  UserConfig,
} from "./types";
import { SCREEN_SCHEMA_VERSION } from "./types";

export { SCREEN_SCHEMA_VERSION };
import { M2FT, M2_PER_ACRE, type LatLon } from "./util";

export interface ScreenDeps {
  /** Defaults to a browser-mode client; Node callers pass `createHttpClient({ env: "node", … })`. */
  http?: HttpClient;
  signal?: AbortSignal;
  /** Session caches: pass the same ones to a re-run so nothing is refetched. */
  demCache?: DemCache;
  atlas?: AtlasCache;
  /** Waits inside connectors (3DEP retries, the Overpass 429 pause); injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  /** Step 14d: the baked places (lib/screen/placeData.ts). The worker reads its own origin's; else `endpoints.places`. */
  places?: PlacesSource;
  /** The ERs (§9.69); injectable so tests can make it fail. Defaults to CMS's list with the hand-checked overrides. */
  hospitals?: HospitalSource;
  /** The climate snapshot (step 11); injectable as the hospitals' is. Defaults to the committed one. */
  climate?: ClimateSource;
  /** The building footprint tiles (step 11); injectable as the climate snapshot is. Defaults to the committed ones. */
  buildings?: BuildingSource;
  /** The browser's OSM roads query (VR3a, through /api/places/overpass); Node calls the mirrors directly. */
  osmRoads?: (centre: LatLon, signal?: AbortSignal) => Promise<OsmWay[]>;
  /** Step 14: OSM's power lines, when not straight to the mirrors (the worker: the app's route). */
  osmPower?: OsmPowerSource;
  /** The trailheads' parking (follow-up 54); defaults to the baked lots (step 14d). */
  parking?: ParkingSource;
}

/** Everything a run computed that isn't stored: rasters, raw features, caches. In memory only. */
export interface ScreenSession {
  parcel: Feature<Polygon>;
  /**
   * The parcel's own land, when the outline bridges a strip between parts (ScreenInput.ownLand). Sites, terrain
   * stats, soils, flood and public land measure it (owner, 2026-10-08); only the driveway router and the outline
   * keep the strip.
   */
  ownLand?: Feature<Polygon | MultiPolygon>;
  acres: number;
  centre: LatLon;
  config: UserConfig;
  house: LatLon | null;
  dFine?: Dem;
  dWide?: Dem;
  slope?: Float32Array;
  aspect?: Float32Array;
  /** Cells on the parcel's own land: sites, shelves, gardens, suitability, terrain stats, the house. */
  inside?: Uint8Array;
  /** Cells inside the outline, bridged strip included: only the driveway router (connectivity) uses it. */
  outlineInside?: Uint8Array;
  /** The lines drawn with the parcel (follow-up 34; ScreenInput.lines). */
  lines: DrawnInput[];
  /** The line chosen as the driveway (WF6; ScreenInput.drivewayLine), by id; null or absent for the app's pick. */
  drivewayLine?: string | null;
  /** The result as it stood after the rank step, and the steps failed by then (WF6): where a reroute starts. */
  ranked?: { R: Building; failed: Step[] };
  /** `lines` on the fine DEM (drawn.ts), when any were drawn. */
  drawn?: DrawnGrid;
  /** The router's own land: `outlineInside` and the drawn easements' corridors, when any were drawn. */
  routeInside?: Uint8Array;
  valleyFloorFt?: number;
  search?: SiteSearch;
  /** House sites after the soils step's bottomland check (absent if soils didn't run). */
  vetted?: VettedBench[];
  /** The suitability overlay's highlighted site (the prototype's best.id). */
  bestId?: number;
  rows?: SoilRow[];
  units?: SoilUnit[] | null;
  /** NRCS's septic and foundation ratings without slope, by cokey (A3); null when SDA didn't answer. */
  limits?: Map<string, SoilLimits> | null;
  horizon?: HorizonPoint[];
  decAltByAz?: (number | null)[];
  sfha?: FloodFeature[];
  /** sfhaMask of `sfha` on the fine DEM (VR3a). */
  sfhaGrid?: Uint8Array;
  roads?: RoadFeature[];
  /** OpenStreetMap's tracks, service roads and unclassified ways near the parcel (VR3a); absent when Overpass didn't answer. */
  osmRoads?: OsmWay[];
  /** Every non-chain supermarket the near step found, nearest first: the closer grocery's candidates (#81). */
  otherGrocers?: { name: string; ll: LatLon }[];
  /** Every candidate hospital, nearest first: the ERs within near.hospitalKm (§9.69). */
  hospitalPool?: HospitalCandidate[];
  soilMask?: Uint8Array;
  flowAcc?: Float32Array;
  bedrockCm?: Float32Array;
  wetSoil?: Uint8Array;
  deps: {
    http: HttpClient;
    demCache: DemCache;
    atlas: AtlasCache;
    sleep?: (ms: number) => Promise<void>;
    /** The baked places (step 14d), kept so a re-evaluation's drive reads the same parking. */
    places?: PlacesSource;
  };
}

export interface ScreenOutput {
  result: ScreenResult;
  session: ScreenSession;
}

/**
 * The result while it's built: the engine's view, with each site's and the house's scores (it ranks with them). The
 * saved result leaves the scores out (v8; finish, derive.ts storedSite): the display derives them, and the flags.
 */
type Building = Partial<Omit<ScreenResult, "sites" | "house">> & {
  sites?: ScoredSite[];
  house?: ScoredHouse | { ll: LatLon; outside: true } | null;
  noResponse: string[];
  lines: ScreenResult["lines"];
};

/** The result as saved (v8): every field as built, each spot without its scores. */
function finish(
  R: Building,
  stamp: Pick<ScreenResult, "schemaVersion" | "engine" | "runAt" | "failed"> & { cancelled?: boolean },
): ScreenResult {
  const stored = Object.fromEntries(
    Object.entries(R).map(([k, v]) => [
      k,
      k === "sites"
        ? (v as ScoredSite[] | undefined)?.map(storedSite)
        : k === "house"
          ? storedHouse(v as Building["house"])
          : v,
    ]),
  );
  return { ...stored, ...stamp } as ScreenResult;
}

/** The settings the report shows with a run (ScreenResult.params). */
export const runParams = (c: UserConfig): ScreenResult["params"] => ({
  houseMin: c.houseMin,
  shelfMin: c.shelfMin,
  gardenMin: c.gardenMin,
  canopyDeg: c.canopyDeg,
  shallowBedrockCm: c.shallowBedrockCm,
  // v8: what the derived flags and scores read (flags.ts, derive.ts).
  benchMinAcres: c.benchMinAcres,
  compactMinAcres: c.compactMinAcres,
  sunHoursWanted: c.sunHoursWanted,
  thermalMinFt: c.thermalMinFt,
  roadMaxGradePct: c.roadMaxGradePct,
  roadVetoGradePct: c.roadVetoGradePct,
});

/** Runs the screen on a parcel. Never throws for a failed step: failures are recorded in `failed`. */
export async function screen(
  input: ScreenInput,
  onProgress?: (e: ProgressEvent) => void,
  deps: ScreenDeps = {},
): Promise<ScreenOutput> {
  const cfg = input.config;
  const parcel = polygon(input.polygon.coordinates);
  const ownLand = input.ownLand ? feature(input.ownLand) : undefined;
  const [cLon, cLat] = centroid(parcel).geometry.coordinates as [number, number];
  const house = input.house ?? null;
  const s: ScreenSession = {
    parcel,
    ...(ownLand ? { ownLand } : {}),
    acres: area(ownLand ?? parcel) / M2_PER_ACRE,
    centre: [cLat, cLon],
    config: cfg,
    house,
    lines: input.lines ?? [],
    drivewayLine: input.drivewayLine ?? null,
    deps: {
      http: deps.http ?? createHttpClient({ env: "browser" }),
      demCache: deps.demCache ?? new DemCache(),
      atlas: deps.atlas ?? new AtlasCache(),
      ...(deps.sleep ? { sleep: deps.sleep } : {}),
      ...(deps.places ? { places: deps.places } : {}),
    },
  };
  const signal = deps.signal;
  const io = { http: s.deps.http, endpoints: cfg.endpoints, ...(signal ? { signal } : {}) };
  // The drawn lines' lengths now; their grades once the DEM is in (the terrain step).
  const R: Building = {
    acres: s.acres,
    params: runParams(cfg),
    noResponse: [],
    lines: measureLines(s.lines, parcel, null),
  };
  const failed: Step[] = [];
  let best: (SiteSearch["benches"][number] & { veto?: string | null }) | null = null;

  // No `cancelled` while the run is going: that's how a partial result is told from a finished one (v8).
  const snapshot = (): PartialScreenResult =>
    ({
      ...finish(R, {
        schemaVersion: SCREEN_SCHEMA_VERSION,
        engine: ENGINE_VERSION,
        runAt: "",
        failed: [...failed],
      }),
      noResponse: [...R.noResponse],
    }) as PartialScreenResult;
  const emit = (step: Step, status: ProgressEvent["status"], message?: string, link?: string) =>
    onProgress?.({
      step,
      status,
      ...(message ? { message } : {}),
      ...(link ? { link } : {}),
      ...(status === "done" || status === "fail" ? { partial: snapshot() } : {}),
    });

  /** The prototype's step runner: skip once cancelled, otherwise run and record done / fail. */
  const step = async (k: Step, fn: () => Promise<string | void> | string | void) => {
    if (signal?.aborted) return emit(k, "skip", "skipped");
    emit(k, "run");
    try {
      const message = await fn();
      emit(k, "done", message || undefined);
    } catch (e) {
      if (e instanceof CancelledError) return emit(k, "skip", e.message);
      failed.push(k);
      emit(k, "fail", (e as Error).message || String(e));
    }
  };

  const scoreContext = (): ScoreContext => scoreContextOf(s, R);

  // Step 14 (plan §2.4–§2.6): land cover, mapped streams and the county, asked now and read in the near step: NHD
  // answers slowly (half a minute when checked), and nothing before the near step needs them.
  const settle = <T>(p: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> =>
    p.then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    );
  const usesLand = s.ownLand ?? parcel;
  const coverAsk = settle(
    fetchLandCover(paddedBox(usesLand), io.http, 1, {
      url: cfg.endpoints.nlcd,
      timeoutMs: SCREEN_CONSTANTS.cover.timeoutMs,
      ...(signal ? { signal } : {}),
    }),
  );
  const streamsAsk = settle(fetchFlowlines(cfg.endpoints.nhd, usesLand, io));
  const pondsAsk = settle(fetchWaterbodies(cfg.endpoints.nhdWaterbody, usesLand, io));
  const countyAsk = settle(findCounty(s.centre, usesLand, io, cfg.endpoints.counties));

  await step("dem", async () => {
    // Fine, then wide, as in the prototype: a wide-DEM failure leaves the fine DEM in place.
    const b = parcelBboxes(parcel);
    const demDeps = { ...io, cache: s.deps.demCache, ...(s.deps.sleep ? { sleep: s.deps.sleep } : {}) };
    s.dFine = await fetchDEM(b.fine, fineResM(cfg.demResM), demDeps);
    R.demSource = s.dFine.source;
    R.demResM = s.dFine.res;
    s.dWide = await fetchDEM(b.wide, 30, demDeps);
  });

  await step("terrain", () => {
    if (!s.dFine) throw new Error("needs elevation");
    const { slope, aspect } = slopeAspect(s.dFine);
    s.slope = slope;
    s.aspect = aspect;
    const masks = insideMasks(s.dFine, parcel, s.ownLand);
    s.outlineInside = masks.outline;
    s.inside = masks.own;
    if (s.lines.length) {
      s.drawn = drawnGrid(s.dFine, s.lines, parcel);
      R.lines = measureLines(s.lines, parcel, s.dFine);
    }
    const vf = valleyFloor(s.dWide!, s.centre);
    s.valleyFloorFt = vf * M2FT;
    const stats = terrainStats(s.dFine, slope, s.inside, vf);
    const search = findSites(s.dFine, slope, aspect, s.inside, vf, cfg);
    s.search = search;
    best = search.benches[0] ?? null;
    s.bestId = best?.id ?? 0;
    R.terrain = { ...stats, diag: search.diag };
    Object.assign(R, siteResults(s.dFine, vf, search));
  });

  await step("soils", async () => {
    const rows = screenableRows(await fetchSoils(s.ownLand ?? parcel, io));
    R.soils = rows;
    s.rows = rows;
    // A3: NRCS's ratings without the map unit's slope. Without them every site keeps NRCS's classes, so one
    // ranking never mixes the two.
    try {
      s.limits = await fetchSoilLimits(
        rows.map((r) => String(r.cokey)),
        io,
      );
    } catch (e) {
      if (e instanceof CancelledError) throw e;
      s.limits = null;
    }
    // v8: the ratings a spot's cost parts derive from, by component; null when they didn't load.
    R.soilLimits = s.limits
      ? [...s.limits].map(([cokey, l]) => ({ cokey, septic: l.septic, foundation: l.foundation }))
      : null;
    try {
      s.units = await fetchSoilPolygons(s.ownLand ?? parcel, io);
    } catch {
      s.units = null; // the prototype carries on without map units (and so without vetoes)
    }
    R.soilUnits = s.units && s.units.map(({ geos, ...u }) => ({ ...u, geometries: geos }));
    // Re-pick the best bench: the biggest one that is not bottomland.
    if (s.dFine && s.search && s.search.benches.length) {
      const vet = vetBenches(s.search.benches, s.dFine, s.units, rows);
      s.vetted = vet.benches;
      best = vet.best;
      s.bestId = best?.id ?? 0;
      const pins = new Map(s.search.benches.map((b, i) => [b.id, R.benches![i]!]));
      R.benches = vet.benches.map((b) => ({ ...pins.get(b.id)!, veto: b.veto }));
    }
    // Gardens get their soil adjustment whether or not there's a house site (follow-up 20, A3b): the prototype
    // adjusted them only inside the bench block above.
    if (R.gardens && R.gardens.length) R.gardens = vetGardens(R.gardens, s.units, rows);
  });

  await step("sun", () => {
    if (!s.dFine || !s.dWide) throw new Error("needs elevation");
    R.demSource = s.dFine.source;
    const shelf = s.search?.shelves[0];
    const focus = chooseFocus({
      house,
      best: best ? { ll: rcToLL(s.dFine, best.rc[0], best.rc[1]), veto: best.veto ?? null } : null,
      firstShelf: shelf ? rcToLL(s.dFine, shelf.rc[0], shelf.rc[1]) : null,
      centre: s.centre,
    });
    R.focus = focus;
    const sun = computeSun(
      { dFine: s.dFine, dWide: s.dWide, slope: s.slope!, aspect: s.aspect! },
      focus.ll,
      s.valleyFloorFt ?? NaN,
      cfg.canopyDeg,
    );
    R.point = sun.point;
    R.sun = sun.sun;
    s.horizon = sun.horizon;
    s.decAltByAz = sun.decAltByAz;
  });

  await step("sky", async () => {
    if (!R.focus) throw new Error("needs the December horizon step");
    const k = await computeSky(R.focus.ll, s.horizon ?? null, cfg.canopyDeg, { ...io, atlas: s.deps.atlas });
    R.sky = k.sky;
  });

  await step("flood", async () => {
    const f = await floodStep(s.ownLand ?? parcel, s.acres, io);
    R.flood = f.flood;
    s.sfha = f.sfha;
  });

  await step("padus", async () => {
    const p = await padusStep(s.ownLand ?? parcel, io);
    R.protected = p.protected;
    R.noResponse.push(...p.unanswered);
  });

  await step("near", async () => {
    const bestLL = best && s.dFine ? rcToLL(s.dFine, best.rc[0], best.rc[1]) : null;
    const n = await nearStep(
      s.centre,
      bestLL,
      s.dWide ?? null,
      cfg.roadMaxGradePct,
      {
        ...io,
        ...(s.deps.sleep ? { sleep: s.deps.sleep } : {}),
        ...(deps.places ? { places: deps.places } : {}),
        ...(deps.hospitals ? { hospitals: deps.hospitals } : {}),
        ...(deps.osmRoads ? { osmRoads: deps.osmRoads } : {}),
        ...(deps.osmPower ? { osmPower: deps.osmPower } : {}),
        parcel: s.ownLand ?? parcel,
      },
      new OverpassMirrors(),
    );
    R.noResponse.push(...n.unanswered);
    if (n.osmRoads) s.osmRoads = n.osmRoads;
    // Step 14 (plan §2.1, §2.3): the power lines, and the road frontage from the roads just found.
    if (n.power) R.power = n.power;
    R.frontage = measureFrontage(n.roads, n.osmRoads ?? [], s.ownLand ?? parcel);
    // Step 14 (plan §2.2, §2.4–§2.6): the land cover, mapped streams and county asked at the start, and the trail
    // estimate. None is graded; a source that didn't answer is named, and the others stand.
    const [cv, st, pd, co] = await Promise.all([coverAsk, streamsAsk, pondsAsk, countyAsk]);
    for (const a of [cv, st, pd, co]) if (!a.ok && a.error instanceof CancelledError) throw a.error;
    const roadLines: [number, number][][] = [
      ...n.roads.flatMap((f) =>
        f.geometry.type === "LineString"
          ? [f.geometry.coordinates as [number, number][]]
          : (f.geometry.coordinates as [number, number][][]),
      ),
      ...(n.osmRoads ?? []).map((w) => w.coords),
    ];
    if (!cv.ok) R.noResponse.push("Land cover");
    else if (s.dFine && s.slope && s.inside)
      R.cover = measureCover(cv.value, s.dFine, s.slope, s.inside, roadLines);
    if (!st.ok) R.noResponse.push("Mapped streams");
    else R.streams = measureStreams(st.value, s.ownLand ?? parcel, bestLL);
    if (!pd.ok) R.noResponse.push("Mapped ponds");
    else R.ponds = measurePonds(pd.value, s.ownLand ?? parcel);
    if (!co.ok) R.noResponse.push("County");
    else if (co.value) {
      const { zoningFailed, ...county } = co.value;
      if (zoningFailed) R.noResponse.push("Zoning map");
      R.county = county;
    }
    if (s.dFine && s.slope && s.inside)
      R.trails = trailNetwork(s.dFine, s.slope, s.inside, (s.flowAcc ??= flowAccum(s.dFine)), sfhaGrid(s));
    if (n.near) R.near = n.near;
    s.roads = n.roads;
    if (n.otherGrocers) s.otherGrocers = n.otherGrocers;
    if (n.hospitalPool) s.hospitalPool = n.hospitalPool;
    if (n.road) R.road = n.road;
    if (n.roadNote) R.roadNote = n.roadNote;
    // Places down (plan §9.11): the roads and grade are kept, but the step reports the failure.
    if (n.placesError) throw n.placesError;
  });

  await step("rank", async () => {
    if (!s.dFine || !s.dWide) throw new Error("needs elevation");
    const ctx = scoreContext();
    const { sites, excluded } = await rankSites(
      ctx,
      s.vetted ?? s.search?.benches ?? [],
      s.search?.shelves ?? [],
      {
        slope: s.slope!,
        inside: s.inside!,
        sfha: sfhaGrid(s),
      },
    );
    R.excluded = excluded;
    const message =
      !sites.length && !excluded.length
        ? R.shelves && R.shelves.length
          ? "no house site; shelves listed below"
          : "nothing to rank — see the terrain diagnostics"
        : undefined;
    if (house)
      R.house = await assessHouse(
        { ...ctx, slope: s.slope!, aspect: s.aspect!, inside: s.inside!, search: s.search ?? null },
        house,
      );
    R.sites = sites;
    if (R.shelves) R.shelves = shelvesFromBest(R.shelves, sites);
    // Step 11 (plan §2.2): each spot's climate, from the committed snapshot; without it, the card says "not measured".
    Object.assign(R, withClimate(await (deps.climate ?? loadClimate)(), R));
    // Step 11 (plan §2.3): and its privacy, from the committed footprints and the wide DEM.
    Object.assign(
      R,
      await withPrivacy(deps.buildings ?? loadBuildings, s.dWide, s.ownLand ?? s.parcel, s.centre, R),
    );
    // Step 11 (plan §2.7): the best spot for a dish, tied ones settled by the nearest to the house or site #1.
    const near = R.house && !("outside" in R.house) ? R.house.ll : (sites[0]?.ll ?? null);
    R.dish = s.inside ? dishSpot(s.dFine, s.inside, s.dWide, near) : null;
    return message;
  });

  // The rank step's result, kept for a reroute (WF6): no step before the driveway reads the drawn lines but terrain's
  // line grid and measures, which a reroute rebuilds.
  s.ranked = { R: { ...R, noResponse: [...R.noResponse] }, failed: [...failed] };

  await step("driveway", () => {
    if (!s.dFine) throw new Error("needs elevation");
    return drivewayStep(s, R, scoreContext(), (n) =>
      emit("driveway", "run", `${n} route search${n === 1 ? "" : "es"} done`),
    );
  });

  // Last (follow-up 54; owner, #123): the drives start where the scored driveway meets the road (or the chosen line's
  // route does, WF6), and the nearest trailheads are driven to, at their parking.
  await step("drive", () => driveStep(s, R, io, deps.parking, signal));

  const result = finish(R, {
    schemaVersion: SCREEN_SCHEMA_VERSION,
    engine: ENGINE_VERSION,
    runAt: (deps.now ?? (() => new Date()))().toISOString(),
    failed,
    cancelled: !!signal?.aborted,
  });
  let out: ScreenOutput = { result, session: s };
  if (input.evaluateAt) out = await evaluateAt(out, input.evaluateAt, "the evaluation point");
  return out;
}

/** The scoring's view of the session and the result so far (each spot's sky once the sky step has run). */
export const scoreContextOf = (s: ScreenSession, R: Pick<Building, "sky">): ScoreContext => ({
  dFine: s.dFine!,
  dWide: s.dWide!,
  valleyFloorFt: s.valleyFloorFt ?? NaN,
  skyAt: skyAtOf(s, R.sky),
  focusSky: R.sky ? spotSkyOf(R.sky) : null,
  roads: s.roads ?? null,
  sfha: s.sfha ?? null,
  units: s.units ?? null,
  rows: s.rows ?? null,
  limits: s.limits ?? null,
  cfg: s.config,
});

/**
 * The sky read at a spot (follow-up 58): the sky step's reading, taken there with the spot's own skyline. Only once
 * the sky step has run (its atlas tiles are cached by then); null where a spot's reading fails, and the scoring then
 * takes the focus's reading (v8: stored as the spot's).
 */
function skyAtOf(s: ScreenSession, sky: ScreenResult["sky"] | undefined): ScoreContext["skyAt"] {
  if (!sky) return undefined;
  const io = { http: s.deps.http, endpoints: s.config.endpoints, atlas: s.deps.atlas };
  return (ll, horizon) =>
    computeSky(ll, horizon, s.config.canopyDeg, io).then(
      (k) => k.spot,
      () => null,
    );
}

/**
 * Re-routes a finished run for other drawn lines or another driveway choice (WF6, docs/plans/wf6-reroute.md §2): what a
 * full run would give with them, from its session. What the lines touch is rebuilt (the line grid, the router's own
 * land and the masks built on it, the lines' measures), the driveway step runs again from the rank step's result, and
 * the drive step only when the drive start moved: that's the only part that makes a request. Throws when the run can't
 * be rerouted (a step before the driveway didn't finish), and a CancelledError when `deps.signal` aborts.
 */
export async function reroute(
  out: ScreenOutput,
  lines: DrawnInput[],
  drivewayLine: string | null,
  deps: Pick<ScreenDeps, "signal" | "now" | "parking"> = {},
  onProgress?: (e: ProgressEvent) => void,
): Promise<ScreenOutput> {
  const s0 = out.session;
  if (!s0.ranked || !s0.dFine || !s0.slope) throw new Error("This screen can't be rerouted; run it again.");
  const signal = deps.signal;
  const stop = () => {
    if (signal?.aborted) throw new CancelledError();
  };
  stop();
  // The session with the new lines: what was built on the old ones is dropped, to be built again on demand.
  const { drawn: _d, routeInside: _r, soilMask: _m, bedrockCm: _b, wetSoil: _w, ...kept } = s0;
  const s: ScreenSession = { ...kept, lines, drivewayLine };
  if (lines.length) s.drawn = drawnGrid(s0.dFine, lines, s0.parcel);
  const R: Building = {
    ...s0.ranked.R,
    noResponse: [...s0.ranked.R.noResponse],
    // As the terrain step measures them.
    lines: measureLines(lines, s0.parcel, lines.length ? s0.dFine : null),
  };
  const failed = [...s0.ranked.failed];
  const io: StepIo = {
    http: s.deps.http,
    endpoints: s.config.endpoints,
    ...(signal ? { signal } : {}),
  };

  onProgress?.({ step: "driveway", status: "run" });
  try {
    const message = drivewayStep(s, R, scoreContextOf(s, R), (n) =>
      onProgress?.({
        step: "driveway",
        status: "run",
        message: `${n} route search${n === 1 ? "" : "es"} done`,
      }),
    );
    onProgress?.({ step: "driveway", status: "done", ...(message ? { message } : {}) });
  } catch (e) {
    failed.push("driveway");
    onProgress?.({ step: "driveway", status: "fail", message: (e as Error).message || String(e) });
  }
  stop();

  // The drive step again only when its start moved (a full run's drives from the same start are the same).
  const before = out.result;
  const start = driveStart(R.driveway, s.lines, s.centre, s.drivewayLine);
  const was = before.driveFrom;
  const same =
    !before.failed.includes("drive") &&
    !!was &&
    was.ll[0] === start.ll[0] &&
    was.ll[1] === start.ll[1] &&
    was.kind === start.kind &&
    was.road === start.road &&
    was.line === start.line &&
    was.gapFt === start.gapFt;
  if (same) {
    // What the drive step wrote, carried over, in the order it writes it.
    R.drives = before.drives;
    R.driveFrom = { ...was, kept: false };
    if (before.closerGrocery !== undefined) R.closerGrocery = before.closerGrocery;
    if (before.near) R.near = before.near;
    // Step 11: and the long-trail drive, timed from the same start.
    if (before.longTrail !== undefined) R.longTrail = before.longTrail;
    // Step 14d: and the paddling drive, the same way.
    if (before.paddling !== undefined) R.paddling = before.paddling;
    // Step 17: and the climbing drives.
    if (before.climbing !== undefined) R.climbing = before.climbing;
    for (const n of before.noResponse)
      if (
        n === TRAILHEAD_PARKING ||
        n === TRAILHEAD_DRIVES ||
        n === LONG_TRAIL_DRIVES ||
        n === PADDLE_DRIVES ||
        n === CLIMB_DRIVES
      )
        R.noResponse.push(n);
  } else {
    onProgress?.({ step: "drive", status: "run" });
    try {
      await driveStep(s, R, io, deps.parking, signal);
      onProgress?.({ step: "drive", status: "done" });
    } catch (e) {
      if (e instanceof CancelledError) throw e;
      failed.push("drive");
      onProgress?.({ step: "drive", status: "fail", message: (e as Error).message || String(e) });
    }
  }
  stop();

  const result = finish(R, {
    schemaVersion: SCREEN_SCHEMA_VERSION,
    engine: ENGINE_VERSION,
    runAt: (deps.now ?? (() => new Date()))().toISOString(),
    failed,
    cancelled: false,
  });
  return { result, session: s };
}

/** What a step's requests need: the client, the endpoints, and the run's cancellation. */
type StepIo = { http: HttpClient; endpoints: UserConfig["endpoints"]; signal?: AbortSignal };

/**
 * The driveway step (a full run's, and a reroute's: WF6): every ranked site re-costed from its own routed driveway, the
 * driveway built to the house or site #1 with the route it's scored on, and its flags. Writes R; returns the step's
 * message. `onSearch` counts the router's searches (the step can take seconds).
 */
function drivewayStep(
  s: ScreenSession,
  R: Building,
  sctx: ScoreContext,
  onSearch: (n: number) => void,
): string | undefined {
  const cfg = s.config,
    parcel = s.parcel,
    house = s.house;
  const rctx = routeContext(s);
  // Progress while the router works (A4b PR B): a count of its searches.
  let searches = 0;
  const routing = { onProgress: () => onSearch(++searches) };
  // A3 (owner, 2026-10-09): every ranked site re-costed from its own routed driveway, all in one search per
  // entrance (siteDriveways), so the ranking compares like with like. A4: from the candidate with fewer points.
  // Each site's routes, by position (rerank copies the sites).
  const routeAt = new Map<string, SiteRoutes>();
  // "No practical drive" (owner, #99 decisions): the alternatives of each site whose chosen route is impractical.
  const altAt = new Map<string, PracticalAlternatives>();
  const at = (ll: LatLon) => `${ll[0]},${ll[1]}`;
  if (R.sites && R.sites.length) {
    const lls = R.sites.map((x) => x.ll);
    const est = siteDriveways(rctx, s.roads ?? [], parcel, lls, cfg.roadMaxGradePct, routing);
    const alts = alternativesFor(rctx, s, lls, est, routing);
    R.sites.forEach((x, i) => {
      routeAt.set(at(x.ll), est[i]!);
      if (alts[i]) altAt.set(at(x.ll), alts[i]);
    });
    R.sites = rerank(
      R.sites.map((x, i) =>
        withDrivewayCost(sctx, x, practicalDriveway(chooseDriveway(est[i]!, cfg.roadVetoGradePct), alts[i])),
      ),
    );
  }
  const to = house
    ? { ll: house, label: "the existing house" }
    : R.sites && R.sites[0]
      ? { ll: R.sites[0].ll, label: "site #1" }
      : null;
  if (!to) throw new Error("no site to route to");
  const toRoutes = house
    ? houseRoutes(rctx, s.roads ?? [], parcel, house, cfg.roadMaxGradePct)
    : routeAt.get(at(to.ll));
  R.driveway = buildDriveway(rctx, s.roads ?? [], parcel, to.ll, to.label, cfg.roadMaxGradePct, routing);
  // The route the target is scored on, first in the section and on the map (owner, #88 review).
  if (toRoutes) {
    const scored = chooseDriveway(toRoutes, cfg.roadVetoGradePct);
    R.driveway = withScoredRoute(rctx, R.driveway, scored, to.ll);
    // Every candidate vetoed (A4b): the least steep is shown, under a flag and a sentence appended to the note.
    if (scored.noPractical) {
      const line = noPracticalLine(scored, cfg.roadVetoGradePct);
      R.driveway = { ...R.driveway, note: R.driveway.note ? `${R.driveway.note} ${line}` : line };
    }
    // A switchback refused on a side slope over 35° (owner, PR B decisions; B2b): stored, the card says so.
    R.driveway = {
      ...R.driveway,
      steepLanding: steepLanding(rctx, R.driveway.entrances, to.ll, scored, cfg.roadMaxGradePct, routing),
    };
    // The section leads with "No practical drive" and the alternatives (owner, #99 decisions: placed first).
    const alt = house ? alternativesFor(rctx, s, [to.ll], [toRoutes], routing)[0] : altAt.get(at(to.ll));
    if (alt) R.driveway = { ...R.driveway, practical: outcome(scored, alt, cfg) };
  }
  // The household's chosen line (WF6): its route gets its pioneer-track estimate, as the app's pick has; the same
  // function and rates. The route over the line itself stays an existing drive to upgrade (#116).
  const mine = chosenRoute(R.driveway, s.lines, s.drivewayLine);
  if (mine && !mine.track)
    R.driveway = {
      ...R.driveway,
      routes: R.driveway.routes.map((r) => (r === mine ? { ...r, track: trackCost(r, cfg.dw) } : r)),
    };
  // Site #1 keeps the prototype's routed line in place of its straight-line one; every other site with a route
  // within the limit gets the same line appended (A3b, owner 2026-10-09). Then, where its two candidates differ,
  // both, the scored one first (A4). With a house, the driveway above is the house's: site #1's line is the route
  // its own driveway would lead with (owner, #142; §9.43), so its card is the same either way.
  const rt = house ? site1Route(R.sites?.[0], routeAt, at, cfg.roadVetoGradePct) : R.driveway.routes[0];
  if (R.sites)
    R.sites = R.sites.map((x, i) => {
      const r = routeAt.get(at(x.ll));
      const y =
        i === 0 && rt ? withRoutedWhy(x, rt) : r?.withinLimit ? withRoutedLineAppended(x, r.withinLimit) : x;
      if (!r) return y;
      const z = withDrivewayChoice(y, r, cfg.roadMaxGradePct, cfg.roadVetoGradePct);
      const chosen = chooseDriveway(r, cfg.roadVetoGradePct);
      const v = chosen.noPractical
        ? { ...z, why: [...z.why, noPracticalLine(chosen, cfg.roadVetoGradePct)] }
        : z;
      const alt = altAt.get(at(x.ll));
      if (!alt) return v;
      const p = outcome(chosen, alt, cfg);
      return { ...v, why: [...v.why, impracticalLine(p)], practical: p };
    });
  if (house && R.house && toRoutes)
    R.house = houseWithDriveway(sctx, R.house, toRoutes, alternativesFor(rctx, s, [house], [toRoutes])[0]);
  if (R.shelves && R.sites) R.shelves = shelvesFromBest(R.shelves, R.sites);
  return R.driveway.note ?? undefined;
}

/**
 * The route site #1's own driveway leads with (withScoredRoute on buildDriveway to it), from the routes already found
 * to it: the scored one when it's within the limit, else the cheapest within the limit, which is buildDriveway's first
 * (siteDriveways and buildDriveway find the same routes, A3). Used with a house (§9.43): no route search of its own.
 */
function site1Route(
  site: NonNullable<ScreenResult["sites"]>[number] | undefined,
  routeAt: Map<string, SiteRoutes>,
  at: (ll: LatLon) => string,
  vetoPct: number,
): Parameters<typeof withRoutedWhy>[1] | undefined {
  const r = site && routeAt.get(at(site.ll));
  if (!r) return undefined;
  const scored = chooseDriveway(r, vetoPct);
  const lead = scored.legal ? scored : r.withinLimit;
  return lead?.route && lead.entranceIndex != null
    ? { ...lead.route, entranceIndex: lead.entranceIndex }
    : undefined;
}

/**
 * The route the router found from the household's chosen line's end (WF6), among the driveway's routes; undefined
 * without a choice, or when this run has no route from that line.
 */
function chosenRoute(
  dw: NonNullable<Building["driveway"]>,
  lines: readonly DrawnInput[],
  lineId: string | null | undefined,
): NonNullable<Building["driveway"]>["routes"][number] | undefined {
  const index = lineId ? lines.findIndex((l) => l.id === lineId) : -1;
  if (index < 0) return undefined;
  return dw.routes.find((r) => {
    const e = dw.entrances[r.entranceIndex];
    return e?.source === "drawn" && e.line === index;
  });
}

/**
 * The drive step (a full run's, and a reroute's when the start moved: WF6): where the drives start, then the drives,
 * the closer grocery and the nearest trailheads', at their parking. The step's only requests: Overpass for the
 * parking, OSRM for the drives.
 */
async function driveStep(
  s: ScreenSession,
  R: Building,
  io: StepIo,
  parking: ParkingSource | undefined,
  signal: AbortSignal | undefined,
): Promise<void> {
  R.drives = []; // stays [] if nothing routes
  const start = driveStart(R.driveway, s.lines, s.centre, s.drivewayLine);
  R.driveFrom = { ...start, snapM: null, trackMi: null, kept: false };
  const candidates = trailCandidates(R.near?.trailheads ?? [], start.ll);
  let lots: ParkingLot[] = [];
  if (candidates.length)
    try {
      lots = await (
        parking ?? parkingFromPlaces(placesOf({ ...io, ...(s.deps.places ? { places: s.deps.places } : {}) }))
      )(
        candidates.map((c) => c.ll),
        signal,
      );
    } catch (e) {
      if (e instanceof CancelledError) throw e;
      R.noResponse.push(TRAILHEAD_PARKING); // the drives go to the points: close enough, and not a flag
    }
  const trails = candidates.map((c) => ({
    index: c.index,
    ll: c.ll,
    parkingLl: parkingFor(R.near!.trailheads[c.index]!, lots),
  }));
  const d = await driveTimes(
    start.ll,
    R.near,
    s.config.anchors,
    io,
    {
      ...(s.otherGrocers ? { otherGrocers: s.otherGrocers } : {}),
      ...(s.hospitalPool ? { hospitals: s.hospitalPool } : {}),
    },
    trails,
  );
  R.drives = d.drives;
  R.closerGrocery = d.closerGrocery;
  R.driveFrom = { ...R.driveFrom, snapM: d.snapM, trackMi: d.trackMi };
  if (trails.length && !d.trailDrives.size) R.noResponse.push(TRAILHEAD_DRIVES);
  if (R.near)
    R.near = {
      ...R.near,
      trailheads: R.near.trailheads.map((t, i) => ({ ...t, drive: d.trailDrives.get(i) ?? null })),
    };
  // Step 11 (plan §2.6): the nearest long trail, in a request of its own; unknown when OSRM doesn't answer.
  const lt = await longTrailDrive(start.ll, io);
  if (lt === undefined) {
    delete R.longTrail;
    R.noResponse.push(LONG_TRAIL_DRIVES);
  } else R.longTrail = lt;
  // Step 14d (plan §4.1): the nearest flatwater launch, in a request of its own; unknown when it can't be read.
  const pd = await paddlingNear(
    start.ll,
    R.ponds,
    placesOf({ ...io, ...(s.deps.places ? { places: s.deps.places } : {}) }),
    io,
  );
  if (pd === undefined) {
    delete R.paddling;
    R.noResponse.push(PADDLE_DRIVES);
  } else R.paddling = pd;
  // Step 17 (plan §3): the nearest rope and bouldering areas, in a request of their own; unknown when unread.
  const cl = await climbingNear(
    start.ll,
    placesOf({ ...io, ...(s.deps.places ? { places: s.deps.places } : {}) }),
    io,
  );
  if (cl === undefined) {
    delete R.climbing;
    R.noResponse.push(CLIMB_DRIVES);
  } else R.climbing = cl;
}

/**
 * "No practical drive" (owner, #99 decisions, 2026-10-11): for each target whose chosen driveway is impractical
 * (isImpractical), its realistic alternatives the veto allows; null for the rest. One search per style for all.
 */
function alternativesFor(
  ctx: RouteContext,
  s: ScreenSession,
  lls: readonly LatLon[],
  routes: readonly SiteRoutes[],
  routing: RoutingOpts = {},
): (PracticalAlternatives | null)[] {
  const c = s.config;
  const out: (PracticalAlternatives | null)[] = routes.map(() => null);
  const trip = routes.flatMap((r, i) =>
    isImpractical(chooseDriveway(r, c.roadVetoGradePct), c.budget.readyToBuild) ? [i] : [],
  );
  if (!trip.length) return out;
  practicalAlternatives(
    ctx,
    s.roads ?? [],
    s.parcel,
    trip.map((i) => lls[i]!),
    trip.map((i) => routes[i]!),
    c.roadMaxGradePct,
    routing,
  ).forEach((a, k) => (out[trip[k]!] = withoutVetoed(a, c.roadVetoGradePct)));
  return out;
}

/** The stored "no practical drive" outcome for a target's chosen route and its alternatives (owner, #99 decisions). */
const outcome = (chosen: SiteDriveway, alt: PracticalAlternatives, cfg: UserConfig): Practical =>
  practicalOutcome(chosen, alt, cfg.roadMaxGradePct, cfg.budget.readyToBuild);

/** The driveway router's view of the session; the soil mask and flow accumulation are built once. */
export function routeContext(s: ScreenSession): RouteContext {
  // The router keeps the whole outline: a driveway may cross a bridged right-of-way (follow-up 29), and a drawn
  // easement (follow-up 34).
  const inside = routeInside(s);
  return {
    dFine: s.dFine!,
    inside,
    slope: s.slope!,
    soilMask: () =>
      (s.soilMask ??= soilMask(s.units ?? null, s.rows ?? null, s.dFine!, inside, s.config.shallowBedrockCm)),
    flowAcc: () => (s.flowAcc ??= flowAccum(s.dFine!)),
    bedrockCm: () => (s.bedrockCm ??= bedrockDepth(s.units ?? null, s.rows ?? null, s.dFine!, inside)),
    wetSoil: () => (s.wetSoil ??= poorlyDrained(s.units ?? null, s.rows ?? null, s.dFine!, inside)),
    sfhaMask: () => sfhaGrid(s),
    ...(s.osmRoads ? { osmRoads: s.osmRoads } : {}),
    ...(s.drawn ? { drawn: s.drawn } : {}),
    limitPct: s.config.roadMaxGradePct,
    vetoPct: s.config.roadVetoGradePct,
    dw: s.config.dw,
  };
}

/** The outline's cells and the drawn easements' (follow-up 34), built once per session. */
function routeInside(s: ScreenSession): Uint8Array {
  const outline = s.outlineInside ?? s.inside!;
  if (!s.drawn) return outline;
  return (s.routeInside ??= insideWithLines(outline, s.drawn));
}

/** The flood zones on the fine DEM, built once per session (VR3a): sites and routes are read against it. */
/** The parcel's box widened by about 60 m: NLCD's 30 m cells along its edge (step 14). */
const paddedBox = (p: Feature<Polygon | MultiPolygon>): Box => {
  const [w, so, e, n] = bbox(p);
  return [w - 0.0007, so - 0.0006, e + 0.0007, n + 0.0006];
};

const sfhaGrid = (s: ScreenSession): Uint8Array => (s.sfhaGrid ??= sfhaMask(s.dFine!, s.sfha ?? null));

/**
 * Re-evaluates the sun, sky and driveway at another point (the prototype's setFocus): site scores and flags
 * stay as they were. A sky or driveway failure keeps the previous value, as in the prototype.
 */
export async function evaluateAt(out: ScreenOutput, ll: LatLon, label: string): Promise<ScreenOutput> {
  const s = out.session;
  if (!s.dFine || !s.dWide || !s.slope || !s.aspect) return out;
  const result: ScreenResult = {
    ...out.result,
    focus: { ll, label },
    // The drives stay the full screen's (owner, #123): the report says so.
    ...(out.result.driveFrom ? { driveFrom: { ...out.result.driveFrom, kept: true } } : {}),
  };
  const sun = computeSun(
    { dFine: s.dFine, dWide: s.dWide, slope: s.slope, aspect: s.aspect },
    ll,
    s.valleyFloorFt ?? NaN,
    s.config.canopyDeg,
  );
  result.point = sun.point;
  result.sun = sun.sun;
  const session: ScreenSession = { ...s, horizon: sun.horizon, decAltByAz: sun.decAltByAz };
  try {
    const io = { http: s.deps.http, endpoints: s.config.endpoints, atlas: s.deps.atlas };
    result.sky = (await computeSky(ll, sun.horizon, s.config.canopyDeg, io)).sky;
  } catch {
    /* keep the previous sky */
  }
  try {
    if (s.inside) {
      const ctx = routeContext(session);
      const dw = buildDriveway(ctx, s.roads ?? [], s.parcel, ll, label, s.config.roadMaxGradePct);
      const routes = siteDriveways(ctx, s.roads ?? [], s.parcel, [ll], s.config.roadMaxGradePct)[0]!;
      const scored = chooseDriveway(routes, s.config.roadVetoGradePct);
      result.driveway = withScoredRoute(ctx, dw, scored, ll);
      if (scored.noPractical) {
        const line = noPracticalLine(scored, s.config.roadVetoGradePct);
        result.driveway = {
          ...result.driveway,
          note: result.driveway.note ? `${result.driveway.note} ${line}` : line,
        };
      }
      result.driveway = {
        ...result.driveway,
        steepLanding: steepLanding(ctx, result.driveway.entrances, ll, scored, s.config.roadMaxGradePct),
      };
      const alt = alternativesFor(ctx, session, [ll], [routes])[0];
      if (alt) result.driveway = { ...result.driveway, practical: outcome(scored, alt, s.config) };
    }
  } catch {
    /* keep the previous driveway */
  }
  return { result, session };
}

/**
 * Marks (or clears) the existing house on a finished run (the prototype's setHouse): the house is assessed
 * with its own sky (follow-up 58; the prototype used the sky as it stood), then the sun, sky and driveway are
 * re-evaluated at the house.
 */
export async function setHouse(out: ScreenOutput, ll: LatLon | null): Promise<ScreenOutput> {
  const house: LatLon | null = ll ? [+ll[0].toFixed(6), +ll[1].toFixed(6)] : null;
  const s = out.session;
  if (!house || !s.dFine || !s.dWide || !s.slope || !s.aspect || !s.inside)
    return { result: { ...out.result, house: null }, session: { ...s, house } };
  const ctx = scoreContextOf(s, out.result);
  const assessed = await assessHouse(
    { ...ctx, slope: s.slope, aspect: s.aspect, inside: s.inside, search: s.search ?? null },
    house,
  );
  const done = await evaluateAt(
    { result: { ...out.result, house: storedHouse(assessed) }, session: { ...s, house } },
    house,
    "the existing house",
  );
  if (!done.result.driveway || "outside" in assessed)
    return { ...done, result: await readHouse(done.result) };
  const rc = routeContext(done.session);
  const hr = houseRoutes(rc, s.roads ?? [], s.parcel, house, s.config.roadMaxGradePct);
  const alt = alternativesFor(rc, done.session, [house], [hr])[0];
  const result = { ...done.result, house: storedHouse(houseWithDriveway(ctx, assessed, hr, alt)) };
  return { ...done, result: await readHouse(result) };

  /** Step 11: the house's climate and privacy, as every site's (the stations are the result's, so all are read again). */
  async function readHouse(r: ScreenResult): Promise<ScreenResult> {
    const withC = { ...r, ...withClimate(await loadClimate(), r) };
    return {
      ...withC,
      ...(await withPrivacy(loadBuildings, s.dWide, s.ownLand ?? s.parcel, s.centre, withC)),
    };
  }
}

/** The existing house's two candidate driveways (A4), as every ranked site's. */
function houseRoutes(
  ctx: RouteContext,
  roads: RoadFeature[],
  parcel: Feature<Polygon>,
  house: LatLon,
  roadMaxGradePct: number,
): SiteRoutes {
  return siteDriveways(ctx, roads, parcel, [house], roadMaxGradePct)[0]!;
}

/** The existing house re-costed from its driveway (A3), the candidate with fewer points (A4), when it can be scored. */
function houseWithDriveway(
  ctx: Pick<ScoreContext, "valleyFloorFt" | "cfg">,
  h: ScoredHouse | { ll: LatLon; outside: true },
  routes: SiteRoutes,
  alt: PracticalAlternatives | null | undefined,
): ScoredHouse | { ll: LatLon; outside: true } {
  if ("outside" in h || h.elevFt == null || h.slopeDeg == null || h.aspectDeg == null) return h;
  const scored = withDrivewayCost(
    ctx,
    { ...h, elevFt: h.elevFt, slopeDeg: h.slopeDeg, aspectDeg: h.aspectDeg },
    practicalDriveway(chooseDriveway(routes, ctx.cfg.roadVetoGradePct), alt),
  );
  return {
    ...h,
    ...scored,
    elevFt: h.elevFt,
    slopeDeg: h.slopeDeg,
    aspectDeg: h.aspectDeg,
    grade: grade(scored.score),
  };
}

export { STEPS };
