/**
 * What the display derives from a stored screen's measurements (step 1 plan §3.3; schema v8): each site's and the
 * house's scores, and the sky score, by the same pure functions the engine ranks with (score.ts, sky.ts), so the
 * display and the ranking can't drift. These derivations are engine code (phase-0.md §9.44): changing one is a
 * numbers change, declared, with an ENGINE_VERSION bump; test/fixtures/<slug>/grades-v7.json is the guard.
 *
 * In PR 2 the stored fields still exist beside these; PR 3 removes them (the v8 cut).
 */
import { SCREEN_CONSTANTS } from "./config";
import {
  costParts,
  costTier,
  drivewayPointsFrom,
  grade,
  overallScore,
  qualityParts,
  skyPart,
  soilRatings,
  straightDrivewayPoints,
} from "./score";
import { flagsOf, verdictOf } from "./flags";
import { skyScore, spotSkyOf } from "./sky";
import type {
  Flag,
  HouseAssessed,
  PartialScreenResult,
  ScoredHouse,
  ScoredSite,
  ScreenResult,
  Site,
  SoilRow,
  SpotScores,
  Verdict,
} from "./types";

const K = SCREEN_CONSTANTS.score;

/** What a scored spot (a site, or the house) stores that its scores derive from. */
export type Spot = Pick<Site, "sunH" | "daylightH" | "aspectDeg" | "slopeDeg" | "elevFt" | "soilKey"> &
  Partial<Pick<Site, "flood" | "compact" | "sky" | "driveway" | "driveFt" | "roadGrade">>;

/** The context a spot's scores need, from the result: the valley floor, the run's thresholds, the soils. */
function contextOf(R: PartialScreenResult) {
  const limits = new Map((R.soilLimits ?? []).map((l) => [l.cokey, l]));
  const rows: readonly SoilRow[] = R.soils ?? [];
  return {
    valleyFloorFt: R.terrain?.valleyFloorFt ?? NaN,
    cfg: { thermalMinFt: R.params.thermalMinFt },
    soilOf: (key: string | null) => (key === null ? null : (rows.find((r) => r.cokey === key) ?? null)),
    limitOf: (key: string | null) => (key === null || !R.soilLimits ? undefined : limits.get(key)),
    roadMaxGradePct: R.params.roadMaxGradePct,
  };
}

/**
 * A spot's scores from its measurements, as scoreSiteDetailed and withDrivewayCost compute them: quality from the
 * December sun share, facing, frost position, slope and the sky read there; cost from the soil's ratings, bedrock,
 * the pad and the driveway (its chosen route's facts once the driveway step has run, the straight line to the road
 * before it, the maximum when no route reaches it); the overall score from both.
 */
export function spotScores(R: PartialScreenResult, s: Spot): Omit<SpotScores, "grade"> {
  const ctx = contextOf(R);
  const sunShare = s.daylightH ? s.sunH / s.daylightH : 0;
  const skyS = skyPart(s.sky);
  const parts = qualityParts(ctx, sunShare, s, skyS);
  let quality = parts.quality;
  if (s.flood) quality *= K.sfhaQualityFactor;
  const q = {
    sun: Math.round(100 * sunShare),
    aspect: Math.round(parts.aspectS),
    frost: Math.round(parts.frostS),
    slope: Math.round(parts.slopeS),
    sky: Math.round(skyS),
  };
  const comp = ctx.soilOf(s.soilKey);
  const { sep, dw, depthCm } = soilRatings(comp, ctx.limitOf(s.soilKey));
  const driveway =
    s.driveway !== undefined
      ? drivewayPointsFrom(s.driveway)
      : s.roadGrade !== undefined && s.driveFt !== undefined
        ? straightDrivewayPoints(s.roadGrade, s.driveFt, ctx.roadMaxGradePct)
        : 0;
  const c = { ...costParts(sep, dw, depthCm, !!s.compact, s.slopeDeg), driveway };
  const cost = Math.min(100, c.septic + c.foundation + c.rock + c.pad + c.driveway);
  return {
    quality: Math.round(quality),
    qGrade: grade(quality),
    q,
    c,
    costIdx: Math.round(cost),
    costTier: costTier(cost),
    score: Math.round(overallScore(quality, cost)),
  };
}

/** Whether a result still carries its stored grades: a v7 result, or a prototype golden kept with them (tests). */
const carriesGrades = (R: PartialScreenResult): boolean => "verdict" in R || "score" in (R.sites?.[0] ?? {});

/** Each ranked site with its scores derived; the stored order (rank) stands. A result kept with its grades reads them. */
export function derivedSites(R: PartialScreenResult): ScoredSite[] | undefined {
  if (carriesGrades(R)) return R.sites as ScoredSite[] | undefined;
  return R.sites?.map((s) => {
    const d = spotScores(R, s);
    return { ...s, ...d, grade: grade(d.score) };
  });
}

/** The house with its scores derived; null or outside as stored. */
export function derivedHouse(
  R: PartialScreenResult,
): ScoredHouse | { ll: Site["ll"]; outside: true } | null | undefined {
  const h = R.house;
  if (!h || "outside" in h) return h;
  if (carriesGrades(R)) return h as ScoredHouse;
  const d = spotScores(R, {
    ...h,
    elevFt: h.elevFt ?? NaN,
    slopeDeg: h.slopeDeg ?? NaN,
    aspectDeg: h.aspectDeg ?? NaN,
  });
  return { ...h, ...d, grade: grade(d.score) };
}

/** The sky score at the focus, from the stored reading (mag, the brightest southern dome, the core's clearance). */
export function skyScoreOf(sky: NonNullable<PartialScreenResult["sky"]>): number {
  if ("score" in sky) return (sky as { score: number }).score;
  return skyScore(spotSkyOf(sky));
}

/** Everything the display derives from a result, at once: the report blocks, Copy summary and the tools read this. */
export interface Derived {
  sites: ScoredSite[] | undefined;
  house: ScoredHouse | { ll: Site["ll"]; outside: true } | null | undefined;
  sky: (NonNullable<ScreenResult["sky"]> & { score: number }) | undefined;
  flags: Flag[];
  verdict: Verdict;
}

export function derived(R: PartialScreenResult): Derived {
  const flags = flagsOf(R);
  return {
    sites: derivedSites(R),
    house: derivedHouse(R),
    sky: R.sky ? { ...R.sky, score: skyScoreOf(R.sky) } : undefined,
    flags,
    verdict: verdictOf(flags),
  };
}

/**
 * A result with its derived grades beside its measurements: the shape the study tools and the prototype diff read.
 * A result that still carries stored grades (a v7 expected.json from an older commit, or a prototype golden kept
 * with them) is returned as it is, so a before/after comparison reads each side's own numbers.
 */
export type ScoredResult = Omit<ScreenResult, "sites" | "house" | "sky"> & {
  sites?: ScoredSite[];
  house?: Derived["house"];
  sky?: Derived["sky"];
  flags: Flag[];
  verdict: Verdict;
};

export function scored(R: ScreenResult): ScoredResult {
  if ("verdict" in R) return R as unknown as ScoredResult;
  const x = derived(R);
  return {
    ...R,
    ...(R.sites ? { sites: x.sites } : {}),
    ...(R.house !== undefined ? { house: x.house } : {}),
    ...(R.sky ? { sky: x.sky } : {}),
    flags: x.flags,
    verdict: x.verdict,
  } as ScoredResult;
}

/** A scored site as the saved screen holds it (v8): its measurements and reasons, without the scores. */
export function storedSite<T extends SpotScores>(s: T): Omit<T, keyof SpotScores> {
  const {
    score: _s,
    grade: _g,
    quality: _q,
    qGrade: _qg,
    q: _qp,
    c: _c,
    costIdx: _ci,
    costTier: _ct,
    ...rest
  } = s;
  return rest;
}

/** The house as the saved screen holds it (v8). */
export function storedHouse(
  h: ScoredHouse | { ll: Site["ll"]; outside: true } | null | undefined,
): HouseAssessed | { ll: Site["ll"]; outside: true } | null | undefined {
  return h && !("outside" in h) ? storedSite(h) : h;
}
