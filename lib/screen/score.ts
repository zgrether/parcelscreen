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
import { siteFit } from "./footprint";
import { frostCurve, type SiteSearch } from "./sites";
import { overLimitSpans, type PracticalAlternatives, type SiteDriveway, type SiteRoutes } from "./driveway";
import { NEEDS_EASEMENT } from "./routeLabel";
import { bottomland, soilAt, type SoilLimits, type SoilUnit, type VettedBench } from "./soils";
import { horizonProfile, sunHours, type HorizonPoint } from "./sun";
import type { Dem, Practical, ScreenResult, Site, SoilRow, UserConfig } from "./types";
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
  /**
   * The sky score at a spot, read with the skyline its sun is measured on (follow-up 58): every site and the house
   * get their own, so none depends on where the sky step read it or on a house being marked. Absent, or undefined
   * for a spot, when the sky step didn't run: the prototype's 60. (The prototype gave every spot R.sky.score.)
   */
  skyAt?: ((ll: LatLon, horizon: HorizonPoint[]) => Promise<number | undefined>) | undefined;
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
  | "rank"
  | "ll"
  | "acres"
  | "elevFt"
  | "aspectDeg"
  | "slopeDeg"
  | "compact"
  | "cell"
  | "grade"
  | "practical"
  // The site's own ground, not its score (v4, VR3a).
  | "fit"
  | "gentleNearAc"
  | "sfhaOnSite"
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
  ctx: Pick<ScoreContext, "valleyFloorFt" | "cfg">,
  sunShare: number,
  b: Pick<SiteInput, "aspectDeg" | "slopeDeg" | "elevFt">,
  skyScore: number | undefined,
): { aspectS: number; above: number; frostS: number; slopeS: number; skyS: number; quality: number } {
  const adiff = Math.min(
    Math.abs(b.aspectDeg - K.siteAspectTargetDeg),
    360 - Math.abs(b.aspectDeg - K.siteAspectTargetDeg),
  );
  const aspectS = b.slopeDeg < SU.flatBelowDeg ? 100 : lerp(adiff, SU.aspectCurve);
  const above = b.elevFt - ctx.valleyFloorFt;
  const frostS = lerp(above, frostCurve(SU.frostHouse, ctx.cfg.thermalMinFt));
  const slopeS = lerp(b.slopeDeg, SU.slopeHouse);
  const skyS = skyScore ?? K.skyIfMissing;
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
 * Driveway points from a routed cost estimate (A3, owner 2026-10-09): k · ln(1 + cost / c0), plus the over-limit
 * term when no route fits the grade limit (the least-steep route's cost is used) and easement when the route needs
 * one, capped at max. A site no route reaches at all takes max.
 */
export function drivewayPoints(dw: SiteDriveway): number {
  const C = K.drivewayCost;
  if (!dw.route) return C.max;
  const p =
    C.k * Math.log(1 + dw.route.cost.mid / C.c0) +
    overLimitPoints(dw) +
    (dw.route.needsEasement ? C.easement : 0);
  return Math.min(C.max, p);
}

/**
 * The over-limit term for a driveway (A4): none within the limit, else overLimitTerm of its grade over 30 m (A4b,
 * owner 2026-10-10; it was the whole-percent cap the least-steep search needed). An existing drive the route starts
 * from (follow-up 34, owner #116) counts like any section of it, on its raw ground: the steeper of the two decides.
 */
export function overLimitPoints(dw: SiteDriveway): number {
  const rt = dw.route;
  if (!rt) return 0;
  const existing = rt.existing ? overLimitTerm(rt.existing.maxGradePct, rt.existing.limitPct) : 0;
  if (dw.legal || !("limitPct" in rt)) return existing;
  // A designed alignment reads its design grade, not the ungraded ground (owner, option C; follow-up 48).
  return Math.max(existing, overLimitTerm(dw.designPct ?? rt.metrics.maxGradePct, rt.limitPct));
}

/**
 * The warning for an existing drive steeper than the veto (owner's wording, #116): it isn't vetoed, since it's a real
 * road; the route is kept and the warning shown. Null when it isn't that steep.
 */
export function existingSteepLine(existing: NonNullable<Route["existing"]> | null): string | null {
  if (!existing || existing.maxGradePct <= existing.vetoPct) return null;
  return `The existing drive is steeper than your limit (${Math.round(existing.avgGradePct)}% avg, ${Math.round(existing.maxGradePct)}% steepest over 30 m on raw ground; a built road grades out 1–4 points)`;
}

/** A candidate's grade over the headline window (30 m): what the over-limit term and the veto read (A4b). */
export const grade30 = (dw: SiteDriveway): number => dw.route?.metrics.maxGradePct ?? Infinity;

/**
 * The over-limit term for a route needing `neededPct` under a `limitPct` limit (A4, owner #88 review):
 * overLimitPtsPerPct a percent over the limit up to practicalMaxPct (or the limit, if higher), then straight up to
 * overLimitMaxPts at overLimitMaxAtPct and above. Under a 10% limit: 11% +1, 15% +5, 18% +14, 20% and over +20.
 */
export function overLimitTerm(neededPct: number, limitPct: number): number {
  const D = SCREEN_CONSTANTS.driveway;
  if (neededPct <= limitPct) return 0;
  const knee = Math.max(limitPct, D.practicalMaxPct);
  if (neededPct <= knee) return (neededPct - limitPct) * D.overLimitPtsPerPct;
  if (neededPct >= D.overLimitMaxAtPct || knee >= D.overLimitMaxAtPct) return D.overLimitMaxPts;
  const atKnee = (knee - limitPct) * D.overLimitPtsPerPct;
  return atKnee + ((neededPct - knee) / (D.overLimitMaxAtPct - knee)) * (D.overLimitMaxPts - atKnee);
}

/**
 * The driveway a site is scored on (A4, owner 2026-10-09): of its two candidates, the one with fewer points: the
 * route within the limit (with the easement term when it leaves the parcel) or the one kept to the parcel (with
 * the over-limit term when it needs more than the limit). A tie goes to the route within the limit.
 *
 * The veto (A4b, owner 2026-10-10): a candidate steeper than `vetoPct` over 30 m (the ground under it) can't be
 * chosen, whatever its cost. When every candidate is, the least steep is returned, marked `noPractical`.
 *
 * A route from a drawn line's end (`drawn`, follow-up 34, owner #116) is chosen when it has fewer points than that, or
 * when that is vetoed. The veto reads only its new part: the existing drive is a real road, warned of, never vetoed.
 */
export function chooseDriveway(r: SiteRoutes, vetoPct = Infinity): SiteDriveway {
  const front = chooseFrontage(r, vetoPct);
  const d = r.drawn;
  if (!d?.route || grade30(d) > vetoPct) return front;
  if (!front.route || front.noPractical) return d;
  return drivewayPoints(d) < drivewayPoints(front) ? d : front;
}

/** chooseDriveway between the frontage's two candidates. */
function chooseFrontage(r: SiteRoutes, vetoPct: number): SiteDriveway {
  const none: SiteDriveway = { route: null, legal: false, entranceIndex: null };
  const all = [r.withinLimit, r.onParcel].filter(
    (d, i, a): d is SiteDriveway => !!d?.route && a.indexOf(d) === i,
  );
  if (!all.length) return r.withinLimit ?? r.onParcel ?? none;
  const ok = all.filter((d) => grade30(d) <= vetoPct);
  if (!ok.length) return { ...all.reduce((a, b) => (grade30(b) < grade30(a) ? b : a)), noPractical: true };
  const { withinLimit: w, onParcel: p } = r;
  if (w && ok.includes(w)) return p && ok.includes(p) && drivewayPoints(p) < drivewayPoints(w) ? p : w;
  return ok[0]!;
}

/** How a vetoed target's sentence starts; the report card's Easement gate reads it from the stored note (VR2). */
export const NO_PRACTICAL_ROUTE = "No practical route found";

/** The sentence for a target whose every driveway candidate is vetoed (A4b; owner's wording, "No practical route found"). */
export function noPracticalLine(dw: SiteDriveway, vetoPct: number): string {
  return `${NO_PRACTICAL_ROUTE}: every driveway route is steeper than ${vetoPct}% over 30 m; the least steep (${grade30(dw).toFixed(0)}% over 30 m) is shown.`;
}

/**
 * "No practical drive" (owner, #99 decisions, 2026-10-11): the driveway a target is scored on costs more than
 * impracticalShareOfReadyToBuild of the Settings' ready-to-build budget. Applied after the quantity corrections.
 */
export function isImpractical(dw: SiteDriveway, readyToBuild: number): boolean {
  return (
    !!dw.route && dw.route.cost.mid > SCREEN_CONSTANTS.driveway.impracticalShareOfReadyToBuild * readyToBuild
  );
}

/** The alternatives the veto allows: a candidate steeper than `vetoPct` over 30 m is dropped (A4b). */
export function withoutVetoed(alt: PracticalAlternatives, vetoPct: number): PracticalAlternatives {
  const ok = (d: SiteDriveway | null) => (d?.route && grade30(d) <= vetoPct ? d : null);
  return { steeper: ok(alt.steeper), easement: ok(alt.easement) };
}

/**
 * The driveway a site is scored on (owner, #99 decisions): when its chosen route is impractical, the alternative with
 * fewer points (as chooseDriveway weighs its two candidates; a tie goes to the steeper route kept to the parcel), so
 * the ranking isn't driven by an alignment nobody would build. Without alternatives, the chosen route stands.
 */
export function practicalDriveway(
  chosen: SiteDriveway,
  alt: PracticalAlternatives | null | undefined,
): SiteDriveway {
  const c = [alt?.steeper, alt?.easement].filter((d): d is SiteDriveway => !!d?.route);
  return c.length ? c.reduce((a, b) => (drivewayPoints(b) < drivewayPoints(a) ? b : a)) : chosen;
}

const k$ = (c: { low: number; high: number }) => `$${fmt(c.low / 1000)}–${fmt(c.high / 1000)}k`;

/**
 * A "no practical drive" target's outcome, as stored (v3, B2a): the chosen route's cost, the alternatives the veto
 * allows, and the one it's scored on.
 */
export function practicalOutcome(
  chosen: SiteDriveway,
  alt: PracticalAlternatives,
  limitPct: number,
  readyToBuild: number,
): Practical {
  const D = SCREEN_CONSTANTS.driveway;
  const summary = (d: SiteDriveway | null, paved: boolean): Practical["steeper"] => {
    const r = d?.route;
    if (!r) return null;
    const pavedFt = paved
      ? overLimitSpans(r.profile, D.paveAbovePct / 100).reduce((t, [a, b]) => t + (b - a), 0) * M2FT
      : 0;
    return { lengthFt: r.metrics.lengthFt, switchbacks: r.metrics.switchbacks, cost: r.cost, pavedFt };
  };
  const pick = practicalDriveway(chosen, alt);
  return {
    limitPct,
    steeperPct: D.practicalMaxPct,
    readyToBuild,
    share: D.impracticalShareOfReadyToBuild,
    cost: chosen.route!.cost,
    steeper: summary(alt.steeper, true),
    easement: summary(alt.easement, false),
    scoredOn: pick === chosen ? null : pick === alt.steeper ? "steeper" : "easement",
  };
}

/**
 * The paragraph a "no practical drive" target's driveway section leads with, and its site's reason (owner's wording,
 * #99 decisions): the limit, why, then the alternatives the veto allows. From the stored outcome alone, so a kept
 * result reads as it was screened.
 */
export function impracticalLine(p: Practical): string {
  const lines = [
    `No practical drive at your ${fmt(p.limitPct)}% limit: the best route found costs about ${k$(p.cost)}, ` +
      `more than ${Math.round(p.share * 100)}% of your $${fmt(p.readyToBuild / 1000)}k ` +
      `ready-to-build budget.`,
  ];
  const s = p.steeper;
  if (s) {
    const n = s.switchbacks;
    lines.push(
      `At ${p.steeperPct}%: ${fmt(s.lengthFt)} ft on your land, ${n} switchback${n === 1 ? "" : "s"}, ` +
        `about ${k$(s.cost)} of gravel work${s.pavedFt >= 1 ? `, paving on ~${fmt(s.pavedFt)} ft (cost TBD)` : ""}; ` +
        `county limit to check (follow-up 46).`,
    );
  }
  const e = p.easement;
  if (e)
    lines.push(
      `Within ${fmt(p.limitPct)}% via neighbouring land (${NEEDS_EASEMENT}): ${fmt(e.lengthFt)} ft, about ${k$(e.cost)}.`,
    );
  if (p.scoredOn)
    lines.push(
      p.scoredOn === "steeper"
        ? `Scored on the route at ${p.steeperPct}%.`
        : "Scored on the route through the neighbours.",
    );
  if (!s && !e)
    lines.push(
      p.steeperPct > p.limitPct
        ? `No route at ${p.steeperPct}% on your land, or within ${fmt(p.limitPct)}% through the neighbours, was found.`
        : `No route within ${fmt(p.limitPct)}% through the neighbours was found.`,
    );
  return lines.join(" ");
}

/**
 * A scored spot re-costed with its routed driveway (A3): driveway points from the estimate, its length when a
 * route was found, and the cost, tier and score again from the unrounded quality. The rank and grade follow in
 * rerank.
 */
export function withDrivewayCost<T extends Scored & Pick<Site, "aspectDeg" | "slopeDeg" | "elevFt">>(
  ctx: Pick<ScoreContext, "valleyFloorFt" | "cfg">,
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

/**
 * A site's unrounded quality from its stored fields: qualityParts, then the flood veto. Its stored sky part is exact:
 * the sky score is a whole number.
 */
export function storedQuality(
  ctx: Pick<ScoreContext, "valleyFloorFt" | "cfg">,
  s: Pick<Site, "sunH" | "daylightH" | "aspectDeg" | "slopeDeg" | "elevFt" | "flood" | "q">,
): number {
  const q = qualityParts(ctx, s.daylightH ? s.sunH / s.daylightH : 0, s, s.q.sky).quality;
  return s.flood ? q * K.sfhaQualityFactor : q;
}

/** Quality, cost and overall score for a spot (proto scoreSite). */
export async function scoreSite(ctx: ScoreContext, ll: LatLon, b: SiteInput): Promise<Scored> {
  return (await scoreSiteDetailed(ctx, ll, b)).scored;
}

/** The unrounded numbers behind a score, for checking how close a result sits to a rounding boundary. */
export interface RawScore {
  quality: number;
  cost: number;
  overall: number;
}

/** scoreSite, plus the unrounded quality, cost and overall it rounded. */
export async function scoreSiteDetailed(
  ctx: ScoreContext,
  ll: LatLon,
  b: SiteInput,
): Promise<{ scored: Scored; raw: RawScore }> {
  const cfg = ctx.cfg;
  const why: string[] = [];
  // --- quality ---
  const [r0, c0] = llToRC(ctx.dWide, ll[0], ll[1]);
  const hz = horizonProfile(ctx.dWide, r0, c0, 5, 6000);
  const sun = sunHours(ll[0], hz, SCREEN_CONSTANTS.sun.decemberDoy, cfg.canopyDeg);
  const sunShare = sun.daylightH ? sun.directH / sun.daylightH : 0;
  // The sky read here, on the same skyline (follow-up 58).
  const parts = qualityParts(ctx, sunShare, b, await ctx.skyAt?.(ll, hz));
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

/** The ground a site sits on, beyond its score (v4, VR3a): the slope and parcel rasters, and the flood zones. */
export interface SiteGround {
  slope: Float32Array;
  inside: Uint8Array;
  /** sfhaMask (flood.ts) on the fine DEM. */
  sfha: Uint8Array;
}

/** A site's fit for the build, its gentle ground, and whether a flood zone touches it (§5.4; owner, #109 review). */
function onTheGround(
  ctx: ScoreContext,
  ground: SiteGround,
  b: { cells: readonly number[]; acres: number; rc: [number, number] },
): Pick<Site, "fit" | "gentleNearAc" | "sfhaOnSite"> {
  const f = siteFit(ctx.dFine, b, ground.slope, ground.inside);
  return { fit: f.fit, gentleNearAc: f.gentleNearAc, sfhaOnSite: b.cells.some((i) => ground.sfha[i] === 1) };
}

/** The rank step (proto L1147–1171): open house sites and compact shelves, scored and ordered. */
export async function rankSites(
  ctx: ScoreContext,
  benches: (VettedBench | (SiteSearch["benches"][number] & { soil?: undefined; veto?: undefined }))[],
  shelves: SiteSearch["shelves"],
  ground: SiteGround,
): Promise<{ sites: Site[]; excluded: NonNullable<ScreenResult["excluded"]> }> {
  const pin = (rc: [number, number]) => rcToLL(ctx.dFine, rc[0], rc[1]);
  const excluded = benches
    .filter((b) => b.veto)
    .map((b) => ({ acres: b.acres, ll: pin(b.rc), why: b.veto! }));
  const sites: Site[] = [];
  for (const b of benches.filter((b) => !b.veto).slice(0, SCREEN_CONSTANTS.sites.maxRankedBenches)) {
    const ll = pin(b.rc);
    const s = await scoreSite(ctx, ll, {
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
      practical: null,
      ...onTheGround(ctx, ground, b),
    });
  }
  // Compact sites: pad-sized shelves, ranked with a cut-pad penalty.
  for (const sh of shelves
    .filter((s) => s.acres >= ctx.cfg.compactMinAcres)
    .slice(0, SCREEN_CONSTANTS.sites.maxCompact)) {
    const ll = pin(sh.rc);
    const soil = soilAt(ctx.units, ctx.rows, ll);
    if (soil && bottomland(soil)) continue;
    const s = await scoreSite(ctx, ll, {
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
      practical: null,
      ...onTheGround(ctx, ground, sh),
    });
  }
  return { sites: rerank(sites), excluded };
}

const FIT_ORDER: Record<Site["fit"], number> = { fits: 0, "house only": 1, "too small": 2 };

/**
 * Sort by fit, then overall score (whole points: a site's score is stored rounded), then a tie-break that never depends on the order the sites came in (owner, #142):
 * the larger site first, then the one further north, then further west. Renumber and regrade.
 */
export function rerank(sites: Site[]): Site[] {
  return (
    [...sites]
      // A site the build doesn't fit on can't be #1 (owner, #94 review; value-ranking.md §5.4 (a)): the ones that fit
      // first, in their own order, then the rest.
      .sort(
        (a, b) =>
          FIT_ORDER[a.fit] - FIT_ORDER[b.fit] ||
          b.score - a.score ||
          b.acres - a.acres ||
          b.ll[0] - a.ll[0] ||
          a.ll[1] - b.ll[1],
      )
      .map((s, i) => ({ ...s, rank: i + 1, grade: grade(s.score) }))
  );
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
export async function assessHouse(
  ctx: ScoreContext & {
    slope: Float32Array;
    aspect: Float32Array;
    inside: Uint8Array;
    search: SiteSearch | null;
  },
  house: LatLon,
): Promise<NonNullable<ScreenResult["house"]>> {
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
  const s = await scoreSite(ctx, house, {
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
export function routedLine(rt: Pick<Route, "metrics" | "maxGrade" | "cost" | "needsEasement">): string {
  return `routed driveway: ${Math.round(rt.metrics.lengthFt)} ft at ≤${(rt.maxGrade * 100).toFixed(0)}%, ${rt.metrics.switchbacks} switchback${rt.metrics.switchbacks === 1 ? "" : "s"}, ~$${fmt(rt.cost.low / 1000)}–${fmt(rt.cost.high / 1000)}k${rt.needsEasement ? `, ${NEEDS_EASEMENT}` : ""}`;
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

/**
 * A site's driveway candidates, when they differ (A4, owner's wording; rule 7: appended, nothing replaced): the one
 * it is scored on first, then the other. They differ when the route within the limit needs an easement, or when
 * there is none; otherwise that route is on the owner's land and the routed line above says so.
 */
export function drivewayChoiceLines(r: SiteRoutes, limitPct: number, vetoPct = Infinity): string[] {
  const { withinLimit: w, onParcel: p } = r;
  if (w && w === p) return [];
  const own = (d: SiteDriveway) =>
    `Best on your land: ${Math.round(d.route!.maxGrade * 100)}%, ${Math.round(d.route!.metrics.lengthFt)} ft${d.route!.needsEasement ? `, ${NEEDS_EASEMENT}` : ""}`;
  const via = (d: SiteDriveway) =>
    `Within ${limitPct}% only via neighbouring land (needs an easement): ${Math.round(d.route!.metrics.lengthFt)} ft`;
  const lines = [p?.route ? own(p) : null, w?.route ? via(w) : null];
  const chosen = chooseDriveway(r, vetoPct);
  return (chosen.route === w?.route ? lines.reverse() : lines).filter((x): x is string => x != null);
}

/** The site with its candidate lines appended. */
export function withDrivewayChoice(site: Site, r: SiteRoutes, limitPct: number, vetoPct = Infinity): Site {
  const lines = drivewayChoiceLines(r, limitPct, vetoPct);
  return lines.length ? { ...site, why: [...site.why, ...lines] } : site;
}
