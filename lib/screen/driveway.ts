/**
 * The driveway router: entrance candidates where a Census road meets the boundary, a least-cost path over
 * the fine DEM that never exceeds the grade limit, quantities and a cost range, and the pioneer-track
 * estimates. Ported verbatim from the prototype (proto MinHeap … buildDriveway). Phase 2.5 brings it to
 * REQUIREMENTS §2a; Phase 0 reproduces it, known limitations included (test/fixtures/README.md).
 *
 * Path costs are kept in a Float32Array as in the prototype: near-ties are decided at float32 precision.
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
import { rcToLL, utmToRC } from "./dem";
import type { RoadFeature } from "./roads";
import { bottomland, type SoilUnit } from "./soils";
import type { Dem, ScreenResult, SoilRow, UserConfig } from "./types";
import { M2FT, M2_PER_ACRE, type LatLon } from "./util";

const K = SCREEN_CONSTANTS.driveway;

type Driveway = NonNullable<ScreenResult["driveway"]>;
type Route = Driveway["routes"][number];
export type Entrance = Driveway["entrances"][number];
export type OverLimitRoute = NonNullable<Driveway["overLimit"]>;

/** Binary min-heap of [key, value] pairs (proto MinHeap). */
export class MinHeap {
  private readonly a: [number, number][] = [];
  push(k: number, v: number): void {
    const a = this.a;
    a.push([k, v]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p]![0] <= a[i]![0]) break;
      [a[p], a[i]] = [a[i]!, a[p]!];
      i = p;
    }
  }
  pop(): [number, number] {
    const a = this.a;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1,
          r = l + 1;
        let m = i;
        if (l < a.length && a[l]![0] < a[m]![0]) m = l;
        if (r < a.length && a[r]![0] < a[m]![0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i]!, a[m]!];
        i = m;
      }
    }
    return top;
  }
  get size(): number {
    return this.a.length;
  }
}

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
export function entranceCandidates(
  roads: RoadFeature[],
  parcel: Feature<Polygon>,
  d: Dem,
): { entrances: Entrance[]; roadsNearestFt: number | null } {
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
  dw: UserConfig["dw"];
}

interface RouteOpts {
  maxGrade: number;
  wGrade: number;
  label: string;
}

type RawRoute = Omit<Route, "entranceIndex">;

/** Least-cost path from one point to another under a grade limit, with quantities and cost (proto routeDriveway). */
export function routeDriveway(
  ctx: RouteContext,
  fromLL: LatLon,
  toLL: LatLon,
  opts: RouteOpts,
): RawRoute | null {
  const d = ctx.dFine,
    { w, h, z } = d,
    n = w * h,
    maxG = opts.maxGrade,
    wG = opts.wGrade,
    inside = ctx.inside,
    slope = ctx.slope,
    soil = ctx.soilMask(),
    acc = ctx.flowAcc();
  const streamCells = Math.round(K.streamContributingM2 / (d.res * d.resY)); // 2 ha contributing area
  const [sx, sy] = UTM.fwd(fromLL[0], fromLL[1]);
  const [sr, sc] = utmToRC(d, sx, sy);
  const [tx, ty] = UTM.fwd(toLL[0], toLL[1]);
  const [tr, tc] = utmToRC(d, tx, ty);
  if (sr < 0 || sc < 0 || sr >= h || sc >= w || tr < 0 || tc < 0 || tr >= h || tc >= w) return null;
  const src = sr * w + sc,
    dst = tr * w + tc;
  const dist = new Float32Array(n).fill(Infinity),
    prev = new Int32Array(n).fill(-1);
  const heap = new MinHeap();
  dist[src] = 0;
  heap.push(0, src);
  const nb = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
    [2, 1],
    [2, -1],
    [-2, 1],
    [-2, -1],
    [1, 2],
    [1, -2],
    [-1, 2],
    [-1, -2],
  ] as const;
  const cellCost = (i: number) => {
    let f = 1 + K.crossSlopeFactor * Math.tan(((slope[i] || 0) * Math.PI) / 180);
    if (soil[i] === 1) f *= K.bottomlandFactor;
    else if (soil[i] === 2) f *= K.rockFactor;
    if (!inside[i]) f *= K.outsideFactor;
    return f;
  };
  while (heap.size) {
    const [dcur, i] = heap.pop();
    if (dcur > dist[i]!) continue;
    if (i === dst) break;
    const r = (i / w) | 0,
      c = i % w;
    for (const [dr, dc] of nb) {
      const rr = r + dr,
        cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= h || cc >= w) continue;
      const j = rr * w + cc;
      if (Number.isNaN(z[j]!)) continue;
      // B9: rows scale by res and columns by resY (swapped, harmless: equal on 3DEP output).
      const len = Math.hypot(dr * d.res, dc * d.resY);
      const g = Math.abs(z[j]! - z[i]!) / len;
      if (g > maxG) continue;
      let cost = len * (1 + wG * (g / maxG) ** 2) * cellCost(j);
      if (acc[j]! >= streamCells && acc[i]! < streamCells) cost += K.crossingCost;
      const nd = dcur + cost;
      if (nd < dist[j]!) {
        dist[j] = nd;
        prev[j] = i;
        heap.push(nd, j);
      }
    }
  }
  if (!Number.isFinite(dist[dst]!)) return null;
  const cells: number[] = [];
  for (let i = dst; i >= 0; i = prev[i]!) cells.push(i);
  cells.reverse();
  let pts: Position[] = cells.map((i) => {
    const [lat, lon] = rcToLL(d, (i / w) | 0, i % w);
    return [lon, lat];
  });
  for (let k = 0; k < K.chaikinPasses; k++) {
    const o: Position[] = [pts[0]!];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i]!,
        q = pts[i + 1]!;
      o.push(
        [0.75 * p[0]! + 0.25 * q[0]!, 0.75 * p[1]! + 0.25 * q[1]!],
        [0.25 * p[0]! + 0.75 * q[0]!, 0.25 * p[1]! + 0.75 * q[1]!],
      );
    }
    o.push(pts[pts.length - 1]!);
    pts = o;
  }
  const line = lineString(pts);
  const lenM = length(line, { units: "meters" });
  const prof: [number, number][] = [];
  const culverts: LatLon[] = [];
  let outside = 0,
    rockM = 0,
    earth = 0,
    prevAcc = 0,
    maxg = 0,
    sumg = 0,
    turns = 0,
    lastB: number | null = null;
  const W = K.benchWidthM,
    step = K.profileStepM;
  for (let s = 0; s <= lenM; s += step) {
    const p = along(line, s, { units: "meters" }).geometry.coordinates;
    const [x, y] = UTM.fwd(p[1]!, p[0]!);
    const [rr, cc] = utmToRC(d, x, y);
    if (rr < 0 || cc < 0 || rr >= h || cc >= w) continue;
    const i = rr * w + cc;
    const zz = z[i]!;
    if (Number.isNaN(zz)) continue;
    prof.push([s, zz]);
    if (!inside[i]) outside += step;
    if (soil[i] === 2) rockM += step;
    const cs = Math.tan(((slope[i] || 0) * Math.PI) / 180);
    earth += ((W * W * cs) / 2) * step;
    if (acc[i]! >= streamCells && prevAcc < streamCells) culverts.push([p[1]!, p[0]!]);
    prevAcc = acc[i]!;
    if (s >= K.turnWindowM) {
      const q = along(line, s - K.turnWindowM, { units: "meters" }).geometry.coordinates;
      const b = bearing(q, p);
      if (lastB != null) {
        let db = Math.abs(b - lastB);
        if (db > 180) db = 360 - db;
        if (db > K.switchbackTurnDeg) turns++;
      }
      lastB = b;
    }
  }
  for (let i = 1; i < prof.length; i++) {
    const g = Math.abs(prof[i]![1] - prof[i - 1]![1]) / (prof[i]![0] - prof[i - 1]![0]);
    if (g > maxg) maxg = g;
    sumg += g;
  }
  const rise = prof.length ? Math.abs(prof[prof.length - 1]![1] - prof[0]![1]) : 0;
  const q = {
    lengthFt: lenM * M2FT,
    riseFt: rise * M2FT,
    maxGradePct: maxg * 100,
    avgGradePct: prof.length > 1 ? (sumg / (prof.length - 1)) * 100 : 0,
    switchbacks: Math.max(0, Math.round(turns / 2)),
    earthYd: earth * K.m3ToYd3,
    rockYd: earth * K.m3ToYd3 * (lenM ? rockM / lenM : 0),
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
  return {
    line,
    profile: prof,
    metrics: q,
    cost: { mid: cost, low: cost * R.low, high: cost * R.high },
    culverts,
    needsEasement: q.outsideFt > K.easementOutsideFt,
    maxGrade: maxG,
    label: opts.label,
  }; // the first ~50 ft from the road edge is normally outside the line
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
 * cap only allows more paths), the cheaper entrance winning at that cap. Its over-limit stretches come from
 * the route's own 3 m profile.
 */
export function leastSteep(
  ctx: RouteContext,
  ent: Entrance[],
  toLL: LatLon,
  limitPct: number,
): OverLimitRoute | null {
  const L = K.leastSteep;
  const at = (capPct: number) => {
    let best: { rt: RawRoute; entranceIndex: number } | null = null;
    ent.slice(0, K.entrancesRouted).forEach((e, entranceIndex) => {
      const rt = routeDriveway(ctx, e.ll, toLL, { maxGrade: capPct / 100, wGrade: L.wGrade, label: L.label });
      if (rt && (!best || rt.cost.mid < best.rt.cost.mid)) best = { rt, entranceIndex };
    });
    return best as { rt: RawRoute; entranceIndex: number } | null;
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
  const overSpans = overLimitSpans(rt.profile, limitPct / 100);
  const overM = overSpans.reduce((m, [a, b]) => m + (b - a), 0);
  return { ...rt, entranceIndex, limitPct, overFt: overM * M2FT, overSpans };
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
): Driveway {
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
    for (const o of [
      { maxGrade: roadMaxGradePct / 100, wGrade: K.shortest.wGrade, label: K.shortest.label },
      { maxGrade: K.gentlest.maxGrade, wGrade: K.gentlest.wGrade, label: K.gentlest.label },
    ]) {
      const rt = routeDriveway(ctx, e.ll, toLL, o);
      if (rt) found.push({ rt, entranceIndex });
    }
  });
  if (!found.length) {
    // The prototype's note, verbatim. New in the port (owner, after 15c): one sentence appended saying how
    // steep the least-steep route is (drawn as suspect, not scored), never replacing the prototype's text.
    dw.note = `Entrance found on ${ent[0]!.name}, but no route reaches ${toLabel} at ${roadMaxGradePct}% or less, even with switchbacks. Raise the grade limit in Settings or pick a different site.`;
    const over = leastSteep(ctx, ent, toLL, roadMaxGradePct);
    if (!over) {
      dw.note += ` None does even at ${K.leastSteep.maxPct}%.`;
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
  const direct = routeDriveway(ctx, ent[rec.entranceIndex]!.ll, toLL, K.direct);
  if (direct) dw.direct = { ...direct, entranceIndex: rec.entranceIndex, track: trackCost(direct, ctx.dw) };
  return dw;
}
