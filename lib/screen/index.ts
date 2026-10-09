/**
 * The screen: `screen(input)` runs the eleven steps in the prototype's order and returns the JSON-safe
 * result plus the in-memory session; `evaluateAt` and `setHouse` re-evaluate an existing run (the
 * prototype's tap-a-pin and mark-a-house). Ported from runScreen / setFocus / setHouse (proto L994–1185,
 * L635–643, setFocus), with the step runner turned into typed progress events.
 *
 * No DOM here: this runs in a Web Worker and in Node.
 */
import { area, centroid, feature, polygon } from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { CancelledError, createHttpClient, type HttpClient } from "../http";
import { STEPS } from "./config";
import { DemCache, fetchDEM, fineResM, parcelBboxes, rcToLL } from "./dem";
import { driveTimes } from "./drive";
import {
  buildDriveway,
  flowAccum,
  siteDriveways,
  soilMask,
  withScoredRoute,
  type RouteContext,
  type SiteRoutes,
} from "./driveway";
import { floodStep, type FloodFeature } from "./flood";
import { nearStep } from "./near";
import { padusStep } from "./padus";
import type { HospitalCandidate, HospitalSource } from "./hospitals";
import { OverpassMirrors, type OverpassFallback } from "./places";
import type { RoadFeature } from "./roads";
import {
  assessHouse,
  chooseDriveway,
  grade,
  rankSites,
  rerank,
  shelvesFromBest,
  withDrivewayChoice,
  withDrivewayCost,
  withRoutedLineAppended,
  withRoutedWhy,
  type ScoreContext,
} from "./score";
import { findSites, siteFlags, siteResults, type SiteSearch } from "./sites";
import { AtlasCache, computeSky, skyFlags } from "./sky";
import {
  fetchSoilLimits,
  fetchSoilPolygons,
  fetchSoils,
  screenableRows,
  soilFlags,
  vetBenches,
  vetGardens,
  type SoilLimits,
  type SoilUnit,
  type VettedBench,
} from "./soils";
import { chooseFocus, computeSun, sunFlags, type HorizonPoint } from "./sun";
import { insideMasks, slopeAspect, terrainFlags, terrainStats, valleyFloor } from "./terrain";
import type {
  Dem,
  PartialScreenResult,
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
  /** The browser's Overpass fallback (through /api/places/overpass); Node calls the mirrors directly. */
  overpass?: OverpassFallback;
  /** The hospital snapshot (A2c); injectable so tests can make it fail. Defaults to the committed one. */
  hospitals?: HospitalSource;
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
  roads?: RoadFeature[];
  /** Every non-chain supermarket the near step found, nearest first: the closer grocery's candidates (#81). */
  otherGrocers?: { name: string; ll: LatLon }[];
  /** Every candidate hospital, nearest first, with its emergency status when known (A2c). */
  hospitalPool?: HospitalCandidate[];
  soilMask?: Uint8Array;
  flowAcc?: Float32Array;
  deps: { http: HttpClient; demCache: DemCache; atlas: AtlasCache; sleep?: (ms: number) => Promise<void> };
}

export interface ScreenOutput {
  result: ScreenResult;
  session: ScreenSession;
}

type Building = Partial<ScreenResult> & { flags: ScreenResult["flags"] };

/** The settings the report shows with a run (ScreenResult.params). */
export const runParams = (c: UserConfig): ScreenResult["params"] => ({
  houseMin: c.houseMin,
  shelfMin: c.shelfMin,
  gardenMin: c.gardenMin,
  canopyDeg: c.canopyDeg,
  shallowBedrockCm: c.shallowBedrockCm,
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
    deps: {
      http: deps.http ?? createHttpClient({ env: "browser" }),
      demCache: deps.demCache ?? new DemCache(),
      atlas: deps.atlas ?? new AtlasCache(),
      ...(deps.sleep ? { sleep: deps.sleep } : {}),
    },
  };
  const signal = deps.signal;
  const io = { http: s.deps.http, endpoints: cfg.endpoints, ...(signal ? { signal } : {}) };
  const R: Building = { acres: s.acres, params: runParams(cfg), flags: [] };
  const failed: Step[] = [];
  let best: (SiteSearch["benches"][number] & { veto?: string | null }) | null = null;

  const snapshot = (): PartialScreenResult =>
    ({
      schemaVersion: SCREEN_SCHEMA_VERSION,
      runAt: "",
      ...R,
      flags: [...R.flags],
      failed: [...failed],
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

  const scoreContext = (): ScoreContext => ({
    dFine: s.dFine!,
    dWide: s.dWide!,
    valleyFloorFt: s.valleyFloorFt ?? NaN,
    skyScore: R.sky?.score,
    roads: s.roads ?? null,
    sfha: s.sfha ?? null,
    units: s.units ?? null,
    rows: s.rows ?? null,
    limits: s.limits ?? null,
    cfg,
  });

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
    const vf = valleyFloor(s.dWide!, s.centre);
    s.valleyFloorFt = vf * M2FT;
    const stats = terrainStats(s.dFine, slope, s.inside, vf);
    const search = findSites(s.dFine, slope, aspect, s.inside, vf, cfg);
    s.search = search;
    best = search.benches[0] ?? null;
    s.bestId = best?.id ?? 0;
    R.terrain = { ...stats, diag: search.diag };
    Object.assign(R, siteResults(s.dFine, vf, search));
    R.flags.push(...siteFlags(search, cfg, !!house), ...terrainFlags(stats.slopeP90Deg));
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
      R.flags.push(...vet.flags);
    }
    // Gardens get their soil adjustment whether or not there's a house site (follow-up 20, A3b): the prototype
    // adjusted them only inside the bench block above.
    if (R.gardens && R.gardens.length) R.gardens = vetGardens(R.gardens, s.units, rows);
    R.flags.push(...soilFlags(rows, s.units, s.acres, cfg.shallowBedrockCm));
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
    R.flags.push(...sunFlags(sun.sun, focus.label, sun.worst, cfg.sunHoursWanted));
  });

  await step("sky", async () => {
    if (!R.focus) throw new Error("needs the December horizon step");
    const k = await computeSky(R.focus.ll, s.horizon ?? null, cfg.canopyDeg, { ...io, atlas: s.deps.atlas });
    R.sky = k.sky;
    R.flags.push(...skyFlags(k.sky, k.zone, k.worst));
  });

  await step("flood", async () => {
    const f = await floodStep(s.ownLand ?? parcel, s.acres, io);
    R.flood = f.flood;
    s.sfha = f.sfha;
    R.flags.push(...f.flags);
  });

  await step("padus", async () => {
    const p = await padusStep(s.ownLand ?? parcel, io);
    R.protected = p.protected;
    R.flags.push(...p.flags);
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
        ...(deps.overpass ? { overpass: deps.overpass } : {}),
        ...(deps.hospitals ? { hospitals: deps.hospitals } : {}),
      },
      new OverpassMirrors(),
    );
    if (n.near) R.near = n.near;
    if (n.nearNote) R.nearNote = n.nearNote;
    s.roads = n.roads;
    if (n.otherGrocers) s.otherGrocers = n.otherGrocers;
    if (n.hospitalPool) s.hospitalPool = n.hospitalPool;
    if (n.road) R.road = n.road;
    if (n.roadNote) R.roadNote = n.roadNote;
    R.flags.push(...n.flags);
    // Places down (plan §9.11): the roads and grade are kept, but the step reports the failure.
    if (n.placesError) throw n.placesError;
  });

  await step("drive", async () => {
    R.drives = [];
    R.drives = await driveTimes(s.centre, R.near, cfg.anchors, io, {
      ...(s.otherGrocers ? { otherGrocers: s.otherGrocers } : {}),
      ...(s.hospitalPool ? { hospitals: s.hospitalPool } : {}),
    }); // stays [] if nothing routes
  });

  await step("rank", () => {
    if (!s.dFine || !s.dWide) throw new Error("needs elevation");
    const ctx = scoreContext();
    const { sites, excluded } = rankSites(ctx, s.vetted ?? s.search?.benches ?? [], s.search?.shelves ?? []);
    R.excluded = excluded;
    const message =
      !sites.length && !excluded.length
        ? R.shelves && R.shelves.length
          ? "no house site; shelves listed below"
          : "nothing to rank — see the terrain diagnostics"
        : undefined;
    if (house)
      R.house = assessHouse(
        { ...ctx, slope: s.slope!, aspect: s.aspect!, inside: s.inside!, search: s.search ?? null },
        house,
      );
    R.sites = sites;
    if (R.shelves) R.shelves = shelvesFromBest(R.shelves, sites);
    return message;
  });

  await step("driveway", () => {
    if (!s.dFine) throw new Error("needs elevation");
    const rctx = routeContext(s);
    const sctx = scoreContext();
    // A3 (owner, 2026-10-09): every ranked site re-costed from its own routed driveway, all in one search per
    // entrance (siteDriveways), so the ranking compares like with like. A4: from the candidate with fewer points.
    // Each site's routes, by position (rerank copies the sites).
    const routeAt = new Map<string, SiteRoutes>();
    const at = (ll: LatLon) => `${ll[0]},${ll[1]}`;
    if (R.sites && R.sites.length) {
      const est = siteDriveways(
        rctx,
        s.roads ?? [],
        parcel,
        R.sites.map((x) => x.ll),
        cfg.roadMaxGradePct,
      );
      R.sites.forEach((x, i) => routeAt.set(at(x.ll), est[i]!));
      R.sites = rerank(R.sites.map((x, i) => withDrivewayCost(sctx, x, chooseDriveway(est[i]!))));
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
    R.driveway = buildDriveway(rctx, s.roads ?? [], parcel, to.ll, to.label, cfg.roadMaxGradePct);
    // The route the target is scored on, first in the section and on the map (owner, #88 review).
    if (toRoutes) R.driveway = withScoredRoute(rctx, R.driveway, chooseDriveway(toRoutes), to.ll);
    const rt = R.driveway.routes[0];
    // Site #1 keeps the prototype's routed line in place of its straight-line one; every other site with a route
    // within the limit gets the same line appended (A3b, owner 2026-10-09). Then, where its two candidates differ,
    // both, the scored one first (A4).
    if (R.sites)
      R.sites = R.sites.map((x, i) => {
        const r = routeAt.get(at(x.ll));
        const y =
          i === 0 && rt && !house
            ? withRoutedWhy(x, rt)
            : r?.withinLimit
              ? withRoutedLineAppended(x, r.withinLimit)
              : x;
        return r ? withDrivewayChoice(y, r, cfg.roadMaxGradePct) : y;
      });
    if (house && R.house && toRoutes) R.house = houseWithDriveway(sctx, R.house, toRoutes);
    if (R.shelves && R.sites) R.shelves = shelvesFromBest(R.shelves, R.sites);
    return R.driveway.note ?? undefined;
  });

  if (house) for (const f of R.flags) if (f.lvl === "fatal" && /^No house site/.test(f.t)) f.lvl = "warn";
  const result: ScreenResult = {
    ...(R as Omit<ScreenResult, "schemaVersion" | "runAt" | "failed" | "cancelled" | "verdict">),
    schemaVersion: SCREEN_SCHEMA_VERSION,
    runAt: (deps.now ?? (() => new Date()))().toISOString(),
    failed,
    cancelled: !!signal?.aborted,
    verdict: R.flags.some((f) => f.lvl === "fatal")
      ? "fatal"
      : R.flags.some((f) => f.lvl === "warn")
        ? "marginal"
        : "ok",
  };
  let out: ScreenOutput = { result, session: s };
  if (input.evaluateAt) out = await evaluateAt(out, input.evaluateAt, "the evaluation point");
  return out;
}

/** The driveway router's view of the session; the soil mask and flow accumulation are built once. */
export function routeContext(s: ScreenSession): RouteContext {
  // The router keeps the whole outline: a driveway may cross a bridged right-of-way (follow-up 29).
  const inside = s.outlineInside ?? s.inside!;
  return {
    dFine: s.dFine!,
    inside,
    slope: s.slope!,
    soilMask: () =>
      (s.soilMask ??= soilMask(s.units ?? null, s.rows ?? null, s.dFine!, inside, s.config.shallowBedrockCm)),
    flowAcc: () => (s.flowAcc ??= flowAccum(s.dFine!)),
    dw: s.config.dw,
  };
}

/**
 * Re-evaluates the sun, sky and driveway at another point (the prototype's setFocus): site scores and flags
 * stay as they were. A sky or driveway failure keeps the previous value, as in the prototype.
 */
export async function evaluateAt(out: ScreenOutput, ll: LatLon, label: string): Promise<ScreenOutput> {
  const s = out.session;
  if (!s.dFine || !s.dWide || !s.slope || !s.aspect) return out;
  const result: ScreenResult = { ...out.result, focus: { ll, label } };
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
      result.driveway = withScoredRoute(ctx, dw, chooseDriveway(routes), ll);
    }
  } catch {
    /* keep the previous driveway */
  }
  return { result, session };
}

/**
 * Marks (or clears) the existing house on a finished run (the prototype's setHouse): the house is assessed
 * with the sky as it stands, then the sun, sky and driveway are re-evaluated at the house.
 */
export async function setHouse(out: ScreenOutput, ll: LatLon | null): Promise<ScreenOutput> {
  const house: LatLon | null = ll ? [+ll[0].toFixed(6), +ll[1].toFixed(6)] : null;
  const s = out.session;
  if (!house || !s.dFine || !s.dWide || !s.slope || !s.aspect || !s.inside)
    return { result: { ...out.result, house: null }, session: { ...s, house } };
  const ctx: ScoreContext = {
    dFine: s.dFine,
    dWide: s.dWide,
    valleyFloorFt: s.valleyFloorFt ?? NaN,
    skyScore: out.result.sky?.score,
    roads: s.roads ?? null,
    sfha: s.sfha ?? null,
    units: s.units ?? null,
    rows: s.rows ?? null,
    limits: s.limits ?? null,
    cfg: s.config,
  };
  const assessed = assessHouse(
    { ...ctx, slope: s.slope, aspect: s.aspect, inside: s.inside, search: s.search ?? null },
    house,
  );
  const done = await evaluateAt(
    { result: { ...out.result, house: assessed }, session: { ...s, house } },
    house,
    "the existing house",
  );
  return done.result.driveway && done.result.house
    ? {
        ...done,
        result: {
          ...done.result,
          house: houseWithDriveway(
            ctx,
            done.result.house,
            houseRoutes(routeContext(done.session), s.roads ?? [], s.parcel, house, s.config.roadMaxGradePct),
          ),
        },
      }
    : done;
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
  ctx: Pick<ScoreContext, "valleyFloorFt" | "skyScore" | "cfg">,
  h: NonNullable<ScreenResult["house"]>,
  routes: SiteRoutes,
): NonNullable<ScreenResult["house"]> {
  if ("outside" in h || h.elevFt == null || h.slopeDeg == null || h.aspectDeg == null) return h;
  const scored = withDrivewayCost(
    ctx,
    { ...h, elevFt: h.elevFt, slopeDeg: h.slopeDeg, aspectDeg: h.aspectDeg },
    chooseDriveway(routes),
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
