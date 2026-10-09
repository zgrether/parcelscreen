/**
 * Site quality (what the spot is) vs build cost (what it takes to use it), the existing-house assessment,
 * the rank step, and grades. Ported verbatim (proto scoreSite, assessHouse, the rank step, grade,
 * finalizeRanking's shelf distances).
 */
import { distance } from "@turf/turf";
import { compass, fmt } from "../format";
import { SCREEN_CONSTANTS } from "./config";
import { at, inGrid, llToRC, rcToLL } from "./dem";
import { inSfha, type FloodFeature } from "./flood";
import { nearestRoad, type RoadFeature } from "./roads";
import { frostCurve, type SiteSearch } from "./sites";
import type { SiteDriveway } from "./driveway";
import { bottomland, soilAt, type SoilLimits, type SoilUnit, type VettedBench } from "./soils";
import { horizonProfile, sunHours } from "./sun";
import type { Dem, ScreenResult, Site, SoilRow, UserConfig } from "./types";
import { lerp, M2FT, type LatLon } from "./util";

const K = SCREEN_CONSTANTS.score;
const SU = SCREEN_CONSTANTS.suitability;

type Grade = Site["grade"];
type Tier = Site["costTier"];

/** A ≥ 80, B ≥ 65, C ≥ 50, D ≥ 35, else F. */
export function grade(s: number): Grade {
  for (const [min, g] of K.grades) if (s >= min) return g;
  return "F";
}

/** $ < 20, $$ < 40, $$$ < 65, else $$$$ (on the unrounded cost). */
export function costTier(cost: number): Tier {
  for (const [max, t] of K.costTiers) if (cost < max) return t;
  return "$$$$";
}

/** Everything scoring needs beyond the site itself. */
export interface ScoreContext {
  dFine: Dem;
  dWide: Dem;
  valleyFloorFt: number;
  /** The sky score at the current evaluation point, if the sky step ran (prototype: R.sky.score, else 60). */
  skyScore: number | undefined;
  roads: RoadFeature[] | null;
  sfha: FloodFeature[] | null;
  units: SoilUnit[] | null;
  rows: SoilRow[] | null;
  cfg: UserConfig;
  /** NRCS's septic and foundation ratings without slope, by cokey (A3; soils step). Absent: NRCS's classes. */
  limits?: Map<string, SoilLimits> | null;
}

export interface SiteInput {
  acres: number;
  elevFt: number;
  aspectDeg: number;
  slopeDeg: number;
  /** The soil already found under the pin (soils step), else it's looked up. */
  soil?: SoilRow | null;
  compact?: boolean;
}

type Scored = Omit<
  Site,
  "rank" | "ll" | "acres" | "elevFt" | "aspectDeg" | "slopeDeg" | "compact" | "cell" | "grade"
>;

const rate = (r: string | null | undefined) => {
  r = (r || "").toLowerCase();
  return /not limited/.test(r)
    ? "fine"
    : /somewhat/.test(r)
      ? "workable"
      : /very limited/.test(r)
        ? "poor"
        : "unrated";
};

/**
 * Quality's parts and their weighted sum for a spot, before the flood veto (proto scoreSite). The December sun
 * share is measured by the caller. Shared with the driveway step, which re-costs every ranked site (A3) and
 * needs the unrounded quality back from a site's stored fields.
 */
export function qualityParts(
  ctx: Pick<ScoreContext, "valleyFloorFt" | "skyScore" | "cfg">,
  sunShare: number,
  b: Pick<SiteInput, "aspectDeg" | "slopeDeg" | "elevFt">,
): { aspectS: number; above: number; frostS: number; slopeS: number; skyS: number; quality: number } {
  const adiff = Math.min(
    Math.abs(b.aspectDeg - K.siteAspectTargetDeg),
    360 - Math.abs(b.aspectDeg - K.siteAspectTargetDeg),
  );
  const aspectS = b.slopeDeg < SU.flatBelowDeg ? 100 : lerp(adiff, SU.aspectCurve);
  const above = b.elevFt - ctx.valleyFloorFt;
  const frostS = lerp(above, frostCurve(SU.frostHouse, ctx.cfg.thermalMinFt));
  const slopeS = lerp(b.slopeDeg, SU.slopeHouse);
  const skyS = ctx.skyScore ?? K.skyIfMissing;
  const W = K.weights;
  const quality =
    W.sun * 100 * sunShare + W.aspect * aspectS + W.frost * frostS + W.slope * slopeS + W.sky * skyS;
  return { aspectS, above, frostS, slopeS, skyS, quality };
}

/** Rock by depth (A3): full points at ≤ rockDepthCm.full, none at ≥ rockDepthCm.none or with no bedrock reported. */
export function rockPoints(depthCm: number | null): number {
  if (depthCm == null) return 0;
  const { full, none } = K.rockDepthCm;
  return K.rock * Math.max(0, Math.min(1, (none - depthCm) / (none - full)));
}

/**
 * Driveway points from a routed cost estimate (A3, owner 2026-10-09): k · ln(1 + cost / c0), plus noRoute when no
 * route fits the grade limit (the least-steep route's cost is used) and easement when the route needs one, capped
 * at max. A site no route reaches at all takes max.
 */
export function drivewayPoints(dw: SiteDriveway): number {
  const C = K.drivewayCost;
  if (!dw.route) return C.max;
  const p =
    C.k * Math.log(1 + dw.route.cost.mid / C.c0) +
    (dw.legal ? 0 : C.noRoute) +
    (dw.route.needsEasement ? C.easement : 0);
  return Math.min(C.max, p);
}

/**
 * A scored spot re-costed with its routed driveway (A3): driveway points from the estimate, its length when a
 * route was found, and the cost, tier and score again from the unrounded quality. The rank and grade follow in
 * rerank.
 */
export function withDrivewayCost<T extends Scored & Pick<Site, "aspectDeg" | "slopeDeg" | "elevFt">>(
  ctx: Pick<ScoreContext, "valleyFloorFt" | "skyScore" | "cfg">,
  s: T,
  dw: SiteDriveway,
): T {
  const c = { ...s.c, driveway: drivewayPoints(dw) };
  const cost = Math.min(100, c.septic + c.foundation + c.rock + c.pad + c.driveway);
  const score = Math.round(K.overall.quality * storedQuality(ctx, s) + K.overall.cost * (100 - cost));
  return {
    ...s,
    c,
    ...(dw.route ? { driveFt: dw.route.metrics.lengthFt } : {}),
    costIdx: Math.round(cost),
    costTier: costTier(cost),
    score,
  };
}

/** A site's unrounded quality from its stored fields: qualityParts, then the flood veto. */
export function storedQuality(
  ctx: Pick<ScoreContext, "valleyFloorFt" | "skyScore" | "cfg">,
  s: Pick<Site, "sunH" | "daylightH" | "aspectDeg" | "slopeDeg" | "elevFt" | "flood">,
): number {
  const q = qualityParts(ctx, s.daylightH ? s.sunH / s.daylightH : 0, s).quality;
  return s.flood ? q * K.sfhaQualityFactor : q;
}

/** Quality, cost and overall score for a spot (proto scoreSite). */
export function scoreSite(ctx: ScoreContext, ll: LatLon, b: SiteInput): Scored {
  return scoreSiteDetailed(ctx, ll, b).scored;
}

/** The unrounded numbers behind a score, for checking how close a result sits to a rounding boundary. */
export interface RawScore {
  quality: number;
  cost: number;
  overall: number;
}

/** scoreSite, plus the unrounded quality, cost and overall it rounded. */
export function scoreSiteDetailed(
  ctx: ScoreContext,
  ll: LatLon,
  b: SiteInput,
): { scored: Scored; raw: RawScore } {
  const cfg = ctx.cfg;
  const why: string[] = [];
  // --- quality ---
  const [r0, c0] = llToRC(ctx.dWide, ll[0], ll[1]);
  const hz = horizonProfile(ctx.dWide, r0, c0, 5, 6000);
  const sun = sunHours(ll[0], hz, SCREEN_CONSTANTS.sun.decemberDoy, cfg.canopyDeg);
  const sunShare = sun.daylightH ? sun.directH / sun.daylightH : 0;
  const parts = qualityParts(ctx, sunShare, b);
  const { aspectS, above, frostS, slopeS, skyS } = parts;
  const q = {
    sun: Math.round(100 * sunShare),
    aspect: Math.round(aspectS),
    frost: Math.round(frostS),
    slope: Math.round(slopeS),
    sky: Math.round(skyS),
  };
  let quality = parts.quality;
  why.push(
    sunShare >= K.sunGoodShare
      ? `${sun.directH.toFixed(1)} h of December sun — good`
      : sunShare >= K.sunOkShare
        ? `${sun.directH.toFixed(1)} h of December sun — acceptable`
        : `only ${sun.directH.toFixed(1)} h of December sun`,
  );
  why.push(
    `${b.acres.toFixed(1)} ac, faces ${compass(b.aspectDeg)}, ${b.slopeDeg.toFixed(1)}° slope, ${Math.round(above)} ft above the valley floor`,
  );
  // --- cost ---
  const comp = b.soil || soilAt(ctx.units, ctx.rows, ll);
  // A3: NRCS's ratings without the map unit's slope when the soils step has them (else NRCS's own classes).
  const lim = comp && ctx.limits ? ctx.limits.get(String(comp.cokey)) : undefined;
  const sep = lim?.septic ?? rate(comp && (comp.septic || comp.engstafdcd)),
    dw = lim?.foundation ?? rate(comp && comp.engdwobdcd);
  const depthCm = comp && comp.brockdepmin != null && comp.brockdepmin !== "" ? +comp.brockdepmin : null;
  // The wording keeps the user's shallow-bedrock setting; the points scale with depth (A3).
  const rock = depthCm != null && depthCm < cfg.shallowBedrockCm;
  const c = {
    septic: K.septic[sep],
    foundation: K.foundation[dw],
    rock: rockPoints(depthCm),
    pad: b.compact ? K.compactPad : lerp(b.slopeDeg, K.pad),
    driveway: 0,
  };
  if (comp)
    why.push(
      `${comp.compname}: septic ${sep === "fine" ? "should work conventionally" : sep === "workable" ? "needs an engineered design" : sep === "poor" ? "rated very limited — alternative system" : "unrated"}${dw === "poor" ? ", foundation rated very limited" : ""}${rock ? ", rock near the surface" : ""}`,
    );
  else why.push("no soil polygon under this spot");
  const road: Partial<Pick<Scored, "roadGrade" | "roadRunFt" | "roadName" | "driveFt">> = {};
  const nr = ctx.roads && ctx.roads.length ? nearestRoad(ctx.roads, ll) : null;
  if (nr && nr.distM > SCREEN_CONSTANTS.roads.minDistM) {
    const [rr, rc] = llToRC(ctx.dWide, nr.ll[0], nr.ll[1]);
    const zr = at(ctx.dWide, rr, rc);
    const [br, bc] = llToRC(ctx.dWide, ll[0], ll[1]);
    const zb = at(ctx.dWide, br, bc);
    if (!Number.isNaN(zr) && !Number.isNaN(zb)) {
      const g = (Math.abs(zb - zr) / nr.distM) * 100,
        runFt = nr.distM * M2FT;
      const needFt = Math.max(runFt, (Math.abs(zb - zr) * M2FT) / (cfg.roadMaxGradePct / 100));
      Object.assign(road, { roadGrade: g, roadRunFt: runFt, roadName: nr.name, driveFt: needFt });
      c.driveway =
        Math.min(K.drivewayMax, needFt / K.drivewayFtPerPoint) +
        (g > cfg.roadMaxGradePct ? K.drivewayOverGrade : 0);
      why.push(
        `${Math.round(runFt)} ft to ${nr.name} at ${g.toFixed(0)}% straight-line${g > cfg.roadMaxGradePct ? ` — about ${Math.round(needFt)} ft of driveway with switchbacks` : ""}`,
      );
    }
  }
  const cost = Math.min(100, c.septic + c.foundation + c.rock + c.pad + c.driveway);
  // --- flood: quality veto ---
  let flood: true | undefined;
  if (inSfha(ctx.sfha, ll)) {
    quality *= K.sfhaQualityFactor;
    why.push("inside a FEMA flood zone");
    flood = true;
  }
  const overall = K.overall.quality * quality + K.overall.cost * (100 - cost);
  const scored: Scored = {
    score: Math.round(overall),
    why,
    sunH: sun.directH,
    daylightH: sun.daylightH,
    q,
    soil: comp ? comp.compname : null,
    c,
    costIdx: Math.round(cost),
    costTier: costTier(cost),
    quality: Math.round(quality),
    qGrade: grade(quality),
    ...road,
    ...(flood ? { flood } : {}),
  };
  return { scored, raw: { quality, cost, overall } };
}

/** The rank step (proto L1147–1171): open house sites and compact shelves, scored and ordered. */
export function rankSites(
  ctx: ScoreContext,
  benches: (VettedBench | (SiteSearch["benches"][number] & { soil?: undefined; veto?: undefined }))[],
  shelves: SiteSearch["shelves"],
): { sites: Site[]; excluded: NonNullable<ScreenResult["excluded"]> } {
  const pin = (rc: [number, number]) => rcToLL(ctx.dFine, rc[0], rc[1]);
  const excluded = benches
    .filter((b) => b.veto)
    .map((b) => ({ acres: b.acres, ll: pin(b.rc), why: b.veto! }));
  const sites: Site[] = [];
  for (const b of benches.filter((b) => !b.veto).slice(0, SCREEN_CONSTANTS.sites.maxRankedBenches)) {
    const ll = pin(b.rc);
    const s = scoreSite(ctx, ll, {
      acres: b.acres,
      elevFt: b.elevFt,
      aspectDeg: b.aspectDeg,
      slopeDeg: b.slopeDeg,
      soil: b.soil,
    });
    sites.push({
      rank: 0,
      ll,
      acres: b.acres,
      elevFt: b.elevFt,
      aspectDeg: b.aspectDeg,
      slopeDeg: b.slopeDeg,
      cell: { score: b.score, slope: b.slopeScore, aspect: b.aspectScore, thermal: b.thermalScore },
      ...s,
      grade: "F",
    });
  }
  // Compact sites: pad-sized shelves, ranked with a cut-pad penalty.
  for (const sh of shelves
    .filter((s) => s.acres >= ctx.cfg.compactMinAcres)
    .slice(0, SCREEN_CONSTANTS.sites.maxCompact)) {
    const ll = pin(sh.rc);
    const soil = soilAt(ctx.units, ctx.rows, ll);
    if (soil && bottomland(soil)) continue;
    const s = scoreSite(ctx, ll, {
      acres: sh.acres,
      elevFt: sh.elevFt,
      aspectDeg: sh.aspectDeg,
      slopeDeg: sh.slopeDeg,
      soil,
      compact: true,
    });
    s.why.unshift(
      `compact site: ${sh.acres.toFixed(2)} ac shelf — needs a cut pad and probably a retaining wall`,
    );
    sites.push({
      rank: 0,
      ll,
      acres: sh.acres,
      elevFt: sh.elevFt,
      aspectDeg: sh.aspectDeg,
      slopeDeg: sh.slopeDeg,
      compact: true,
      cell: { score: sh.score, slope: sh.slopeScore, aspect: sh.aspectScore, thermal: sh.thermalScore },
      ...s,
      grade: "F",
    });
  }
  return { sites: rerank(sites), excluded };
}

/** Sort by overall score (stable) and renumber and regrade. */
export function rerank(sites: Site[]): Site[] {
  return [...sites]
    .sort((a, b) => b.score - a.score)
    .map((s, i) => ({ ...s, rank: i + 1, grade: grade(s.score) }));
}

/** Shelf distance and drop from the current site #1 (proto finalizeRanking). */
export function shelvesFromBest(
  shelves: NonNullable<ScreenResult["shelves"]>,
  sites: Site[],
): NonNullable<ScreenResult["shelves"]> {
  const top = sites[0];
  if (!top) return shelves;
  return shelves.map((sh) => ({
    ...sh,
    distFt: distance([top.ll[1], top.ll[0]], [sh.ll[1], sh.ll[0]], { units: "feet" }),
    dropFt: sh.elevFt - top.elevFt,
  }));
}

/** The existing house, scored by the same rubric plus the checks only a known house has (proto assessHouse). */
export function assessHouse(
  ctx: ScoreContext & {
    slope: Float32Array;
    aspect: Float32Array;
    inside: Uint8Array;
    search: SiteSearch | null;
  },
  house: LatLon,
): NonNullable<ScreenResult["house"]> {
  const [r, c] = llToRC(ctx.dFine, house[0], house[1]);
  if (!inGrid(ctx.dFine, r, c)) return { ll: house, outside: true };
  const i = r * ctx.dFine.w + c,
    elevFt = ctx.dFine.z[i]! * M2FT,
    slopeDeg = ctx.slope[i]!,
    aspectDeg = ctx.aspect[i]!;
  const surf = ctx.search?.surfaces;
  const nanToNull = (v: number) => (Number.isNaN(v) ? null : v);
  // Outside the parcel the house surface is NaN (no score); the factor parts are still meaningful.
  const cell = surf
    ? {
        score: nanToNull(surf.house[i]!),
        slope: surf.parts[i * 3]!,
        aspect: surf.parts[i * 3 + 1]!,
        thermal: surf.parts[i * 3 + 2]!,
      }
    : null;
  const lab = ctx.search ? ctx.search.label[i]! : 0;
  const bench = lab > 0 ? ctx.search!.benches.find((b) => b.id === lab) : undefined;
  const soil = soilAt(ctx.units, ctx.rows, house),
    veto = soil ? bottomland(soil) : null;
  const s = scoreSite(ctx, house, {
    acres: bench ? bench.acres : SCREEN_CONSTANTS.score.houseDefaultAcres,
    elevFt,
    aspectDeg,
    slopeDeg,
    soil,
  });
  return {
    ll: house,
    inside: ctx.inside[i] === 1,
    elevFt: nanToNull(elevFt),
    slopeDeg: nanToNull(slopeDeg),
    aspectDeg: nanToNull(aspectDeg),
    onBench: !!bench,
    benchAcres: bench ? bench.acres : null,
    veto,
    inSFHA: inSfha(ctx.sfha, house),
    cell,
    ...s,
    grade: grade(s.score),
  };
}

type Route = NonNullable<ScreenResult["driveway"]>["routes"][number];

/** The routed-driveway line (the prototype's, for site #1): length, grade cap, switchbacks and cost range. */
export function routedLine(rt: Pick<Route, "metrics" | "maxGrade" | "cost">): string {
  return `routed driveway: ${Math.round(rt.metrics.lengthFt)} ft at ≤${(rt.maxGrade * 100).toFixed(0)}%, ${rt.metrics.switchbacks} switchback${rt.metrics.switchbacks === 1 ? "" : "s"}, ~$${fmt(rt.cost.low / 1000)}–${fmt(rt.cost.high / 1000)}k`;
}

/**
 * Site #1's reasons with its routed driveway in place of the straight-line line (the prototype's driveway step).
 * Since A3 the driveway points and score come from withDrivewayCost, for every ranked site; this keeps #1's
 * wording as it was.
 */
export function withRoutedWhy(site: Site, rt: Route): Site {
  return {
    ...site,
    why: [...site.why.filter((x) => !/ft to .* at .*straight-line/.test(x)), routedLine(rt)],
  };
}

/**
 * Any other ranked site with a route within the grade limit: the same line, appended after its own (A3b, owner
 * 2026-10-09; rule 7: added, nothing replaced). A least-steep route gets no line: its "≤ N%" would read as legal.
 */
export function withRoutedLineAppended(site: Site, dw: SiteDriveway): Site {
  return dw.legal && dw.route ? { ...site, why: [...site.why, routedLine(dw.route)] } : site;
}
