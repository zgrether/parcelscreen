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
import { skyScore, spotSkyOf } from "./sky";
import type { PartialScreenResult, Site, SoilRow } from "./types";

const K = SCREEN_CONSTANTS.score;

/** The score fields a spot's measurements give back. */
export type SpotScores = Pick<Site, "quality" | "qGrade" | "q" | "c" | "costIdx" | "costTier" | "score">;

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
export function spotScores(R: PartialScreenResult, s: Spot): SpotScores {
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

/** Each ranked site with its scores derived; the stored order (rank) stands. */
export function derivedSites(R: PartialScreenResult): Site[] | undefined {
  return R.sites?.map((s) => {
    const d = spotScores(R, s);
    return { ...s, ...d, grade: grade(d.score) };
  });
}

/** The house with its scores derived; null or outside as stored. */
export function derivedHouse(R: PartialScreenResult): PartialScreenResult["house"] {
  const h = R.house;
  if (!h || "outside" in h) return h;
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
  return skyScore(spotSkyOf(sky));
}
