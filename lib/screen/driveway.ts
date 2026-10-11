/**
 * The driveway router: entrance candidates where a Census road meets the boundary, a least-cost path over
 * the fine DEM that never exceeds the grade limit, quantities and a cost range, and the pioneer-track
 * estimates. Ported verbatim from the prototype (proto MinHeap … buildDriveway). Phase 2.5 brings it to
 * REQUIREMENTS §2a; Phase 0 reproduces it, known limitations included (test/fixtures/README.md).
 *
 * Path costs are kept in a Float64Array (A3b, follow-up 44). The prototype kept them in a Float32Array but popped
 * full-precision keys, so every cell whose stored cost rounded down was skipped, never expanded: about half of them.
 */
import {
  along,
  bbox,
  bearing,
  booleanPointInPolygon,
  centroid,
  destination,
  distance,
  length,
  lineString,
  nearestPointOnLine,
  pointToLineDistance,
  polygonToLine,
} from "@turf/turf";
import type { Feature, FeatureCollection, LineString, MultiLineString, Polygon, Position } from "geojson";
import * as UTM from "../geo/utm";
import { SCREEN_CONSTANTS } from "./config";
import { rcToLL, utmToRC, zBilinear } from "./dem";
import type { RoadFeature } from "./roads";
import { bottomland, type SoilUnit } from "./soils";
import type { Dem, ScreenResult, SoilRow, UserConfig } from "./types";
import { M2FT, M2_PER_ACRE, type LatLon } from "./util";
import { searchMany, smoothPath, type PathPoint, type RoutedPath } from "./router";

export { MinHeap } from "./router";

const K = SCREEN_CONSTANTS.driveway;

type Driveway = NonNullable<ScreenResult["driveway"]>;
type Route = Driveway["routes"][number];
export type Entrance = Driveway["entrances"][number];
export type OverLimitRoute = NonNullable<Driveway["overLimit"]>;

/** D8 flow accumulation, in cells (proto flowAccum). */
export function flowAccum(d: Dem): Float32Array {
  const { w, h, z } = d,
    n = w * h,
    acc = new Float32Array(n).fill(1),
    order: number[] = [];
  for (let i = 0; i < n; i++) if (!Number.isNaN(z[i]!)) order.push(i);
  order.sort((a, b) => z[b]! - z[a]!);
  for (const i of order) {
    const r = (i / w) | 0,
      c = i % w;
    let best = -1,
      bd = 0;
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr,
          cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= h || cc >= w) continue;
        const j = rr * w + cc;
        if (Number.isNaN(z[j]!)) continue;
        const drop = (z[i]! - z[j]!) / Math.hypot(dr, dc);
        if (drop > bd) {
          bd = drop;
          best = j;
        }
      }
    if (best >= 0) acc[best]! += acc[i]!;
  }
  return acc;
}

/** Per cell inside the parcel: 1 on bottomland, 2 on shallow rock, else 0 (proto soilMask). */
export function soilMask(
  units: SoilUnit[] | null,
  rows: SoilRow[] | null,
  d: Dem,
  inside: Uint8Array,
  shallowBedrockCm: number,
): Uint8Array {
  const m = new Uint8Array(d.w * d.h);
  if (!units) return m;
  const flagged = units
    .map((u) => {
      const comp = (rows || [])
        .filter((x) => String(x.mukey) === u.mukey)
        .sort((a, b) => (+b.comppct_r! || 0) - (+a.comppct_r! || 0))[0];
      return {
        u,
        bottom: comp ? !!bottomland(comp) : false,
        rock:
          !!comp &&
          comp.brockdepmin != null &&
          comp.brockdepmin !== "" &&
          +comp.brockdepmin < shallowBedrockCm,
        bb: u.geos.map((g) => bbox(g)),
      };
    })
    .filter((x) => x.bottom || x.rock);
  if (!flagged.length) return m;
  for (let r = 0; r < d.h; r++)
    for (let c = 0; c < d.w; c++) {
      const i = r * d.w + c;
      if (!inside[i]) continue;
      const [lat, lon] = rcToLL(d, r, c);
      for (const x of flagged) {
        let hit = false;
        for (let k = 0; k < x.u.geos.length; k++) {
          const b = x.bb[k]!;
          if (lon < b[0]! || lon > b[2]! || lat < b[1]! || lat > b[3]!) continue;
          if (booleanPointInPolygon([lon, lat], x.u.geos[k]!)) {
            hit = true;
            break;
          }
        }
        if (hit) {
          m[i] = x.bottom ? 1 : 2;
          break;
        }
      }
    }
  return m;
}

/**
 * Depth to bedrock per cell inside the parcel (cm; the dominant component's `brockdepmin`), NaN where the soils
 * don't say (outside the parcel, or no bedrock within the component's depth). A landing's cut below it is rock.
 */
export function bedrockDepth(
  units: SoilUnit[] | null,
  rows: SoilRow[] | null,
  d: Dem,
  inside: Uint8Array,
): Float32Array {
  const m = new Float32Array(d.w * d.h).fill(NaN);
  if (!units) return m;
  const known = units.flatMap((u) => {
    const comp = (rows || [])
      .filter((x) => String(x.mukey) === u.mukey)
      .sort((a, b) => (+b.comppct_r! || 0) - (+a.comppct_r! || 0))[0];
    const cm = comp?.brockdepmin == null || comp.brockdepmin === "" ? NaN : +comp.brockdepmin;
    return Number.isFinite(cm) ? [{ u, cm, bb: u.geos.map((g) => bbox(g)) }] : [];
  });
  if (!known.length) return m;
  for (let r = 0; r < d.h; r++)
    for (let c = 0; c < d.w; c++) {
      const i = r * d.w + c;
      if (!inside[i]) continue;
      const [lat, lon] = rcToLL(d, r, c);
      for (const x of known) {
        const hit = x.u.geos.some((g, k) => {
          const b = x.bb[k]!;
          return (
            lon >= b[0]! &&
            lon <= b[2]! &&
            lat >= b[1]! &&
            lat <= b[3]! &&
            booleanPointInPolygon([lon, lat], g)
          );
        });
        if (hit) {
          m[i] = x.cm;
          break;
        }
      }
    }
  return m;
}

type Line = Feature<LineString | MultiLineString>;
const firstLine = (l: Line | FeatureCollection<LineString | MultiLineString>): Line =>
  l.type === "FeatureCollection" ? l.features[0]! : l;
const linesOf = (f: RoadFeature): Feature<LineString>[] =>
  f.geometry.type === "MultiLineString"
    ? f.geometry.coordinates.map((c) => lineString(c))
    : [f as Feature<LineString>];

/**
 * Frontage points on Census roads near the boundary, scored by road grade, bend and bank height; the best
 * three at least 60 m apart. With no frontage, the nearest road point within 400 m as a flagged fallback.
 */
/**
 * Turf's along() for nondecreasing distances on one line (the travelled sum and the overshoot as along() takes them),
 * also returning the segment a point is on and how far along it (0…1).
 */
function alongWalkerSeg(coords: Position[]): (d: number) => [Position, number, number] {
  const last = coords.length - 1;
  const segLen = coords.slice(1).map((p, i) => distance(coords[i]!, p, { units: "meters" }));
  let i = 0,
    travelled = 0;
  return (dist: number) => {
    for (;;) {
      if (dist >= travelled && i === last) return [coords[last]!, Math.max(0, last - 1), 1];
      if (travelled >= dist) {
        const overshot = dist - travelled;
        if (!overshot || i === 0) return [coords[i]!, Math.max(0, i - 1), i === 0 ? 0 : 1];
        const direction = bearing(coords[i]!, coords[i - 1]!) - 180;
        const p = destination(coords[i]!, overshot, direction, { units: "meters" }).geometry.coordinates;
        const L = segLen[i - 1]!;
        return [p, i - 1, L ? 1 + overshot / L : 1];
      }
      travelled += segLen[i]!;
      i++;
    }
  };
}

type Entrances = { entrances: Entrance[]; roadsNearestFt: number | null };
const entranceCache = new WeakMap<RoadFeature[], WeakMap<Feature<Polygon>, WeakMap<Dem, Entrances>>>();

/**
 * Entrance candidates (proto entrances), computed once per roads, parcel and DEM (A3b): the multi-site pass and
 * site #1's driveway both need them, and finding them is the slow part of routing.
 */
export function entranceCandidates(roads: RoadFeature[], parcel: Feature<Polygon>, d: Dem): Entrances {
  let byParcel = entranceCache.get(roads);
  if (!byParcel) entranceCache.set(roads, (byParcel = new WeakMap()));
  let byDem = byParcel.get(parcel);
  if (!byDem) byParcel.set(parcel, (byDem = new WeakMap()));
  let found = byDem.get(d);
  if (!found) byDem.set(d, (found = findEntrances(roads, parcel, d)));
  return found;
}

function findEntrances(roads: RoadFeature[], parcel: Feature<Polygon>, d: Dem): Entrances {
  if (!roads.length) return { entrances: [], roadsNearestFt: null };
  const edgeLine = firstLine(polygonToLine(parcel)) as Feature<LineString>;
  const out: Entrance[] = [];
  let minDist = Infinity;
  const z = (p: Position) => {
    const [x, y] = UTM.fwd(p[1]!, p[0]!);
    const [rr, cc] = utmToRC(d, x, y);
    return rr >= 0 && cc >= 0 && rr < d.h && cc < d.w ? d.z[rr * d.w + cc]! : NaN;
  };
  for (const f of roads) {
    for (const ln of linesOf(f)) {
      const len = length(ln, { units: "meters" });
      for (let s = 0; s <= len; s += K.entranceSampleM) {
        const p = along(ln, s, { units: "meters" });
        const dist = pointToLineDistance(p, edgeLine, { units: "meters" });
        if (dist < minDist) minDist = dist;
        if (dist > K.entranceMaxDistM) continue;
        const p0 = along(ln, Math.max(0, s - K.entranceBendM), { units: "meters" }).geometry.coordinates,
          p1 = along(ln, Math.min(len, s + K.entranceBendM), { units: "meters" }).geometry.coordinates;
        const b0 = bearing(p0, p.geometry.coordinates),
          b1 = bearing(p.geometry.coordinates, p1);
        let bend = Math.abs(b1 - b0);
        if (bend > 180) bend = 360 - bend;
        const zr = z(p.geometry.coordinates),
          z0 = z(p0),
          z1 = z(p1);
        const roadGrade =
          Number.isNaN(z0) || Number.isNaN(z1)
            ? 0
            : (Math.abs(z1 - z0) / Math.max(1, distance(p0, p1, { units: "meters" }))) * 100;
        const inward = destination(p.geometry.coordinates, K.entranceInwardM, b1 + 90, { units: "meters" })
            .geometry.coordinates,
          inward2 = destination(p.geometry.coordinates, K.entranceInwardM, b1 - 90, { units: "meters" })
            .geometry.coordinates;
        const insidePt = booleanPointInPolygon(inward, parcel) ? inward : inward2;
        const zb = z(insidePt);
        const bank = Number.isNaN(zb) || Number.isNaN(zr) ? 0 : Math.abs(zb - zr);
        const S = K.entranceScore;
        out.push({
          ll: [p.geometry.coordinates[1]!, p.geometry.coordinates[0]!],
          name: f.properties.NAME || "road",
          roadGrade,
          bend,
          bankFt: bank * M2FT,
          score: roadGrade * S.grade + bend * S.bend + bank * M2FT * S.bankFt,
        });
      }
    }
  }
  out.sort((a, b) => a.score - b.score);
  const picked: Entrance[] = [];
  for (const c of out) {
    if (
      picked.every(
        (p) =>
          distance([p.ll[1], p.ll[0]], [c.ll[1], c.ll[0]], { units: "meters" }) > K.entranceMinSeparationM,
      )
    )
      picked.push(c);
    if (picked.length >= K.maxEntrances) break;
  }
  if (!picked.length && Number.isFinite(minDist) && minDist <= K.fallbackMaxM) {
    // No frontage: the nearest road point; the route will leave the boundary and be flagged.
    let nearest: { dd: number; p: Position; name: string } | null = null;
    for (const f of roads)
      for (const ln of linesOf(f)) {
        const np = nearestPointOnLine(ln, centroid(parcel), { units: "meters" });
        const dd = pointToLineDistance(np, edgeLine, { units: "meters" });
        if (!nearest || dd < nearest.dd)
          nearest = { dd, p: np.geometry.coordinates, name: f.properties.NAME || "road" };
      }
    if (nearest)
      picked.push({
        ll: [nearest.p[1]!, nearest.p[0]!],
        name: nearest.name,
        roadGrade: 0,
        bend: 0,
        bankFt: 0,
        score: 0,
        fallback: true,
        gapFt: nearest.dd * M2FT,
      });
  }
  return { entrances: picked, roadsNearestFt: Number.isFinite(minDist) ? minDist * M2FT : null };
}

export interface RouteContext {
  dFine: Dem;
  inside: Uint8Array;
  slope: Float32Array;
  /** Built once per session on first use (the prototype cached these on its context). */
  soilMask: () => Uint8Array;
  flowAcc: () => Float32Array;
  /** Depth to bedrock per cell, cm (NaN unknown): a landing's cut below it is priced as rock. Absent: all soil. */
  bedrockCm?: () => Float32Array;
  dw: UserConfig["dw"];
}

interface RouteOpts {
  maxGrade: number;
  wGrade: number;
  label: string;
  /**
   * Keep to the parcel (owner, after #52; the least-steep route only): land outside the boundary is off
   * limits except within this many metres of the start, the entrance on the boundary. Unset, outside land
   * costs `outsideFactor` more, as in the prototype.
   */
  insideExceptNearStartM?: number;
  /** The search without its speed-ups, and a side-slope limit for landings (the router report: SearchOpts). */
  exact?: boolean;
  landingMaxSideSlopeDeg?: number;
}

/**
 * Options for a routing pass (A4b PR B). `onProgress` is called after each search; the screen counts them while
 * the driveway step works. `exact` and `landingMaxSideSlopeDeg` are for the router report.
 */
export interface RoutingOpts {
  exact?: boolean;
  landingMaxSideSlopeDeg?: number;
  onProgress?: () => void;
}

type RawRoute = Omit<Route, "entranceIndex">;

/** One landing of a route (A4b PR B): where, the turn, the side slope, and its graded bench's earthwork. */
export interface LandingDetail {
  ll: LatLon;
  /** Distance along the smoothed route to the turn's start, metres. */
  atM: number;
  turnDeg: number;
  sideSlopeDeg: number;
  cutFillM3: number;
  rockM3: number;
  cost: number;
}
/** What a route was built from (A4b PR B), for the router report: the routed path, the smoothed one, the landings. */
export interface RouteDetail {
  path: RoutedPath;
  smoothed: PathPoint[];
  landings: LandingDetail[];
}
const details = new WeakMap<object, RouteDetail>();
export const routeDetail = (rt: object): RouteDetail | undefined => details.get(rt);

/** Least-cost path from one point to another under a grade limit, with quantities and cost (proto routeDriveway). */
export function routeDriveway(
  ctx: RouteContext,
  fromLL: LatLon,
  toLL: LatLon,
  opts: RouteOpts,
): RawRoute | null {
  return routeMany(ctx, fromLL, [toLL], opts)[0]!;
}

/**
 * The same search, from one point to several (A3, owner 2026-10-09: every ranked site routed, one pass per
 * entrance). The search is router.ts's (A4b PR B); each target's route is the one a search for it alone would find.
 * Length, cost and grade are measured on the routed path after smoothing and its grade re-check (smoothPath), and
 * the switchbacks are the landings the router built.
 */
export function routeMany(
  ctx: RouteContext,
  fromLL: LatLon,
  toLLs: readonly LatLon[],
  opts: RouteOpts,
): (RawRoute | null)[] {
  return routeManyFrom(ctx, [fromLL], toLLs, opts).map((x) => x?.rt ?? null);
}

/** A route and the entrance (index into the search's starting points) it leaves from. */
export type Found = { rt: RawRoute; entranceIndex: number };

/**
 * routeMany from several entrances at once (A4b PR B): each target's route is the cheapest from any of them, the
 * comparison buildDriveway makes between entrances, in one search.
 */
export function routeManyFrom(
  ctx: RouteContext,
  fromLLs: readonly LatLon[],
  toLLs: readonly LatLon[],
  opts: RouteOpts,
): (Found | null)[] {
  const d = ctx.dFine,
    { w, h, z } = d,
    maxG = opts.maxGrade,
    inside = ctx.inside,
    slope = ctx.slope,
    soil = ctx.soilMask(),
    acc = ctx.flowAcc();
  const streamCells = Math.round(K.streamContributingM2 / (d.res * d.resY)); // 2 ha contributing area
  const srcs = fromLLs.map((ll) => {
    const [sx, sy] = UTM.fwd(ll[0], ll[1]);
    return utmToRC(d, sx, sy);
  });
  const inGrid = (r: number, c: number) => r >= 0 && c >= 0 && r < h && c < w;
  const dsts = toLLs.map((ll) => {
    const [tx, ty] = UTM.fwd(ll[0], ll[1]);
    const [tr, tc] = utmToRC(d, tx, ty);
    return inGrid(tr, tc) ? tr * w + tc : -1;
  });
  const paths = searchMany({ d, inside, slope, soil, acc }, srcs, dsts, opts);
  const finish = (path: RoutedPath): RawRoute => {
    const smoothed = smoothPath(path, maxG, d);
    const pts: Position[] = smoothed.map((p) => {
      const [lat, lon] = UTM.inv(d.x0 + (p.c + 0.5) * d.res, d.y0 - (p.r + 0.5) * d.resY);
      return [lon, lat];
    });
    if (pts.length === 1) pts.push(pts[0]!.slice()); // the entrance is the site: a line needs two points
    const line = lineString(pts);
    const lenM = length(line, { units: "meters" });
    const prof: [number, number][] = [];
    const culverts: LatLon[] = [];
    let outside = 0,
      rockM = 0,
      earth = 0,
      prevAcc = 0,
      sumg = 0;
    const W = K.benchWidthM,
      step = K.profileStepM;
    const at = alongWalkerSeg(pts);
    for (let s = 0; s <= lenM; s += step) {
      const [p, k, f] = at(s);
      const [x, y] = UTM.fwd(p[1]!, p[0]!);
      const [rr, cc] = utmToRC(d, x, y);
      if (rr < 0 || cc < 0 || rr >= h || cc >= w) continue;
      const i = rr * w + cc;
      const zz = z[i]!;
      if (Number.isNaN(zz)) continue;
      // The ground between the cells (A4b): the cell a sample falls in can be the one above or below the path. On a
      // landing, the graded road (A4b PR B).
      const a = smoothed[k],
        b = smoothed[k + 1];
      const zd = a?.zd !== undefined && b?.zd !== undefined ? a.zd + (b.zd - a.zd) * f : NaN;
      const zb = Number.isNaN(zd) ? zBilinear(d, x, y) : zd;
      prof.push([s, Number.isNaN(zb) ? zz : zb]);
      if (!inside[i]) outside += step;
      if (soil[i] === 2) rockM += step;
      const cs = Math.tan(((slope[i] || 0) * Math.PI) / 180);
      earth += ((W * W * cs) / 2) * step;
      if (acc[i]! >= streamCells && prevAcc < streamCells) culverts.push([p[1]!, p[0]!]);
      prevAcc = acc[i]!;
    }
    for (let i = 1; i < prof.length; i++)
      sumg += Math.abs(prof[i]![1] - prof[i - 1]![1]) / (prof[i]![0] - prof[i - 1]![0]);
    const rise = prof.length ? Math.abs(prof[prof.length - 1]![1] - prof[0]![1]) : 0;
    // Each landing's graded bench: the cut or fill between the ground and the road, a bench's width wide; cut
    // below the bedrock depth is rock.
    const bedrock = ctx.bedrockCm?.();
    const landingDetails: LandingDetail[] = path.landings.map((L) => {
      let m3 = 0,
        rock = 0;
      for (let n = L.from + 1; n <= L.end; n++) {
        const p0 = path.pts[n - 1]!,
          p1 = path.pts[n]!;
        const segM = Math.hypot((p1.c - p0.c) * d.res, (p1.r - p0.r) * d.resY);
        const dz = p1.z - (p1.zd ?? p1.z); // positive: cut
        m3 += Math.abs(dz) * W * segM;
        const brCm = bedrock?.[Math.round(p1.r) * w + Math.round(p1.c)];
        if (dz > 0 && brCm !== undefined && Number.isFinite(brCm))
          rock += Math.max(0, dz - brCm / 100) * W * segM;
      }
      const yd = m3 * K.m3ToYd3,
        rockYd = rock * K.m3ToYd3;
      const p0 = path.pts[L.from]!;
      const [lat, lon] = UTM.inv(d.x0 + (p0.c + 0.5) * d.res, d.y0 - (p0.r + 0.5) * d.resY);
      const k = smoothed.indexOf(p0);
      const atM = k > 0 ? length(lineString(pts.slice(0, k + 1)), { units: "meters" }) : 0;
      return {
        ll: [lat, lon] as LatLon,
        atM,
        turnDeg: L.turnDeg,
        sideSlopeDeg: L.sideSlopeDeg,
        cutFillM3: m3,
        rockM3: rock,
        cost: (yd - rockYd) * ctx.dw.earthSoilPerYd + rockYd * ctx.dw.earthRockPerYd,
      };
    });
    const benchYd = landingDetails.reduce((t, x) => t + x.cutFillM3, 0) * K.m3ToYd3,
      benchRockYd = landingDetails.reduce((t, x) => t + x.rockM3, 0) * K.m3ToYd3;
    const q = {
      lengthFt: lenM * M2FT,
      riseFt: rise * M2FT,
      // The steepest grade over the headline window, not a single 3 m step (A4b, owner 2026-10-10).
      maxGradePct: gradeOver(prof, K.gradeWindowsM.headline),
      avgGradePct: prof.length > 1 ? (sumg / (prof.length - 1)) * 100 : 0,
      // The landings the router built (A4b PR B): each turn of more than switchbackTurnDeg.
      switchbacks: path.landings.length,
      earthYd: earth * K.m3ToYd3 + benchYd,
      rockYd: earth * K.m3ToYd3 * (lenM ? rockM / lenM : 0) + benchRockYd,
      stoneTons: W * K.stoneDepthM * lenM * K.stoneTPerM3,
      fabricSf: W * lenM * K.m2ToSf,
      clearAc: (K.clearingWidthM * lenM) / M2_PER_ACRE,
      culverts: culverts.length + 1,
      outsideFt: outside * M2FT,
    };
    const u = ctx.dw;
    const wooded = Math.min(1, Math.max(0, (u.woodedPct || 100) / 100));
    const cost =
      u.mobilize +
      u.entrance +
      u.erosion +
      q.clearAc * wooded * u.clearPerAc +
      (q.earthYd - q.rockYd) * u.earthSoilPerYd +
      q.rockYd * u.earthRockPerYd +
      q.stoneTons * u.stonePerTon +
      q.fabricSf * u.fabricPerSf +
      q.culverts * u.culvertEach;
    const R = K.costRange;
    const rt: RawRoute = {
      line,
      profile: prof,
      metrics: q,
      cost: { mid: cost, low: cost * R.low, high: cost * R.high },
      culverts,
      needsEasement: q.outsideFt > K.easementOutsideFt,
      maxGrade: maxG,
      label: opts.label,
    }; // the first ~50 ft from the road edge is normally outside the line
    details.set(rt, { path, smoothed, landings: landingDetails });
    return rt;
  };
  return paths.map((p) => (p ? { rt: finish(p), entranceIndex: p.source } : null));
}

/** A pioneer 4×4 track on an alignment: blade only, water bars, a pipe or ford at crossings (proto trackCost). */
export function trackCost(rt: RawRoute, dw: UserConfig["dw"]): NonNullable<Route["track"]> {
  const T = K.track,
    m = rt.metrics,
    lenM = m.lengthFt / M2FT;
  const hours =
    lenM / T.mPerHr + Math.max(0, m.maxGradePct - 8) * T.hrsPerPctOver8 + m.switchbacks * T.hrsPerSwitchback;
  const steepM =
    rt.profile.filter((p, i) => i && Math.abs(p[1] - rt.profile[i - 1]![1]) / 3 > T.steepGrade).length *
    K.profileStepM;
  const waterBars = Math.ceil(steepM / T.waterBarEveryM);
  const cost =
    dw.mobilize +
    dw.entrance * T.entranceShare +
    hours * T.dozerPerHr +
    waterBars * T.waterBarEach +
    (m.culverts - 1) * T.culvertEach +
    T.stoneTons * dw.stonePerTon +
    m.clearAc * T.clearingShare * (dw.woodedPct / 100) * dw.clearPerAc * T.clearingRateShare;
  const Rg = K.costRange;
  return {
    hours: Math.round(hours),
    waterBars,
    cost: { mid: cost, low: cost * Rg.low, high: cost * Rg.high },
  };
}

/**
 * The least-steep route when none fits the limit (owner, after 15c): the lowest whole-percent cap above the
 * limit, up to K.leastSteep.maxPct, at which the routed entrances reach the target (binary search: a higher
 * cap only allows more paths), the cheaper entrance winning at that cap, keeping to the parcel (land outside
 * the boundary only at the entrance's edge). Its over-limit stretches come from the route's own 3 m profile.
 */
export function leastSteep(
  ctx: RouteContext,
  ent: Entrance[],
  toLL: LatLon,
  limitPct: number,
  routing: RoutingOpts = {},
): OverLimitRoute | null {
  const L = K.leastSteep;
  const at = (capPct: number): Found | null => {
    const found = routeManyFrom(
      ctx,
      ent.slice(0, K.entrancesRouted).map((e) => e.ll),
      [toLL],
      {
        maxGrade: capPct / 100,
        wGrade: L.wGrade,
        label: L.label,
        // Within the parcel: a route through the neighbours answers a different question, the easement one
        // (owner, after #52; drawn easements are follow-up 34). Only the entrance's own few cells may lie outside.
        insideExceptNearStartM: L.entranceM,
        exact: routing.exact,
        landingMaxSideSlopeDeg: routing.landingMaxSideSlopeDeg,
      },
    )[0]!;
    routing.onProgress?.();
    return found;
  };
  let lo = Math.floor(limitPct) + 1,
    hi = L.maxPct;
  let found = at(hi);
  if (!found) return null;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const r = at(mid);
    if (r) {
      found = r;
      hi = mid;
    } else lo = mid + 1;
  }
  const { rt, entranceIndex } = found;
  return overLimitRoute(rt, entranceIndex, limitPct);
}

/** A least-steep route with its stretches over the limit (from its own profile). */
function overLimitRoute(rt: RawRoute, entranceIndex: number, limitPct: number): OverLimitRoute {
  const overSpans = overLimitSpans(rt.profile, limitPct / 100);
  const overM = overSpans.reduce((m, [a, b]) => m + (b - a), 0);
  const out = { ...rt, entranceIndex, limitPct, overFt: overM * M2FT, overSpans };
  const detail = details.get(rt);
  if (detail) details.set(out, detail);
  return out;
}

/**
 * The two styles routed within a grade limit (proto buildDriveway). The gentlest keeps its own cap only where it is
 * below the limit (A4, owner #87 review): under a 6% limit it is a 6% route, never an 8% one called legal.
 */
function styles(roadMaxGradePct: number): RouteOpts[] {
  return [
    { maxGrade: roadMaxGradePct / 100, wGrade: K.shortest.wGrade, label: K.shortest.label },
    {
      maxGrade: Math.min(K.gentlest.maxGrade, roadMaxGradePct / 100),
      wGrade: K.gentlest.wGrade,
      label: K.gentlest.label,
    },
  ];
}

/** One driveway for scoring (A3): a route within the limit, a least-steep one over it, or none. */
export interface SiteDriveway {
  route: RawRoute | OverLimitRoute | null;
  legal: boolean;
  entranceIndex: number | null;
  /** Every candidate was vetoed and this is the least steep of them (A4b, chooseDriveway): "No practical route found". */
  noPractical?: true;
}

/**
 * A site's two candidate driveways (A4, owner 2026-10-09); scoring takes the one with fewer points (chooseDriveway).
 * - `withinLimit`: the cheapest route within the grade limit, wherever it goes (buildDriveway's routes[0]); null
 *   when none fits.
 * - `onParcel`: the cheapest route kept to the parcel (land outside only at the entrance, as leastSteep keeps it),
 *   within the limit when one is, else the least-steep one; null when none reaches. When `withinLimit` needs no
 *   easement it is on the owner's land already, and it is both candidates.
 */
export interface SiteRoutes {
  withinLimit: SiteDriveway | null;
  onParcel: SiteDriveway | null;
}

/**
 * Both candidate driveways to every ranked site (A3, A4): one search per entrance and style for all the sites
 * together (routeMany), and for the least-steep routes one search per entrance and needed cap.
 */
export function siteDriveways(
  ctx: RouteContext,
  roads: RoadFeature[],
  parcel: Feature<Polygon>,
  toLLs: readonly LatLon[],
  roadMaxGradePct: number,
  routing: RoutingOpts = {},
): SiteRoutes[] {
  const { entrances } = entranceCandidates(roads, parcel, ctx.dFine);
  const ent = entrances.slice(0, K.entrancesRouted);
  if (!ent.length) return toLLs.map(() => ({ withinLimit: null, onParcel: null }));
  const extra = { exact: routing.exact, landingMaxSideSlopeDeg: routing.landingMaxSideSlopeDeg };
  /**
   * The cheapest route from any entrance in any of the styles to each of the sites `ts`: one search per style from
   * every entrance at once (A4b PR B), the cheaper style winning (buildDriveway's order on a tie: the first style).
   */
  const cheapest = (ts: number[], opts: RouteOpts[]): (Found | null)[] => {
    const best: (Found | null)[] = ts.map(() => null);
    for (const o of opts) {
      routeManyFrom(
        ctx,
        ent.map((e) => e.ll),
        ts.map((t) => toLLs[t]!),
        { ...o, ...extra },
      ).forEach((f, i) => {
        const b = best[i];
        if (f && (!b || f.rt.cost.mid < b.rt.cost.mid)) best[i] = f;
      });
      routing.onProgress?.();
    }
    return best;
  };
  const legal = (f: Found): SiteDriveway => ({ route: f.rt, legal: true, entranceIndex: f.entranceIndex });

  const all = toLLs.map((_, t) => t);
  const out: SiteRoutes[] = cheapest(all, styles(roadMaxGradePct)).map((f) => {
    const withinLimit = f ? legal(f) : null;
    return { withinLimit, onParcel: withinLimit && !f!.rt.needsEasement ? withinLimit : null };
  });

  // Kept to the parcel, within the limit: for the sites whose cheapest route leaves it, or that have none.
  const L = K.leastSteep;
  const keptOpts = (o: RouteOpts): RouteOpts => ({ ...o, insideExceptNearStartM: L.entranceM });
  const offParcel = all.filter((t) => !out[t]!.onParcel);
  if (!offParcel.length) return out;
  cheapest(offParcel, styles(roadMaxGradePct).map(keptOpts)).forEach((f, i) => {
    if (f) out[offParcel[i]!]!.onParcel = legal(f);
  });

  const pending = offParcel.filter((t) => !out[t]!.onParcel);
  if (!pending.length) return out;
  // leastSteep's binary search over whole-percent caps, run for every pending site together: each round,
  // the sites wanting the same cap share one search per entrance. Same caps, same routes, as site by site.
  const at = (cap: number, ts: number[]) =>
    cheapest(ts, [keptOpts({ maxGrade: cap / 100, wGrade: L.wGrade, label: L.label })]);
  const state = new Map<number, { lo: number; hi: number; found: Found }>();
  at(L.maxPct, pending).forEach((r, i) => {
    if (r) state.set(pending[i]!, { lo: Math.floor(roadMaxGradePct) + 1, hi: L.maxPct, found: r });
  });
  for (;;) {
    const byMid = new Map<number, number[]>();
    for (const [t, st] of state)
      if (st.lo < st.hi) {
        const mid = Math.floor((st.lo + st.hi) / 2);
        byMid.set(mid, [...(byMid.get(mid) ?? []), t]);
      }
    if (!byMid.size) break;
    for (const [mid, ts] of byMid)
      at(mid, ts).forEach((r, i) => {
        const st = state.get(ts[i]!)!;
        if (r) {
          st.found = r;
          st.hi = mid;
        } else st.lo = mid + 1;
      });
  }
  for (const [t, { found }] of state)
    out[t]!.onParcel = {
      route: overLimitRoute(found.rt, found.entranceIndex, roadMaxGradePct),
      legal: false,
      entranceIndex: found.entranceIndex,
    };
  return out;
}

/** The grade the least-steep route needs: its cap, the lowest whole percent that reaches the target. */
export const neededPct = (o: OverLimitRoute): number => Math.round(o.maxGrade * 100);

/**
 * The sentence appended to the prototype's no-route note (owner's wording, #52): lengths as the prototype's
 * driveway notes give them (rounded, no thousands separator).
 */
export function overLimitNote(o: OverLimitRoute): string {
  const n = o.overSpans.length;
  return `The least-steep route found needs grades up to ${neededPct(o)}%, with about ${Math.round(o.overFt)} ft steeper than ${o.limitPct}% in ${n} stretch${n === 1 ? "" : "es"}; it's drawn on the map as suspect.`;
}

/**
 * The steepest grade along a profile ([metres along, elevation], every 3 m) over a window of `windowM`, in percent
 * (A4b, owner 2026-10-10): the rise between two samples at least `windowM` apart over the distance between them.
 * The route's reported grade is the 30 m one; 15 and 60 m are in the card's details.
 */
export function gradeOver(profile: readonly (readonly [number, number])[], windowM: number): number {
  let best = 0;
  for (let i = 0, j = 0; i < profile.length; i++) {
    while (j < profile.length && profile[j]![0] - profile[i]![0] < windowM) j++;
    if (j >= profile.length) break;
    best = Math.max(best, Math.abs(profile[j]![1] - profile[i]![1]) / (profile[j]![0] - profile[i]![0]));
  }
  return best * 100;
}

/**
 * The stretches of a route steeper than a grade, from its profile ([metres along, elevation], every 3 m):
 * the grade is taken over `windowM` (single 3 m steps are noisy), and stretches at most `mergeM` apart are
 * one. Returns [from, to] in metres along the route.
 */
export function overLimitSpans(
  profile: [number, number][],
  grade: number,
  windowM: number = K.leastSteep.windowM,
  mergeM: number = K.leastSteep.mergeM,
): [number, number][] {
  const spans: [number, number][] = [];
  for (let i = 0, j = 0; i < profile.length; i++) {
    while (j < profile.length && profile[j]![0] - profile[i]![0] < windowM) j++;
    if (j >= profile.length) break;
    const [s0, z0] = profile[i]!,
      [s1, z1] = profile[j]!;
    if (Math.abs(z1 - z0) / (s1 - s0) <= grade) continue;
    const last = spans.at(-1);
    if (last && s0 - last[1] <= mergeM) last[1] = Math.max(last[1], s1);
    else spans.push([s0, s1]);
  }
  return spans;
}

/** Entrances, the two cheapest legal routes to a target, and the pioneer tracks (proto buildDriveway). */
export function buildDriveway(
  ctx: RouteContext,
  roads: RoadFeature[],
  parcel: Feature<Polygon>,
  toLL: LatLon,
  toLabel: string,
  roadMaxGradePct: number,
  routing: RoutingOpts = {},
): Driveway {
  const extra = { exact: routing.exact, landingMaxSideSlopeDeg: routing.landingMaxSideSlopeDeg };
  const { entrances: ent, roadsNearestFt } = entranceCandidates(roads, parcel, ctx.dFine);
  const dw: Driveway = { toLabel, entrances: ent, routes: [], note: null, roadsNearestFt };
  if (!ent.length) {
    dw.note = `No Census road within 400 m of the boundary${roadsNearestFt != null ? ` (nearest is ${Math.round(roadsNearestFt)} ft away)` : ""} — the parcel may be landlocked, or TIGER has the road wrong here. ${roads.length ? "" : "No roads were returned by the TIGER query at all."}`;
    return dw;
  }
  if (ent[0]!.fallback)
    dw.note = `No road frontage found within 130 ft of the boundary; routing from the nearest road point, ${Math.round(ent[0]!.gapFt!)} ft off the line. The route will cross someone else's land — that's an easement, not a driveway, unless the frontage is real and TIGER is wrong.`;
  const found: { rt: RawRoute; entranceIndex: number }[] = [];
  ent.slice(0, K.entrancesRouted).forEach((e, entranceIndex) => {
    for (const o of styles(roadMaxGradePct)) {
      const rt = routeDriveway(ctx, e.ll, toLL, { ...o, ...extra });
      routing.onProgress?.();
      if (rt) found.push({ rt, entranceIndex });
    }
  });
  if (!found.length) {
    // The prototype's note, verbatim. New in the port (owner, after 15c): one sentence appended saying how
    // steep the least-steep route is (drawn as suspect, not scored), never replacing the prototype's text.
    dw.note = `Entrance found on ${ent[0]!.name}, but no route reaches ${toLabel} at ${roadMaxGradePct}% or less, even with switchbacks. Raise the grade limit in Settings or pick a different site.`;
    const over = leastSteep(ctx, ent, toLL, roadMaxGradePct, routing);
    if (!over) {
      dw.note += ` No route reaches it even at ${K.leastSteep.maxPct}%.`;
      return dw;
    }
    dw.overLimit = over;
    dw.note += ` ${overLimitNote(over)}`;
    return dw;
  }
  found.sort((a, b) => a.rt.cost.mid - b.rt.cost.mid);
  dw.routes = found.slice(0, K.routesKept).map(({ rt, entranceIndex }) => ({ ...rt, entranceIndex }));
  // Pioneer track: on the recommended alignment (becomes the driveway later) and a direct 15% line
  // (cheaper now, thrown away later).
  const rec = dw.routes[0]!;
  rec.track = trackCost(rec, ctx.dw);
  const direct = routeDriveway(ctx, ent[rec.entranceIndex]!.ll, toLL, { ...K.direct, ...extra });
  routing.onProgress?.();
  if (direct) dw.direct = { ...direct, entranceIndex: rec.entranceIndex, track: trackCost(direct, ctx.dw) };
  return dw;
}

/**
 * The driveway built to #1 (or the house, or a picked point) with the route it is scored on first (owner, #88 review
 * and its approved plan). buildDriveway lists the cheapest routes within the limit; the score takes the candidate
 * with fewer points (chooseDriveway), which can be the route kept to the parcel:
 * - over the limit: it fills `overLimit` (shown and drawn first, as suspect, with the over-limit sentence appended
 *   to the note), and the routes within the limit stay as the alternatives;
 * - within the limit but not routes[0]: it goes first in `routes`.
 * The pioneer track and the direct line follow the scored route. When no route fits the limit at all, buildDriveway
 * already shows the least-steep one, and the result is unchanged.
 */
export function withScoredRoute(
  ctx: RouteContext,
  dw: Driveway,
  scored: SiteDriveway,
  toLL: LatLon,
): Driveway {
  const rt = scored.route;
  const first = dw.routes[0];
  if (!rt || scored.entranceIndex == null || !first) return dw;
  const entranceIndex = scored.entranceIndex;
  /** The scored route itself (siteDriveways and buildDriveway find the same routes, A3). */
  const isScored = (r: Route) =>
    r.entranceIndex === entranceIndex &&
    r.cost.mid === rt.cost.mid &&
    r.metrics.lengthFt === rt.metrics.lengthFt;
  if (scored.legal && isScored(first)) return dw;
  const track = trackCost(rt, ctx.dw);
  const routes = dw.routes.map(({ track: _track, ...r }) => r);
  const direct = routeDriveway(ctx, dw.entrances[entranceIndex]!.ll, toLL, K.direct);
  const out: Driveway = { ...dw, routes };
  delete out.direct;
  if (direct) out.direct = { ...direct, entranceIndex, track: trackCost(direct, ctx.dw) };
  if (!scored.legal) {
    const over: OverLimitRoute = { ...(rt as OverLimitRoute), entranceIndex, track };
    const sentence = overLimitNote(over);
    return { ...out, overLimit: over, note: dw.note ? `${dw.note} ${sentence}` : sentence };
  }
  return {
    ...out,
    routes: [{ ...(rt as RawRoute), entranceIndex, track }, ...routes.filter((r) => !isScored(r))].slice(
      0,
      K.routesKept,
    ),
  };
}
