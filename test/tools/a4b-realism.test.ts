/**
 * A4b (owner, 2026-10-09): the driveway router's realism, report only. Writes docs/studies/a4b-router-realism.md and
 * its drawings (docs/studies/a4b-*.svg):
 *  1. how the grade limit is enforced against how the "max grade" is measured, and the reported max measured the
 *     same way as the limit, over 15/30/60 m windows of the smoothed route with interpolated elevations;
 *  2. zigzag inflation: the router's length against a simplified alignment with grade-checked legs, and the cost;
 *  3. a router proposal (turn penalty, a switchback landing penalty, post-route smoothing with a grade re-check),
 *     prototyped here, with before/after drawings and routing time;
 *  4. the veto simulation: driveway.vetoGradePct = 20 over a 30 m window.
 * Nothing in lib/ changes: the route quantities are re-measured by a copy of the router's own formula, checked
 * equal to the router's on every fixture route before anything else is reported.
 *
 *   pnpm a4b:realism
 */
import { writeFileSync } from "node:fs";
import { along, bearing, length as turfLength, lineString } from "@turf/turf";
import type { Feature, Polygon, Position } from "geojson";
import { describe, expect, it } from "vitest";
import * as UTM from "@/lib/geo/utm";
import { SCREEN_CONSTANTS } from "@/lib/screen/config";
import { utmToRC } from "@/lib/screen/dem";
import {
  MinHeap,
  entranceCandidates,
  siteDriveways,
  type RouteContext,
  type SiteDriveway,
} from "@/lib/screen/driveway";
import { routeContext } from "@/lib/screen/index";
import { chooseDriveway, drivewayPoints } from "@/lib/screen/score";
import type { ScreenResult } from "@/lib/screen/types";
import { M2FT, M2_PER_ACRE } from "@/lib/screen/util";
import { FIXTURE_SLUGS } from "../support/fixtures";
import { runFixture } from "../support/scenarios";

const K = SCREEN_CONSTANTS.driveway;
const DOC = "docs/studies/a4b-router-realism.md";
const WINDOWS = [15, 30, 60] as const;
/** The proposed veto (owner, #89 review): a candidate whose 30 m-window grade exceeds this is not eligible. */
const VETO_PCT = 20;
/** The simplified alignment may stray this far from the routed corridor (about a road's width plus shoulders). */
const SIMPLIFY_EPS_M = 5;
/** The prototype router's turn costs, in metres of the router's base cost: per 45° of heading change, and a landing. */
const TURN_PER_45 = 3;
const SWITCHBACK_COST = 30;
const SWITCHBACK_DEG = 100;
const MIN_LEG_FT = 100;

type Route = NonNullable<ScreenResult["driveway"]>["routes"][number];
type XY = [number, number];

// --- Geometry and elevation -------------------------------------------------------------------------------------

const toXY = (p: Position): XY => UTM.fwd(p[1]!, p[0]!);
const toLonLat = ([x, y]: XY): Position => {
  const [lat, lon] = UTM.inv(x, y);
  return [lon, lat];
};

/** Elevation interpolated between the four nearest cell centres (the router reads cell centres only). */
function zBilinear(ctx: RouteContext, [x, y]: XY): number {
  const d = ctx.dFine;
  const c = (x - d.x0) / d.res - 0.5,
    r = (d.y0 - y) / d.resY - 0.5;
  const c0 = Math.max(0, Math.min(d.w - 2, Math.floor(c))),
    r0 = Math.max(0, Math.min(d.h - 2, Math.floor(r)));
  const fc = Math.min(1, Math.max(0, c - c0)),
    fr = Math.min(1, Math.max(0, r - r0));
  const z = (rr: number, cc: number) => d.z[rr * d.w + cc]!;
  return (
    z(r0, c0) * (1 - fr) * (1 - fc) +
    z(r0, c0 + 1) * (1 - fr) * fc +
    z(r0 + 1, c0) * fr * (1 - fc) +
    z(r0 + 1, c0 + 1) * fr * fc
  );
}
/** Elevation of the cell containing a point: what the router's profile reads. */
function zNearest(ctx: RouteContext, [x, y]: XY): number {
  const d = ctx.dFine;
  const [r, c] = utmToRC(d, x, y);
  return d.z[r * d.w + c]!;
}

/** The router's own cell path, recovered from its line: one Chaikin pass (driveway.ts finish) is invertible. */
function cellPath(rt: Route): Position[] {
  const o = rt.line.geometry.coordinates;
  if (K.chaikinPasses !== 1) throw new Error("cellPath assumes one Chaikin pass");
  const pts: Position[] = [o[0]!];
  for (let i = 0; 2 + 2 * i < o.length - 1; i++) {
    const a = o[1 + 2 * i]!,
      b = o[2 + 2 * i]!;
    pts.push([(3 * b[0]! - a[0]!) / 2, (3 * b[1]! - a[1]!) / 2]);
  }
  return pts;
}

/** A profile along a polyline (lon/lat) every 3 m, with either elevation reading. */
function profile(ctx: RouteContext, pts: Position[], read: "nearest" | "bilinear"): [number, number][] {
  const line = lineString(pts);
  const L = turfLength(line, { units: "meters" });
  const out: [number, number][] = [];
  const xy = pts.map(toXY);
  // Walk the segments directly (UTM metres), so long lines stay cheap; the turf length only fixes the end.
  let s0 = 0;
  for (let i = 0; i < xy.length - 1; i++) {
    const [ax, ay] = xy[i]!,
      [bx, by] = xy[i + 1]!;
    const seg = Math.hypot(bx - ax, by - ay);
    for (let s = Math.ceil(s0 / K.profileStepM) * K.profileStepM; s < s0 + seg; s += K.profileStepM) {
      const f = seg ? (s - s0) / seg : 0;
      const p: XY = [ax + f * (bx - ax), ay + f * (by - ay)];
      out.push([s, read === "nearest" ? zNearest(ctx, p) : zBilinear(ctx, p)]);
    }
    s0 += seg;
  }
  const last = xy.at(-1)!;
  out.push([s0, read === "nearest" ? zNearest(ctx, last) : zBilinear(ctx, last)]);
  void L;
  return out;
}

/** The steepest grade over a window along a profile, in percent, and where it starts (m along). */
function windowMax(prof: [number, number][], windowM: number): { pct: number; at: number } {
  let best = 0,
    at = 0;
  for (let i = 0, j = 0; i < prof.length; i++) {
    while (j < prof.length && prof[j]![0] - prof[i]![0] < windowM) j++;
    if (j >= prof.length) break;
    const g = Math.abs(prof[j]![1] - prof[i]![1]) / (prof[j]![0] - prof[i]![0]);
    if (g > best) {
      best = g;
      at = prof[i]![0];
    }
  }
  return { pct: best * 100, at };
}
/** The steepest single step (the router's report: consecutive 3 m samples). */
function stepMax(prof: [number, number][]): number {
  let best = 0;
  for (let i = 1; i < prof.length; i++)
    best = Math.max(best, Math.abs(prof[i]![1] - prof[i - 1]![1]) / (prof[i]![0] - prof[i - 1]![0]));
  return best * 100;
}

// --- The router's quantities and cost, for any alignment (a copy of driveway.ts finish, checked equal) ------------

interface Measured {
  lengthFt: number;
  cost: number;
  switchbacks: number;
}
function measureAlong(ctx: RouteContext, pts: Position[]): Measured {
  const d = ctx.dFine,
    { w, h, z } = d;
  const slope = ctx.slope,
    soil = ctx.soilMask(),
    acc = ctx.flowAcc(),
    inside = ctx.inside;
  const streamCells = Math.round(K.streamContributingM2 / (d.res * d.resY));
  const line = lineString(pts);
  const lenM = turfLength(line, { units: "meters" });
  let rockM = 0,
    earth = 0,
    prevAcc = 0,
    turns = 0,
    culverts = 0,
    lastB: number | null = null;
  const W = K.benchWidthM,
    step = K.profileStepM;
  for (let s = 0; s <= lenM; s += step) {
    const p = along(line, s, { units: "meters" }).geometry.coordinates;
    const [x, y] = UTM.fwd(p[1]!, p[0]!);
    const [rr, cc] = utmToRC(d, x, y);
    if (rr < 0 || cc < 0 || rr >= h || cc >= w) continue;
    const i = rr * w + cc;
    if (Number.isNaN(z[i]!)) continue;
    if (soil[i] === 2) rockM += step;
    const cs = Math.tan(((slope[i] || 0) * Math.PI) / 180);
    earth += ((W * W * cs) / 2) * step;
    if (acc[i]! >= streamCells && prevAcc < streamCells) culverts++;
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
    void inside;
  }
  const earthYd = earth * K.m3ToYd3,
    rockYd = earthYd * (lenM ? rockM / lenM : 0);
  const u = ctx.dw;
  const wooded = Math.min(1, Math.max(0, (u.woodedPct || 100) / 100));
  const clearAc = (K.clearingWidthM * lenM) / M2_PER_ACRE;
  const cost =
    u.mobilize +
    u.entrance +
    u.erosion +
    clearAc * wooded * u.clearPerAc +
    (earthYd - rockYd) * u.earthSoilPerYd +
    rockYd * u.earthRockPerYd +
    W * K.stoneDepthM * lenM * K.stoneTPerM3 * u.stonePerTon +
    W * lenM * K.m2ToSf * u.fabricPerSf +
    (culverts + 1) * u.culvertEach;
  return { lengthFt: lenM * M2FT, cost, switchbacks: Math.max(0, Math.round(turns / 2)) };
}

// --- A simplified alignment with grade-checked legs (Douglas–Peucker, then each leg's grade checked) -------------

interface Simplified {
  pts: Position[];
  legsFt: number[];
  /** Turns sharper than SWITCHBACK_DEG between consecutive legs, and the shortest leg between two of them. */
  switchbacks: number;
  minLegBetweenFt: number | null;
}
function simplifyGradeChecked(ctx: RouteContext, cells: Position[], limitPct: number): Simplified {
  const xy = cells.map(toXY);
  const zc = xy.map((p) => zNearest(ctx, p)); // cell-centre elevations: the router's own
  const keep = new Uint8Array(xy.length);
  keep[0] = keep[xy.length - 1] = 1;
  const perp = (p: XY, a: XY, b: XY) => {
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    const L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  };
  const stack: [number, number][] = [[0, xy.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    if (j - i < 2) continue;
    let k = -1,
      dmax = -1;
    for (let m = i + 1; m < j; m++) {
      const dd = perp(xy[m]!, xy[i]!, xy[j]!);
      if (dd > dmax) {
        dmax = dd;
        k = m;
      }
    }
    const run = Math.hypot(xy[j]![0] - xy[i]![0], xy[j]![1] - xy[i]![1]);
    const grade = run ? (Math.abs(zc[j]! - zc[i]!) / run) * 100 : Infinity;
    if (dmax <= SIMPLIFY_EPS_M && grade <= limitPct + 1e-9) continue;
    keep[k] = 1;
    stack.push([i, k], [k, j]);
  }
  const idx = [...keep.keys()].filter((i) => keep[i]);
  const pts = idx.map((i) => cells[i]!);
  const legsFt = idx
    .slice(1)
    .map((v, n) => Math.hypot(xy[v]![0] - xy[idx[n]!]![0], xy[v]![1] - xy[idx[n]!]![1]) * M2FT);
  let switchbacks = 0,
    minLegBetweenFt: number | null = null,
    lastSb: number | null = null;
  for (let n = 1; n < idx.length - 1; n++) {
    const a = xy[idx[n - 1]!]!,
      b = xy[idx[n]!]!,
      c = xy[idx[n + 1]!]!;
    const h1 = Math.atan2(b[1] - a[1], b[0] - a[0]),
      h2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
    let dθ = Math.abs(((h2 - h1) * 180) / Math.PI) % 360;
    if (dθ > 180) dθ = 360 - dθ;
    if (dθ > SWITCHBACK_DEG) {
      switchbacks++;
      if (lastSb != null) {
        const between = legsFt.slice(lastSb, n).reduce((s, x) => s + x, 0);
        minLegBetweenFt = minLegBetweenFt == null ? between : Math.min(minLegBetweenFt, between);
      }
      lastSb = n;
    }
  }
  return { pts, legsFt, switchbacks, minLegBetweenFt };
}

// --- The prototype router: the same costs, a heading per state, a turn penalty and a switchback landing ----------

/** Today's 16 moves (driveway.ts NEIGHBOURS), and 32 with the (3,1) and (3,2) moves added. */
const MOVES16: XY[] = [
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
];
const MOVES32: XY[] = [
  ...MOVES16,
  ...([
    [3, 1],
    [3, 2],
    [1, 3],
    [2, 3],
  ].flatMap(([a, b]) => [
    [a!, b!],
    [a!, -b!],
    [-a!, b!],
    [-a!, -b!],
  ]) as XY[]),
];
interface MoveSet {
  moves: XY[];
  turn: number[][];
}
function moveSet(moves: XY[]): MoveSet {
  const heading = moves.map(([dr, dc]) => Math.atan2(-dr, dc));
  const turn = moves.map((_, a) =>
    moves.map((__, b) => {
      let d = Math.abs(((heading[b]! - heading[a]!) * 180) / Math.PI) % 360;
      if (d > 180) d = 360 - d;
      return (d / 45) * TURN_PER_45 + (d > SWITCHBACK_DEG ? SWITCHBACK_COST : 0);
    }),
  );
  return { moves, turn };
}
const SETS = { m16: moveSet(MOVES16), m32: moveSet(MOVES32) };

/** One route, entrance to target, with a heading per search state. Null when none fits the limit. */
function routeWithTurns(
  ctx: RouteContext,
  fromLL: [number, number],
  toLL: [number, number],
  maxGrade: number,
  wGrade: number,
  set: MoveSet,
): Position[] | null {
  const { moves: MOVES, turn: TURN } = set;
  const d = ctx.dFine,
    { w, h, z } = d,
    n = w * h,
    M = MOVES.length;
  const inside = ctx.inside,
    slope = ctx.slope,
    soil = ctx.soilMask(),
    acc = ctx.flowAcc();
  const streamCells = Math.round(K.streamContributingM2 / (d.res * d.resY));
  const [sx, sy] = UTM.fwd(fromLL[0], fromLL[1]);
  const [sr, sc] = utmToRC(d, sx, sy);
  const [tx, ty] = UTM.fwd(toLL[0], toLL[1]);
  const [tr, tc] = utmToRC(d, tx, ty);
  const inGrid = (r: number, c: number) => r >= 0 && c >= 0 && r < h && c < w;
  if (!inGrid(sr, sc) || !inGrid(tr, tc)) return null;
  const dst = tr * w + tc;
  const cellCost = (i: number) => {
    let f = 1 + K.crossSlopeFactor * Math.tan(((slope[i] || 0) * Math.PI) / 180);
    if (soil[i] === 1) f *= K.bottomlandFactor;
    else if (soil[i] === 2) f *= K.rockFactor;
    if (!inside[i]) f *= K.outsideFactor;
    return f;
  };
  // State s = cell * M + heading of the move that reached it; the start has no heading (index n * M).
  const dist = new Float64Array(n * M + 1).fill(Infinity),
    prev = new Int32Array(n * M + 1).fill(-1);
  const heap = new MinHeap();
  const start = n * M;
  dist[start] = 0;
  heap.push(0, start);
  let found = -1;
  while (heap.size) {
    const s = heap.pop(),
      dcur = heap.lastKey;
    if (dcur > dist[s]!) continue;
    const i = s === start ? sr * w + sc : Math.floor(s / M),
      hd = s === start ? -1 : s % M;
    if (i === dst) {
      found = s;
      break;
    }
    const r = (i / w) | 0,
      c = i % w;
    for (let m = 0; m < M; m++) {
      const [dr, dc] = MOVES[m]!;
      const rr = r + dr,
        cc = c + dc;
      if (!inGrid(rr, cc)) continue;
      const j = rr * w + cc;
      if (Number.isNaN(z[j]!)) continue;
      const len = Math.hypot(dr * d.res, dc * d.resY);
      const g = Math.abs(z[j]! - z[i]!) / len;
      if (g > maxGrade) continue;
      let cost = len * (1 + wGrade * (g / maxGrade) ** 2) * cellCost(j);
      if (acc[j]! >= streamCells && acc[i]! < streamCells) cost += K.crossingCost;
      if (hd >= 0) cost += TURN[hd]![m]!;
      const t = j * M + m;
      const nd = dcur + cost;
      if (nd < dist[t]!) {
        dist[t] = nd;
        prev[t] = s;
        heap.push(nd, t);
      }
    }
  }
  if (found < 0) return null;
  const cells: number[] = [];
  for (let s = found; s >= 0; s = prev[s]!) cells.push(s === start ? sr * w + sc : Math.floor(s / M));
  cells.reverse();
  return cells.map((i) => toLonLat([d.x0 + ((i % w) + 0.5) * d.res, d.y0 - (((i / w) | 0) + 0.5) * d.resY]));
}

// --- Drawings: a hillshade (embedded BMP), the parcel, and the routes --------------------------------------------

function bmpBase64(px: Uint8Array, W: number, H: number): string {
  const row = (W * 3 + 3) & ~3,
    size = 54 + row * H;
  const b = Buffer.alloc(size);
  b.write("BM", 0);
  b.writeUInt32LE(size, 2);
  b.writeUInt32LE(54, 10);
  b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18);
  b.writeInt32LE(-H, 22); // top-down
  b.writeUInt16LE(1, 26);
  b.writeUInt16LE(24, 28);
  b.writeUInt32LE(row * H, 34);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const v = px[y * W + x]!,
        o = 54 + y * row + x * 3;
      b[o] = b[o + 1] = b[o + 2] = v;
    }
  return b.toString("base64");
}

function drawing(
  ctx: RouteContext,
  parcel: Feature<Polygon>,
  title: string,
  lines: { pts: Position[]; colour: string; dash?: string; label: string }[],
  marks: { xy: XY; colour: string }[],
): string {
  const all = lines.flatMap((l) => l.pts.map(toXY));
  const pad = 80;
  const xs = all.map((p) => p[0]),
    ys = all.map((p) => p[1]);
  const x0 = Math.min(...xs) - pad,
    x1 = Math.max(...xs) + pad,
    y0 = Math.min(...ys) - pad,
    y1 = Math.max(...ys) + pad;
  const SIZE = 560;
  const scale = SIZE / Math.max(x1 - x0, y1 - y0);
  const Wpx = Math.round((x1 - x0) * scale),
    Hpx = Math.round((y1 - y0) * scale);
  // Hillshade at about 2 px per 3 m cell, sun from the north-west.
  const step = 2,
    gw = Math.ceil(Wpx / step),
    gh = Math.ceil(Hpx / step);
  const px = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy++)
    for (let gx = 0; gx < gw; gx++) {
      const x = x0 + ((gx + 0.5) * step) / scale,
        y = y1 - ((gy + 0.5) * step) / scale;
      const e = 3;
      const dzdx = (zBilinear(ctx, [x + e, y]) - zBilinear(ctx, [x - e, y])) / (2 * e);
      const dzdy = (zBilinear(ctx, [x, y + e]) - zBilinear(ctx, [x, y - e])) / (2 * e);
      const nx = -2 * dzdx, // 2× vertical exaggeration, so the slopes read
        ny = -2 * dzdy,
        nz = 1,
        nl = Math.hypot(nx, ny, nz);
      const lx = -0.5,
        ly = 0.5,
        lz = 0.707,
        ll = Math.hypot(lx, ly, lz);
      const shade = Math.max(0, (nx * lx + ny * ly + nz * lz) / (nl * ll));
      px[gy * gw + gx] = Math.round(40 + 215 * shade);
    }
  const sx = (p: XY) => ((p[0] - x0) * scale).toFixed(1),
    sy = (p: XY) => ((y1 - p[1]) * scale).toFixed(1);
  const path = (pts: Position[]) =>
    pts.map((p, i) => `${i ? "L" : "M"}${sx(toXY(p))},${sy(toXY(p))}`).join(" ");
  const ring = parcel.geometry.coordinates[0]!;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Wpx} ${Hpx + 60}" font-family="sans-serif" font-size="12">
<rect width="${Wpx}" height="${Hpx + 60}" fill="#fff"/>
<image href="data:image/bmp;base64,${bmpBase64(px, gw, gh)}" x="0" y="0" width="${Wpx}" height="${Hpx}" preserveAspectRatio="none" style="image-rendering:pixelated"/>
<path d="${path(ring)}" fill="none" stroke="#e08a00" stroke-width="2"/>
${lines.map((l) => `<path d="${path(l.pts)}" fill="none" stroke="${l.colour}" stroke-width="2.5"${l.dash ? ` stroke-dasharray="${l.dash}"` : ""}/>`).join("\n")}
${marks.map((m) => `<circle cx="${sx(m.xy)}" cy="${sy(m.xy)}" r="5" fill="none" stroke="${m.colour}" stroke-width="2"/>`).join("\n")}
<text x="8" y="${Hpx + 18}" font-weight="bold">${title}</text>
${lines.map((l, i) => `<line x1="${8 + i * 250}" x2="${36 + i * 250}" y1="${Hpx + 40}" y2="${Hpx + 40}" stroke="${l.colour}" stroke-width="3"${l.dash ? ` stroke-dasharray="${l.dash}"` : ""}/><text x="${42 + i * 250}" y="${Hpx + 44}">${l.label}</text>`).join("\n")}
<text x="${Wpx - 8}" y="${Hpx + 18}" text-anchor="end" fill="#666">parcel outline orange; circles: switchbacks; ${Math.round((x1 - x0) * M2FT)} ft across</text>
</svg>
`;
}

// --- The study -----------------------------------------------------------------------------------------------------

interface Cand {
  slug: string;
  rank: number;
  kind: "within" | "onParcel";
  scored: boolean;
  dw: SiteDriveway;
  route: Route;
}

const f1 = (x: number) => x.toFixed(1);
const ft = (x: number) => Math.round(x).toLocaleString("en-US");
const k$ = (x: number) => `$${Math.round(x / 1000)}k`;

describe.runIf(import.meta.env.MODE === "a4b-realism")("A4b router realism", () => {
  it(
    "writes the study",
    async () => {
      const cands: Cand[] = [];
      const ctxs = new Map<
        string,
        {
          ctx: RouteContext;
          parcel: Feature<Polygon>;
          limit: number;
          s: Awaited<ReturnType<typeof runFixture>>["session"];
          result: ScreenResult;
        }
      >();
      for (const slug of FIXTURE_SLUGS) {
        const { result, session: s } = await runFixture(slug);
        const ctx = routeContext(s);
        const limit = s.config.roadMaxGradePct;
        ctxs.set(slug, { ctx, parcel: s.parcel, limit, s, result });
        const sites = result.sites ?? [];
        const routes = siteDriveways(
          ctx,
          s.roads ?? [],
          s.parcel,
          sites.map((x) => x.ll),
          limit,
        );
        sites.forEach((site, i) => {
          const r = routes[i]!;
          const chosen = chooseDriveway(r);
          for (const [kind, dw] of [
            ["within", r.withinLimit],
            ["onParcel", r.onParcel],
          ] as const) {
            if (!dw?.route || (kind === "onParcel" && r.onParcel === r.withinLimit)) continue;
            cands.push({ slug, rank: site.rank, kind, scored: dw === chosen, dw, route: dw.route as Route });
          }
        });
      }

      // 0. The copy of the router's measure agrees with the router, route by route.
      for (const c of cands) {
        const { ctx } = ctxs.get(c.slug)!;
        const m = measureAlong(ctx, c.route.line.geometry.coordinates);
        expect(m.lengthFt).toBeCloseTo(c.route.metrics.lengthFt, 6);
        expect(m.cost / c.route.cost.mid).toBeCloseTo(1, 9);
        expect(m.switchbacks).toBe(c.route.metrics.switchbacks);
      }

      // 1. Measurement.
      const rows1 = cands.map((c) => {
        const { ctx, limit } = ctxs.get(c.slug)!;
        const line = c.route.line.geometry.coordinates;
        const near = profile(ctx, line, "nearest");
        const bil = profile(ctx, line, "bilinear");
        const cells = cellPath(c.route);
        const cellBil = profile(ctx, cells, "bilinear");
        const cap = c.dw.legal ? limit : Math.round(c.route.maxGrade * 100);
        return {
          c,
          cap,
          reported: c.route.metrics.maxGradePct,
          nearStep: stepMax(near),
          bilStep: stepMax(bil),
          win: WINDOWS.map((W) => windowMax(bil, W)),
          cellWin: WINDOWS.map((W) => windowMax(cellBil, W).pct),
        };
      });

      // 2. Zigzag inflation, and 3. the prototype router, on every candidate.
      const rows2 = cands.map((c) => {
        const { ctx, limit } = ctxs.get(c.slug)!;
        const cap = c.dw.legal ? limit : Math.round(c.route.maxGrade * 100);
        const before = measureAlong(ctx, c.route.line.geometry.coordinates);
        const simp = simplifyGradeChecked(ctx, cellPath(c.route), cap);
        const after = measureAlong(ctx, simp.pts);
        return {
          c,
          cap,
          before,
          simp,
          after,
          simpWin: WINDOWS.map((W) => windowMax(profile(ctx, simp.pts, "bilinear"), W).pct),
        };
      });

      type Proto = { pts: Position[]; ms: number; simp: Simplified; m: Measured; win: number[] } | null;
      const protos = { m16: new Map<Cand, Proto>(), m32: new Map<Cand, Proto>() };
      for (const key of ["m16", "m32"] as const)
        for (const c of cands) {
          const { ctx, s, limit } = ctxs.get(c.slug)!;
          const cap = c.dw.legal ? limit : Math.round(c.route.maxGrade * 100);
          const ent = entranceCandidates(s.roads ?? [], s.parcel, ctx.dFine).entrances[c.dw.entranceIndex!]!;
          const to = c.route.line.geometry.coordinates.at(-1)!;
          const t0 = performance.now();
          const cells = routeWithTurns(
            ctx,
            ent.ll,
            [to[1]!, to[0]!],
            cap / 100,
            c.route.label === K.gentlest.label ? K.gentlest.wGrade : K.shortest.wGrade,
            SETS[key],
          );
          const ms = performance.now() - t0;
          if (!cells) {
            protos[key].set(c, null);
            continue;
          }
          const simp = simplifyGradeChecked(ctx, cells, cap);
          protos[key].set(c, {
            pts: simp.pts,
            ms,
            simp,
            m: measureAlong(ctx, simp.pts),
            win: WINDOWS.map((W) => windowMax(profile(ctx, simp.pts, "bilinear"), W).pct),
          });
        }
      const proto = protos.m32;

      // 4. The veto, on the 30 m window of the smoothed route (§1's measure).
      const win30 = (c: Cand) => rows1.find((r) => r.c === c)!.win[1]!.pct;
      const sites = [...new Set(cands.map((c) => `${c.slug}#${c.rank}`))];
      const vetoRows = sites.map((key) => {
        const cs = cands.filter((c) => `${c.slug}#${c.rank}` === key);
        const ok = cs.filter((c) => win30(c) <= VETO_PCT);
        const scored = cs.find((c) => c.scored)!;
        const pick = ok.length
          ? ok.reduce((a, b) => (drivewayPoints(b.dw) < drivewayPoints(a.dw) ? b : a))
          : cs.reduce((a, b) => (win30(b) < win30(a) ? b : a));
        return { key, cs, ok, scored, pick, noPractical: !ok.length };
      });

      // Drawings: Grayson #1, Grayson #2 and Macks #2, before and after, each scored candidate and the other.
      const DRAW = [
        ["grayson-mud-creek-6273", 1],
        ["grayson-mud-creek-6273", 2],
        ["macks-mountain-35-3", 2],
      ] as const;
      const svgs: string[] = [];
      for (const [slug, rank] of DRAW)
        for (const c of cands.filter((x) => x.slug === slug && x.rank === rank)) {
          const { ctx, parcel } = ctxs.get(slug)!;
          const p = proto.get(c);
          const name = `a4b-${slug.split("-")[0]}-${rank}-${c.kind}`;
          const sb = (pts: Position[]) => {
            const xy = pts.map(toXY);
            const out: { xy: XY; colour: string }[] = [];
            for (let n = 1; n < xy.length - 1; n++) {
              const a = xy[n - 1]!,
                b = xy[n]!,
                cc = xy[n + 1]!;
              let d =
                Math.abs(
                  ((Math.atan2(cc[1] - b[1], cc[0] - b[0]) - Math.atan2(b[1] - a[1], b[0] - a[0])) * 180) /
                    Math.PI,
                ) % 360;
              if (d > 180) d = 360 - d;
              if (d > SWITCHBACK_DEG) out.push({ xy: b, colour: "#1f5fd6" });
            }
            return out;
          };
          writeFileSync(
            `docs/studies/${name}.svg`,
            drawing(
              ctx,
              parcel,
              `${slug.split("-")[0]} #${rank}, ${c.kind === "within" ? "within the limit" : "kept to the parcel"}`,
              [
                {
                  pts: c.route.line.geometry.coordinates,
                  colour: "#d62728",
                  label: "today's router (as drawn)",
                },
                ...(p
                  ? [{ pts: p.pts, colour: "#1f5fd6", label: "proposal: 32 moves, turn costs, smoothing" }]
                  : []),
              ],
              p ? sb(p.pts) : [],
            ),
          );
          svgs.push(name);
        }

      // The report.
      const label = (c: Cand) =>
        `${c.slug.split("-")[0]} #${c.rank} ${c.kind === "within" ? "within" : "on parcel"}${c.route.needsEasement ? ", easement" : ""}${c.scored ? " **(scored)**" : ""}`;
      const gn = rows1.find(
        (r) => r.c.slug.startsWith("grayson") && r.c.rank === 1 && r.c.kind === "within",
      )!;
      const t1 = rows1
        .map(
          (r) =>
            `| ${label(r.c)} | ${r.cap}% | ${f1(r.reported)} | ${f1(r.bilStep)} | ${r.win.map((w) => f1(w.pct)).join(" | ")} | ${r.cellWin.map(f1).join(" / ")} |`,
        )
        .join("\n");
      const t2 = rows2
        .map((r) => {
          const dl = (r.after.lengthFt / r.before.lengthFt - 1) * 100,
            dc = (r.after.cost / r.before.cost - 1) * 100;
          return `| ${label(r.c)} | ${ft(r.before.lengthFt)} | ${ft(r.after.lengthFt)} | ${f1(dl)}% | ${k$(r.before.cost)} → ${k$(r.after.cost)} (${f1(dc)}%) | ${r.simp.legsFt.length} | ${r.simpWin.map(f1).join(" / ")} |`;
        })
        .join("\n");
      const legMin = (x: number | null) => (x == null ? "—" : ft(x));
      const t3 = cands
        .map((c) => {
          const b = rows2.find((r) => r.c === c)!;
          const p16 = protos.m16.get(c) ?? null,
            p32 = protos.m32.get(c) ?? null;
          const cell = (p: Proto, f: (q: NonNullable<Proto>) => string) => (p ? f(p) : "none");
          return `| ${label(c)} | ${ft(b.after.lengthFt)} / ${cell(p16, (p) => ft(p.m.lengthFt))} / ${cell(p32, (p) => ft(p.m.lengthFt))} | ${k$(b.after.cost)} / ${cell(p16, (p) => k$(p.m.cost))} / ${cell(p32, (p) => k$(p.m.cost))} | ${b.simp.switchbacks} / ${cell(p16, (p) => String(p.simp.switchbacks))} / ${cell(p32, (p) => String(p.simp.switchbacks))} | ${legMin(b.simp.minLegBetweenFt)} / ${cell(p16, (p) => legMin(p.simp.minLegBetweenFt))} / ${cell(p32, (p) => legMin(p.simp.minLegBetweenFt))} | ${f1(b.simpWin[1]!)} / ${cell(p16, (p) => f1(p.win[1]!))} / ${cell(p32, (p) => f1(p.win[1]!))} | ${cell(p16, (p) => (p.ms / 1000).toFixed(2))} / ${cell(p32, (p) => (p.ms / 1000).toFixed(2))} s |`;
        })
        .join("\n");
      const sum = (key: "m16" | "m32", slug: string) =>
        [...protos[key].entries()]
          .filter(([c, p]) => c.slug === slug && p)
          .reduce((t, [, p]) => t + p!.ms, 0) / 1000;
      const timing = FIXTURE_SLUGS.map(
        (slug) =>
          `${slug.split("-")[0]} ${sum("m16", slug).toFixed(1)} s (16 moves) / ${sum("m32", slug).toFixed(1)} s (32)`,
      ).join(", ");
      const t4 = vetoRows
        .map(
          (v) =>
            `| ${v.key.replace(/-[^#]*#/, " #")} | ${v.cs.map((c) => `${c.kind === "within" ? "within" : "on parcel"} ${f1(win30(c))}%${win30(c) > VETO_PCT ? " **vetoed**" : ""}`).join("; ")} | ${v.scored.kind === "within" ? "within" : "on parcel"} | ${v.noPractical ? `**no practical route found**; least-bad: ${v.pick.kind}` : v.pick === v.scored ? "same" : `**${v.pick.kind === "within" ? "within" : "on parcel"}**`} |`,
        )
        .join("\n");
      const vetoed = vetoRows.filter((v) => v.ok.length < v.cs.length).length;
      const flips = vetoRows.filter((v) => v.pick !== v.scored).length;
      const noPractical = vetoRows.filter((v) => v.noPractical).length;
      const dL = (r: (typeof rows2)[number]) => (r.after.lengthFt / r.before.lengthFt - 1) * 100;
      const dC = (r: (typeof rows2)[number]) => (r.after.cost / r.before.cost - 1) * 100;
      const rng = (xs: number[]) => `${f1(Math.min(...xs))}% to ${f1(Math.max(...xs))}%`;
      const isG = (c: Cand) => c.slug.startsWith("grayson");
      const fmRows = rows2.filter((r) => !isG(r.c)),
        gRows = rows2.filter((r) => isG(r.c));
      const find = (slug: string, rank: number, kind: Cand["kind"]) =>
        cands.find((c) => c.slug.startsWith(slug) && c.rank === rank && c.kind === kind)!;
      const g1w = find("grayson", 1, "within"),
        m2 = find("macks", 2, "within");
      const sb = (c: Cand) => ({
        today: rows2.find((r) => r.c === c)!.simp.switchbacks,
        m16: protos.m16.get(c)?.simp.switchbacks,
        m32: protos.m32.get(c)?.simp.switchbacks,
        leg32: protos.m32.get(c)?.simp.minLegBetweenFt ?? null,
      });
      const shortLegs = cands.filter((c) => {
        const l = protos.m32.get(c)?.simp.minLegBetweenFt;
        return l != null && l < MIN_LEG_FT;
      });
      const win32 = cands.map((c) => protos.m32.get(c)?.win[1]).filter((x): x is number => x != null);
      const maxSum32 = Math.max(...FIXTURE_SLUGS.map((s) => sum("m32", s)));

      const md = `# A4b: the driveway router's realism (report only)

Batch A, A4b (owner, 2026-10-09). Generated by \`pnpm a4b:realism\` (\`test/tools/a4b-realism.test.ts\`) from the
three fixtures as the pipeline runs today (engine 8). Nothing in \`lib/\` changes: the route quantities are re-measured
by a copy of the router's formula, checked equal to the router's own on all ${cands.length} candidate routes (length to
1e-6 ft, cost to 1e-9 relative, switchbacks exactly) before anything below is computed.

Every candidate is listed: each ranked site's route within the limit, and its route kept to the parcel where that's a
different route (Grayson's four). "(scored)" marks the one the site is scored on.

## 1. The reported maximum grade, measured the way the limit is enforced

**How the limit is enforced.** The router (\`routeMany\`) moves between 3 m DEM cell centres in 16 directions: 8
neighbours and 8 knight's moves, 3.0, 4.2 and 6.7 m long. A move is allowed only when the rise between its two cell
centres, over the move's length, is within the limit. The elevations in between are never looked at, and nothing is
smoothed.

**How the max grade is measured.** After routing, the cell path is smoothed once (Chaikin, cutting each corner), and the
smoothed line is sampled every 3 m. Each sample takes the elevation of the cell it falls in (nearest cell, no
interpolation). The reported maximum is the steepest pair of consecutive samples.

The two can't agree:

- **Nearest-cell sampling.** A 3 m sample on a 3 m grid either stays in the same cell (0%) or steps a whole cell. On a
  side slope the smoothed line drifts up to about a metre off the cells the router checked, and the next sample can land
  in the cell above or below the path, 2–3 m higher or lower. That reads as a 50%-plus "grade" over 3 m on a path that
  runs across the slope.
- **The smoothing shortens the zigzag.** Where the slope is steeper than the limit, the router climbs by alternating two
  directions (for example 27° and 45° off the contour), each move within the limit. Smoothing cuts those corners, so the
  same rise is spread over less distance. Over 15–30 m the smoothed line really is steeper than the limit: up to
  ${f1(Math.max(...rows1.map((r) => r.win[1]!.pct)))}% over 30 m across all the candidates.
- **Even the router's own cell path goes slightly over the limit** when its ground is read between cell centres (last
  column: up to ${f1(Math.max(...rows1.map((r) => r.cellWin[0]!)))}% over 15 m). A 6.7 m knight's move only compares
  its two end cells, and it crosses terrain the router never sees.

**Grayson's route through the neighbours (#1's, within 10%, the one in your screenshot):**
- **Reported today:** ${f1(gn.reported)}%.
- **With interpolated elevations:** the steepest 3 m step is ${f1(gn.bilStep)}%.
- **Over windows:** ${f1(gn.win[0]!.pct)}% over 15 m (at ${Math.round(gn.win[0]!.at)} m along), ${f1(gn.win[1]!.pct)}%
  over 30 m, ${f1(gn.win[2]!.pct)}% over 60 m.

The 58% sample is about 276 m along, off the parcel, where the route runs across a 17–27° side slope. The sample read
the cell above the path, so it is not a 58% grade. The ${f1(gn.win[0]!.pct)}% over 15 m is real, though: it's the
smoothing taking the zigzag out.

**The fix (proposed for the implementation):** report, and later veto on, the grade over set distances along the
smoothed route, with elevations interpolated between cell centres. The windows are 15, 30 and 60 m, with 30 m as the
headline. The steepest single 3 m step stops being reported.

| Candidate | Limit or needed | Reported max (3 m, nearest cell) | 3 m, interpolated | 15 m | 30 m | 60 m | The router's cell path, 15 / 30 / 60 m |
|---|---|---|---|---|---|---|---|
${t1}

All grades are in percent. The windows are on the smoothed line, with interpolated elevations.

## 2. Zigzag inflation: the reported length is short, not long

**What's compared.** The router's reported length (the smoothed line) against a simplified alignment. The simplified
alignment is the router's cell path through Douglas–Peucker, kept within ${SIMPLIFY_EPS_M} m of it, with every straight
leg's grade checked against the limit (endpoint to endpoint) and split again where it's too steep. That's an alignment a
dozer can follow at the grade limit. Length and cost are both measured with the router's formula. The cost includes the
fixed charges (mobilisation, entrance, erosion control), so it moves less than the length.

**The zigzag isn't inflating the length; the smoothing is deflating it.** Where the slope is gentle, the simplified
alignment is about as long as the reported one. Where it's steep, holding the limit on straight legs keeps most of the
switching, and the alignment is longer than the reported line:

| Where | Length | Cost |
|---|---|---|
| Ferney and Macks | ${rng(fmRows.map(dL))} | ${rng(fmRows.map(dC))} |
| Grayson | ${rng(gRows.map(dL))} | ${rng(gRows.map(dC))} |

So today's length and cost understate the steep routes, and the 30 m grade is overstated (§1).

| Candidate | Router length (ft) | Simplified (ft) | Length | Cost (mid) | Legs | Simplified, 15 / 30 / 60 m grade |
|---|---|---|---|---|---|---|
${t2}

## 3. A router proposal

Prototyped here (\`routeWithTurns\`), not in the engine. Each search state carries the heading it arrived on:

- **A turn penalty:** a change of heading costs ${TURN_PER_45} m of base cost per 45°.
- **A switchback landing:** a turn sharper than ${SWITCHBACK_DEG}° costs another ${SWITCHBACK_COST} m, since a landing
  has to be built.
- **32 directions instead of 16:** adds the (3,1) and (3,2) moves, at 18° and 34° off the axes. With today's 16, the
  only way to hold the limit at an angle in between is to alternate two directions. A turn penalty alone can't remove
  that zigzag; it only trades it for a longer route. The 16-direction column below shows this.
- **Post-route smoothing with a grade re-check:** §2's simplification of the new path. Length and cost are measured on
  the smoothed path.

Each column below reads "today simplified / 16 directions with turn costs / 32 directions with turn costs", all three
after §2's smoothing:

| Candidate | Length (ft) | Cost (mid) | Switchbacks | Shortest leg between switchbacks (ft) | 30 m grade | Routing time |
|---|---|---|---|---|---|---|
${t3}

**Results with 32 directions:**
- **Far fewer switchbacks:**
  - Grayson's route through the neighbours: ${sb(g1w).today} → ${sb(g1w).m32}.
  - Macks #2: ${sb(m2).today} → ${sb(m2).m32}, with ${legMin(sb(m2).leg32)} ft as the shortest leg between switchbacks.
- **Lengths:** about today's simplified alignment, or shorter.
- **Short legs remain:** ${shortLegs.length ? `${shortLegs.length} candidate${shortLegs.length === 1 ? "" : "s"} still ha${shortLegs.length === 1 ? "s" : "ve"} a leg under ${MIN_LEG_FT} ft between switchbacks (${shortLegs.map(label).join("; ")})` : `no candidate has a leg under ${MIN_LEG_FT} ft between switchbacks`}.

**What the prototype doesn't do yet:**
- **Enforce the ${MIN_LEG_FT} ft minimum leg.** The search would have to carry the distance since the last switchback,
  or a second pass would repair short legs.
- **Check a switchback's radius.** That needs the terrain over the landing's footprint at each switchback.
- **Check the ground under a long move.** A 3-cell move compares only its end cells, 9.5 m apart, so it can step over a
  bank. Some of the shorter Grayson routes may be using that. The implementation would check the cells it crosses.

**Grade on the ground vs the road's grade.** The proposal's legs hold the limit endpoint to endpoint, but the ground
along a straight leg undulates: ${rng(win32)} over 30 m on the ground under the 32-direction alignments. A built road
grades that out with cut and fill. So the veto's measure (§4) should probably read the road's designed profile (the legs)
once the router designs one, and the ground until then. That's a question for you.

**Routing time.**
- **Prototype, one route at a time:** per fixture, ${timing}.
- **Today, every site's two candidates in one multi-target pass:** 0.20, 0.48 and 0.23 s.
- **In the engine:** today's shared multi-target search (one pass per entrance and style for every site) would
  recover much of that, but a heading per state and 32 directions mean 32 times the states and twice the moves per state. The slowest
  fixture took ${f1(maxSum32)} s one route at a time with 32 directions, so staying inside the 5 s budget likely
  needs A* toward the targets, or headings kept only for the 16 nearest moves. The implementation would measure it.

**Drawings.** The background is a hillshade from the 3 m DEM. Red is today's route as drawn; blue is the 32-direction
proposal after smoothing, with its switchbacks circled.

${svgs.map((s) => `![${s}](${s}.svg)`).join("\n\n")}

## 4. The veto: \`driveway.vetoGradePct\` = ${VETO_PCT} over a 30 m window

The rule (owner, #89 review): a candidate whose grade over a 30 m window goes above ${VETO_PCT}% isn't eligible, whatever
its cost. If every candidate is vetoed, the least-bad one is shown under a "no practical route found" flag. Simulated
with §1's measure (the smoothed route, interpolated elevations):

| Site | Candidates, 30 m grade | Scored today | With the veto |
|---|---|---|---|
${t4}

${vetoed ? `${vetoed} site${vetoed === 1 ? "" : "s"} lose a candidate to the veto, ${flips} would be scored on the other one, and ${noPractical} would have no practical route.` : `**No fixture candidate is vetoed.** The steepest 30 m window on any of them is ${f1(Math.max(...cands.map(win30)))}%, under ${VETO_PCT}%.`}

**Grayson's route through the neighbours:** ${f1(gn.win[0]!.pct)} / ${f1(gn.win[1]!.pct)} / ${f1(gn.win[2]!.pct)}% over
15 / 30 / 60 m, against ${f1(gn.reported)}% reported today. The veto ${gn.win[1]!.pct > VETO_PCT ? "**would remove it**" : "**would not remove it**"}.

The veto is aimed at the case you named, a 22% route at $50k beating an easement route at $300k. On the three fixtures
it removes nothing, because no fixture route is that steep once it's measured this way.

## 5. What implementation would change (for your go)

1. **Measure.** The route's reported grades become the 15, 30 and 60 m windows above: the driveway card's "Grade, max /
   average" row and the over-limit stretches. A declared numbers change, with the report text appended, not replaced
   (rule 7).
2. **Veto.** \`driveway.vetoGradePct\` = ${VETO_PCT} goes in \`config.ts\` and Settings, and applies to both candidates
   before \`chooseDriveway\`. "No practical route found" becomes a flag.
3. **Router:**
   - 32 directions, with the cells under each long move checked;
   - the heading-aware turn penalty and the switchback landing;
   - the post-route smoothing with its grade re-check;
   - length and cost taken from the smoothed path;
   - the multi-target search kept, with A* or a reduced heading set to stay in the 5 s budget.
   - **Constants to settle with you:**
     - ${TURN_PER_45} m per 45° of turn;
     - ${SWITCHBACK_COST} m per switchback;
     - the ${MIN_LEG_FT} ft minimum leg (enforced);
     - a switchback radius. Fire-access codes often ask for about 25–30 ft inside radius; follow-up 46 checks the six
       counties.
4. **Your question:** the veto and the reported grade read the ground under the route (as now) or, once the router
   designs legs, the road's designed profile.
5. **Unit costs** stay as they are until follow-up 47, which calibrates them against the corrected lengths. §2 shows
   the steep routes' lengths rising by up to ${f1(Math.max(...gRows.map(dL)))}%.
`;
      writeFileSync(DOC, md);
    },
    60 * 60_000,
  );
});
