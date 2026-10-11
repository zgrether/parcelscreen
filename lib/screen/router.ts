/**
 * The driveway router's search (A4b PR B; owner, #91 review, 2026-10-10). driveway.ts measures what it finds.
 *
 * Each search state is a cell and the heading of the move that reached it, so turns can be priced and limited:
 * - **32 directions**: the 8 neighbours, the 8 knight's moves, and (3,1) and (3,2) in every octant. With 16, the only
 *   way to hold a grade between two directions was to alternate them, a zigzag no turn cost could remove.
 * - **The ground under every move**: a move longer than one cell also checks the ground where it crosses each cell
 *   between its ends (elevations interpolated): at most `moveCutFillM` off the move's straight line, so it can't
 *   step over a bank its two end cells don't show.
 * - **Turns** cost `turnCostPer45M` metres of the router's base cost per 45° of heading change.
 * - **A switchback** is a heading change of `switchbackTurnDeg` or more between the road `turnWindowM` before a point
 *   and `turnWindowM` after it (owner, 2026-10-10). Ordinary bends stay under that: no more than
 *   `switchbackTurnDeg` per twice `turnWindowM` of road, move by move.
 * - **Every switchback is a landing**: an arc of `switchbackRadiusFt` at the road's centreline, then a straight leg of
 *   at least `minLegFt` before anything else, so two switchbacks are never closer than `minLegFt`; it costs
 *   `landingCostM` more. The landing is a graded bench: the road holds the grade limit through the arc and the leg,
 *   with the ground at most `landingCutFillM` above or below it (the radius checked against the terrain), and no
 *   landing where the natural side slope under the arc is over `landingMaxSideSlopeDeg`. Landings are tried only
 *   where the ground is steeper than the grade limit: anywhere else a bend climbs as well.
 *
 * The search is A* toward the nearest site not yet reached, with the straight-line distance as the estimate (every
 * cost factor is at least 1, so it never overestimates), and one pass per entrance and style reaches every site.
 *
 * `smoothPath` then simplifies the routed path (within `smoothEpsM`, each straight leg's grade re-checked end to end);
 * driveway.ts measures length, cost and grade on that line.
 */
import { SCREEN_CONSTANTS } from "./config";
import type { Dem } from "./types";
import { M2FT } from "./util";

const K = SCREEN_CONSTANTS.driveway;

/**
 * Binary min-heap of (key, value) pairs (proto MinHeap). Typed arrays rather than [key, value] tuples (A3b): the
 * router pushes millions of entries a screen. The comparisons and sifting are the prototype's.
 */
export class MinHeap {
  private k = new Float64Array(1024);
  private v = new Int32Array(1024);
  private n = 0;
  /** The key of the entry the last pop returned. */
  lastKey = 0;
  push(key: number, value: number): void {
    if (this.n === this.k.length) {
      const k = new Float64Array(this.n * 2),
        v = new Int32Array(this.n * 2);
      k.set(this.k);
      v.set(this.v);
      this.k = k;
      this.v = v;
    }
    const K = this.k,
      V = this.v;
    let i = this.n++;
    K[i] = key;
    V[i] = value;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (K[p]! <= K[i]!) break;
      const tk = K[p]!,
        tv = V[p]!;
      K[p] = K[i]!;
      V[p] = V[i]!;
      K[i] = tk;
      V[i] = tv;
      i = p;
    }
  }
  /** Removes the smallest entry and returns its value; its key is then `lastKey`. */
  pop(): number {
    const K = this.k,
      V = this.v;
    this.lastKey = K[0]!;
    const top = V[0]!;
    const n = --this.n;
    if (n) {
      K[0] = K[n]!;
      V[0] = V[n]!;
      this.siftDown(0);
    }
    return top;
  }
  /** Gives every entry a new key (an infinite one drops it) and restores the order: A* when its targets change. */
  rekey(keyOf: (value: number) => number): void {
    const K = this.k,
      V = this.v;
    let m = 0;
    for (let i = 0; i < this.n; i++) {
      const key = keyOf(V[i]!);
      if (key === Infinity) continue;
      K[m] = key;
      V[m++] = V[i]!;
    }
    this.n = m;
    for (let i = (m >> 1) - 1; i >= 0; i--) this.siftDown(i);
  }
  private siftDown(start: number): void {
    const K = this.k,
      V = this.v,
      n = this.n;
    let i = start;
    for (;;) {
      const l = 2 * i + 1,
        r = l + 1;
      let m = i;
      if (l < n && K[l]! < K[m]!) m = l;
      if (r < n && K[r]! < K[m]!) m = r;
      if (m === i) break;
      const tk = K[m]!,
        tv = V[m]!;
      K[m] = K[i]!;
      V[m] = V[i]!;
      K[i] = tk;
      V[i] = tv;
      i = m;
    }
  }
  get size(): number {
    return this.n;
  }
}

/** The 32 moves, as (rows, columns): rows increase southward. */
export const MOVES: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
  ...[
    [2, 1],
    [1, 2],
    [3, 1],
    [1, 3],
    [3, 2],
    [2, 3],
  ].flatMap(([a, b]) => [
    [a!, b!],
    [a!, -b!],
    [-a!, b!],
    [-a!, -b!],
  ]),
] as [number, number][];

const FT2M = 1 / M2FT;
const DEG = Math.PI / 180;

/** A switchback landing from heading `a` to heading `b`: the arc and the leg, as offsets from the turn's cell. */
interface Landing {
  id: number;
  a: number;
  b: number;
  turnDeg: number;
  /** Sample points along the arc then the leg (fractional rows and columns from the turn's cell); the last is a cell. */
  r: Float64Array;
  c: Float64Array;
  /** Distance from the previous sample (the first from the turn's cell), metres. */
  seg: Float64Array;
  /** Distance along the landing to each sample, metres. */
  cum: Float64Array;
  /** The last arc sample's index: the landing's turn ends there and its straight leg begins. */
  arcEnd: number;
  arcLen: number;
  er: number;
  ec: number;
  lenM: number;
}

interface MoveTable {
  len: Float64Array;
  /** Per move, the points where it crosses the cells between its ends (fractions of the move), for the ground check. */
  sub: number[][];
  /** Per heading (and the start, index M), the headings an ordinary move may take next, and the turn's cost. */
  next: number[][];
  turnCost: Float64Array;
  /** Per heading, the landings that leave it. */
  landings: Landing[][];
  byId: Landing[];
  /** The longest landing, metres. */
  maxLandingM: number;
}

const tables = new Map<string, MoveTable>();

/** Signed smallest rotation from angle a to angle b, radians, in (-π, π]. */
function rotation(a: number, b: number): number {
  let d = (b - a) % (2 * Math.PI);
  if (d <= -Math.PI) d += 2 * Math.PI;
  if (d > Math.PI) d -= 2 * Math.PI;
  return d;
}

/** The move table for a grid's cell size (cached: every screen's fine DEM is close to 3 m). */
export function moveTable(res: number, resY: number): MoveTable {
  const key = `${res},${resY}`;
  const hit = tables.get(key);
  if (hit) return hit;
  const M = MOVES.length;
  const vec = MOVES.map(([dr, dc]) => [dc * res, -dr * resY] as const); // metres east, north
  const len = Float64Array.from(vec, ([x, y]) => Math.hypot(x, y));
  const ang = vec.map(([x, y]) => Math.atan2(y, x));
  // Where a move crosses the rows and columns of cell centres between its ends, as fractions of the move: a
  // (3, 2) move crosses two rows (1/3, 2/3) and a column (1/2).
  const sub = MOVES.map(([dr, dc]) => {
    const at = new Set<number>();
    for (const n of [Math.abs(dr), Math.abs(dc)]) for (let k = 1; k < n; k++) at.add(k / n);
    return [...at].sort((x, y) => x - y);
  });
  const sbDeg = K.switchbackTurnDeg,
    legM = K.minLegFt * FT2M,
    radiusM = K.switchbackRadiusFt * FT2M;
  // An ordinary bend turns less than switchbackTurnDeg across the switchback window (turnWindowM either side of a
  // point): the heading may change by each move pair's length over this radius, no faster.
  const bendRadiusM = (2 * K.turnWindowM) / (sbDeg * DEG);
  const turnCost = new Float64Array((M + 1) * M);
  const next: number[][] = [];
  for (let a = 0; a <= M; a++) {
    const list: number[] = [];
    for (let b = 0; b < M; b++) {
      if (a === M) {
        list.push(b); // the start: any first move
        continue;
      }
      const t = Math.abs(rotation(ang[a]!, ang[b]!));
      turnCost[a * M + b] = (t / DEG / 45) * K.turnCostPer45M;
      if (t / DEG > sbDeg) continue;
      if (t > (len[a]! + len[b]!) / 2 / bendRadiusM + 1e-9) continue;
      list.push(b);
    }
    next.push(list);
  }
  const step = K.profileStepM;
  const landings: Landing[][] = Array.from({ length: M }, () => []);
  const byId: Landing[] = [];
  for (let a = 0; a < M; a++) {
    const [ux, uy] = [Math.cos(ang[a]!), Math.sin(ang[a]!)];
    for (let b = 0; b < M; b++) {
      const rot = rotation(ang[a]!, ang[b]!);
      if (Math.abs(rot) / DEG <= sbDeg) continue;
      // A reversal can turn either way; any other switchback turns the short way round.
      const turns = Math.abs(rot) > Math.PI - 1e-9 ? [Math.PI, -Math.PI] : [rot];
      for (const t of turns) {
        const s = Math.sign(t);
        const cx = -s * radiusM * uy,
          cy = s * radiusM * ux; // the centre, on the inside of the turn
        const th0 = Math.atan2(-cy, -cx);
        const pts: [number, number][] = [];
        const nArc = Math.max(1, Math.ceil((radiusM * Math.abs(t)) / step));
        for (let k = 1; k <= nArc; k++) {
          const th = th0 + (t * k) / nArc;
          pts.push([cx + radiusM * Math.cos(th), cy + radiusM * Math.sin(th)]);
        }
        const [ex, ey] = pts[nArc - 1]!;
        const bx = Math.cos(ang[a]! + t),
          by = Math.sin(ang[a]! + t);
        // The leg ends on a cell at least the minimum leg from the arc's end.
        let er = 0,
          ec = 0;
        for (let extra = 0; ; extra += Math.max(res, resY)) {
          ec = Math.round((ex + (legM + extra) * bx) / res);
          er = Math.round(-(ey + (legM + extra) * by) / resY);
          if (Math.hypot(ec * res - ex, -er * resY - ey) >= legM) break;
        }
        const fx = ec * res,
          fy = -er * resY;
        const legLen = Math.hypot(fx - ex, fy - ey);
        const nLeg = Math.max(1, Math.ceil(legLen / step));
        for (let k = 1; k < nLeg; k++) pts.push([ex + ((fx - ex) * k) / nLeg, ey + ((fy - ey) * k) / nLeg]);
        pts.push([fx, fy]);
        const r = new Float64Array(pts.length),
          c = new Float64Array(pts.length),
          seg = new Float64Array(pts.length),
          cum = new Float64Array(pts.length);
        let px = 0,
          py = 0,
          lenM = 0;
        pts.forEach(([x, y], k) => {
          c[k] = x / res;
          r[k] = -y / resY;
          seg[k] = Math.hypot(x - px, y - py);
          lenM += seg[k]!;
          cum[k] = lenM;
          [px, py] = [x, y];
        });
        c[pts.length - 1] = ec;
        r[pts.length - 1] = er;
        const L: Landing = {
          id: byId.length,
          a,
          b,
          turnDeg: Math.abs(t) / DEG,
          r,
          c,
          seg,
          cum,
          arcEnd: nArc - 1,
          arcLen: cum[nArc - 1]!,
          er,
          ec,
          lenM,
        };
        byId.push(L);
        landings[a]!.push(L);
      }
    }
  }
  const maxLandingM = Math.max(...byId.map((L) => L.lenM));
  const table: MoveTable = { len, sub, next, turnCost, landings, byId, maxLandingM };
  tables.set(key, table);
  return table;
}

/**
 * Points at fixed offsets from a cell (a long move's crossings, a landing's arc and leg), ready for one grid width:
 * each point's bilinear corner (as an index offset), its weights, and its nearest cell. Every point is read the same
 * way from every cell, so this is worked out once per grid.
 */
interface Probe {
  o00: Int32Array;
  dc: Int32Array;
  dr: Int32Array;
  w00: Float64Array;
  w01: Float64Array;
  w10: Float64Array;
  w11: Float64Array;
  near: Int32Array;
  nr: Int32Array;
  nc: Int32Array;
  /** Rows and columns the probe reaches from its cell (corners and nearest cells): a cell inside these is safe. */
  minR: number;
  maxR: number;
  minC: number;
  maxC: number;
}

function probe(rows: ArrayLike<number>, cols: ArrayLike<number>, w: number): Probe {
  const k = rows.length;
  const p: Probe = {
    o00: new Int32Array(k),
    dc: new Int32Array(k),
    dr: new Int32Array(k),
    w00: new Float64Array(k),
    w01: new Float64Array(k),
    w10: new Float64Array(k),
    w11: new Float64Array(k),
    near: new Int32Array(k),
    nr: new Int32Array(k),
    nc: new Int32Array(k),
    minR: 0,
    maxR: 0,
    minC: 0,
    maxC: 0,
  };
  for (let n = 0; n < k; n++) {
    const rr = rows[n]!,
      cc = cols[n]!;
    const r0 = Math.floor(rr),
      c0 = Math.floor(cc);
    const fr = rr - r0,
      fc = cc - c0;
    p.o00[n] = r0 * w + c0;
    p.dc[n] = fc > 0 ? 1 : 0;
    p.dr[n] = fr > 0 ? w : 0;
    p.w00[n] = (1 - fr) * (1 - fc);
    p.w01[n] = (1 - fr) * fc;
    p.w10[n] = fr * (1 - fc);
    p.w11[n] = fr * fc;
    p.nr[n] = Math.round(rr);
    p.nc[n] = Math.round(cc);
    p.near[n] = p.nr[n]! * w + p.nc[n]!;
    p.minR = Math.min(p.minR, r0, p.nr[n]!);
    p.maxR = Math.max(p.maxR, r0 + (fr > 0 ? 1 : 0), p.nr[n]!);
    p.minC = Math.min(p.minC, c0, p.nc[n]!);
    p.maxC = Math.max(p.maxC, c0 + (fc > 0 ? 1 : 0), p.nc[n]!);
  }
  return p;
}

interface GridProbes {
  /** Per move, its crossings (none for a one-cell move). */
  moves: Probe[];
  /** Per landing (by id), its arc and leg samples, and each sample's share of its piece for the graded road. */
  landings: { p: Probe; frac: Float64Array }[];
}
const probeCache = new WeakMap<MoveTable, Map<number, GridProbes>>();

function gridProbes(T: MoveTable, w: number): GridProbes {
  const byW = probeCache.get(T) ?? new Map<number, GridProbes>();
  probeCache.set(T, byW);
  const hit = byW.get(w);
  if (hit) return hit;
  const moves = MOVES.map(([dr, dc], b) =>
    probe(
      T.sub[b]!.map((f) => dr * f),
      T.sub[b]!.map((f) => dc * f),
      w,
    ),
  );
  const landings = T.byId.map((L) => {
    const legLen = L.lenM - L.arcLen;
    const frac = Float64Array.from(L.cum, (x, k) => (k <= L.arcEnd ? x / L.arcLen : (x - L.arcLen) / legLen));
    return { p: probe(L.r, L.c, w), frac };
  });
  const out = { moves, landings };
  byW.set(w, out);
  return out;
}

/** What the search reads: the fine DEM and the per-cell layers the cost uses. */
export interface SearchGrid {
  d: Dem;
  inside: Uint8Array;
  slope: Float32Array;
  soil: Uint8Array;
  acc: Float32Array;
}

export interface SearchOpts {
  maxGrade: number;
  wGrade: number;
  /** Keep to the parcel: outside cells are passable only within this many metres of the start (driveway.ts). */
  insideExceptNearStartM?: number;
  /** The side-slope limit for landings, when not `landingMaxSideSlopeDeg` (the router report's diagnostic run). */
  landingMaxSideSlopeDeg?: number;
  /**
   * The search without its speed-ups (the router report's reference): A* on estimates that never overestimate (the
   * cost factors' field and the climb), not inflated. Without it, the estimate is the grade-aware field and the
   * climb, times `estimateWeight`.
   */
  exact?: boolean;
}

/** A point of the routed path: grid position (fractional row and column; cell centres are whole) and the ground. */
export interface PathPoint {
  r: number;
  c: number;
  z: number;
  /** On a landing, the graded road's elevation there. */
  zd?: number;
}

export interface RoutedPath {
  pts: PathPoint[];
  /**
   * Each switchback landing: the indices of `pts` where its turn starts (`from`) and ends (`to`) and where its leg
   * ends (`end`), the turn, and the steepest natural side slope under the arc (degrees).
   */
  landings: { from: number; to: number; end: number; turnDeg: number; sideSlopeDeg: number }[];
}

// Search buffers, kept between searches (12 million states on the largest fixture).
let dist = new Float32Array(0),
  how = new Uint16Array(0),
  closed = new Uint8Array(0);

/**
 * `how` for a state: its previous heading (0…M-1), START + the entrance's index for a first move, or LANDING + the
 * landing's id.
 */
const START = 0x7f00,
  LANDING = 0x8000;

/** What the search's cost reads per cell, and the estimates toward each target cell (both kept per grid). */
interface CostField {
  cellCost: Float32Array;
  toTarget: Map<number, Float32Array>;
}
const costFields = new WeakMap<Uint8Array, WeakMap<Float32Array, CostField>>();

/** Each cell's cost factor: steep ground, bottomland and rock cost more, land outside the parcel more again. */
function costField(g: SearchGrid): CostField {
  const byInside = costFields.get(g.inside) ?? new WeakMap<Float32Array, CostField>();
  costFields.set(g.inside, byInside);
  const hit = byInside.get(g.slope);
  if (hit) return hit;
  const n = g.d.w * g.d.h;
  const cellCost = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let f = 1 + K.crossSlopeFactor * Math.tan(((g.slope[i] || 0) * Math.PI) / 180);
    if (g.soil[i] === 1) f *= K.bottomlandFactor;
    else if (g.soil[i] === 2) f *= K.rockFactor;
    if (!g.inside[i]) f *= K.outsideFactor;
    cellCost[i] = f;
  }
  const field = { cellCost, toTarget: new Map<number, Float32Array>() };
  byInside.set(g.slope, field);
  return field;
}

/**
 * A* estimate toward one target cell: the cheapest way there over the 8 neighbours, each step costing its length times
 * the cost factor of the cell it enters, with no grade limit, no turns and no landings, so it never overestimates a
 * real route's cost. Scaled down for the longer moves, whose straight line an 8-neighbour path can only approximate.
 */
function estimateTo(g: SearchGrid, field: CostField, target: number): Float32Array {
  const hit = field.toTarget.get(target);
  if (hit) return hit;
  const { w, h, z, res, resY } = g.d;
  const est = new Float32Array(w * h).fill(Infinity);
  const heap = new MinHeap();
  est[target] = 0;
  heap.push(0, target);
  const diag = Math.hypot(res, resY);
  const steps: [number, number, number][] = [
    [1, 0, resY],
    [-1, 0, resY],
    [0, 1, res],
    [0, -1, res],
    [1, 1, diag],
    [1, -1, diag],
    [-1, 1, diag],
    [-1, -1, diag],
  ];
  while (heap.size) {
    const j = heap.pop(),
      dj = heap.lastKey;
    if (dj > est[j]!) continue;
    const r = (j / w) | 0,
      c = j % w;
    const enter = field.cellCost[j]!;
    for (const [dr, dc, len] of steps) {
      const rr = r - dr,
        cc = c - dc;
      if (rr < 0 || cc < 0 || rr >= h || cc >= w) continue;
      const i = rr * w + cc;
      if (Number.isNaN(z[i]!)) continue;
      const nd = Math.fround(dj + len * enter);
      if (nd < est[i]!) {
        est[i] = nd;
        heap.push(nd, i);
      }
    }
  }
  // An 8-neighbour path is up to 8.2% longer than the straight line a 32-direction move takes.
  for (let i = 0; i < est.length; i++) est[i] = est[i]! / 1.0824;
  field.toTarget.set(target, est);
  return est;
}

/**
 * A* estimate toward one target that knows about the grade limit (A4b PR B, for speed): the cheapest way there on a
 * grid of blocks of cells (GRADE_BLOCK a side), moving to the 8 neighbours and the 8 knight's moves within the limit (with some slack), each
 * step costing as the search's moves do but at the block's cheapest cost factor, with no turns and no landings. The
 * long routes a steep parcel needs are the ones the plain estimates underrate; this one sees the detours. Cells the
 * coarse grid can't reach get no estimate from it (NaN). Cached per grid, target and grade style.
 */
const gradeFields = new WeakMap<CostField, Map<string, Float32Array>>();
/** Expansions before the grade-aware estimate is built for the targets still unreached. */
const LAZY_FIELD = 50_000;
/** The grade-aware estimate's blocks: this many cells a side. */
const GRADE_BLOCK = 3;
function gradeEstimateTo(
  g: SearchGrid,
  field: CostField,
  target: number,
  maxG: number,
  wG: number,
): Float32Array {
  const byKey = gradeFields.get(field) ?? new Map<string, Float32Array>();
  gradeFields.set(field, byKey);
  const key = `${target},${maxG},${wG}`;
  const hit = byKey.get(key);
  if (hit) return hit;
  const { w, h, z, res, resY } = g.d;
  const B = GRADE_BLOCK;
  const W = Math.ceil(w / B),
    H = Math.ceil(h / B);
  const zc = new Float32Array(W * H),
    cc = new Float32Array(W * H).fill(Infinity);
  for (let R = 0; R < H; R++)
    for (let C = 0; C < W; C++) {
      let sum = 0,
        nz = 0;
      for (let dr = 0; dr < B; dr++)
        for (let dc = 0; dc < B; dc++) {
          const r = B * R + dr,
            c = B * C + dc;
          if (r >= h || c >= w) continue;
          const i = r * w + c;
          if (Number.isNaN(z[i]!)) continue;
          sum += z[i]!;
          nz++;
          if (field.cellCost[i]! < cc[R * W + C]!) cc[R * W + C] = field.cellCost[i]!;
        }
      zc[R * W + C] = nz ? sum / nz : NaN;
    }
  const slack = 1.5;
  const steps = [
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
  ].map(([dr, dc]) => [dr!, dc!, Math.hypot(B * dr! * resY, B * dc! * res)] as const);
  const est = new Float32Array(W * H).fill(Infinity);
  const tr = Math.floor(((target / w) | 0) / B),
    tcol = Math.floor((target % w) / B);
  const heap = new MinHeap();
  est[tr * W + tcol] = 0;
  heap.push(0, tr * W + tcol);
  while (heap.size) {
    const J = heap.pop(),
      dj = heap.lastKey;
    if (dj > est[J]!) continue;
    const R = (J / W) | 0,
      C = J % W,
      zj = zc[J]!;
    for (const [dr, dc, len] of steps) {
      const RR = R - dr,
        CC = C - dc;
      if (RR < 0 || CC < 0 || RR >= H || CC >= W) continue;
      const I = RR * W + CC;
      const zi = zc[I]!;
      if (Number.isNaN(zi)) continue;
      const gr = Math.abs(zj - zi) / len;
      if (gr > slack * maxG) continue;
      const gg = Math.min(1, gr / maxG);
      const nd = Math.fround(dj + len * (1 + wG * gg * gg) * cc[J]!);
      if (nd < est[I]!) {
        est[I] = nd;
        heap.push(nd, I);
      }
    }
  }
  // Back to the fine grid, scaled down for what the coarse grid smooths over.
  const out = new Float32Array(w * h);
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      const e = est[Math.floor(r / B) * W + Math.floor(c / B)]!;
      out[r * w + c] = e === Infinity ? NaN : 0.8 * e;
    }
  byKey.set(key, out);
  return out;
}

/** A routed path and the entrance (index into the search's sources) it starts from. */
export interface SearchResult extends RoutedPath {
  source: number;
}

/**
 * Least-cost paths from any of several cells (the entrances) to several targets, each grade-limited move as above.
 * Null for a target out of the grid or out of reach. A target is settled only when nothing left in the queue could
 * reach it for less, so its path is the cheapest from any source.
 */
export function searchMany(
  g: SearchGrid,
  srcs: readonly (readonly [number, number])[],
  dsts: readonly number[],
  opts: SearchOpts,
): (SearchResult | null)[] {
  const { d, inside, slope, acc } = g;
  const { w, h, z } = d,
    n = w * h;
  const T = moveTable(d.res, d.resY);
  const M = MOVES.length,
    S = n * M;
  const sources = srcs.filter(([r, c]) => r >= 0 && c >= 0 && r < h && c < w);
  if (!sources.length) return dsts.map(() => null);
  const srcIndex = sources.map((s) => srcs.indexOf(s));
  const maxG = opts.maxGrade,
    wG = opts.wGrade;
  const streamCells = Math.round(K.streamContributingM2 / (d.res * d.resY));
  const nearM = opts.insideExceptNearStartM;
  // Kept to the parcel: outside cells only near an entrance (where the road meets the boundary).
  const keepIn = nearM !== undefined;
  const passable = (cell: number, rr: number, cc: number) =>
    inside[cell] === 1 ||
    sources.some(([sr, sc]) => ((rr - sr) * d.resY) ** 2 + ((cc - sc) * d.res) ** 2 <= nearM! * nearM!);
  const field = costField(g);
  const cellCost = field.cellCost;
  const GP = gridProbes(T, w);
  /** The ground at a probe's point n, from cell i (the caller has checked the probe stays on the grid). */
  const zProbe = (p: Probe, n: number, i: number) => {
    const o = i + p.o00[n]!;
    return (
      z[o]! * p.w00[n]! +
      z[o + p.dc[n]!]! * p.w01[n]! +
      z[o + p.dr[n]!]! * p.w10[n]! +
      z[o + p.dr[n]! + p.dc[n]!]! * p.w11[n]!
    );
  };
  /** The ground between cell centres (whole rows and columns), NaN off the grid or next to a hole. */
  const zAt = (rr: number, cc: number): number => {
    const r0 = Math.floor(rr),
      c0 = Math.floor(cc);
    const fr = rr - r0,
      fc = cc - c0;
    const r1 = fr > 0 ? r0 + 1 : r0,
      c1 = fc > 0 ? c0 + 1 : c0;
    if (r0 < 0 || c0 < 0 || r1 >= h || c1 >= w) return NaN;
    return (
      z[r0 * w + c0]! * (1 - fr) * (1 - fc) +
      z[r0 * w + c1]! * (1 - fr) * fc +
      z[r1 * w + c0]! * fr * (1 - fc) +
      z[r1 * w + c1]! * fr * fc
    );
  };

  const cutFill = K.landingCutFillM,
    moveTol = K.moveCutFillM,
    maxSide = opts.landingMaxSideSlopeDeg ?? K.landingMaxSideSlopeDeg;
  // Cells where a landing's arc may not go: the natural side slope is over the limit (or unknown).
  const tooSteep = new Uint8Array(n);
  for (let i = 0; i < n; i++) tooSteep[i] = (slope[i] || 0) <= maxSide ? 0 : 1;
  /**
   * A landing's graded bench from the turn's cell: the road leaves the cell at ground, runs the arc at one grade to
   * the arc's end, then the leg at one grade to the leg's end cell, at ground again. The arc's end may sit up to
   * landingCutFillM off the ground. `ed` is the road's elevation there (as close to the ground as the limit allows);
   * null when no such bench holds the grade limit.
   */
  const bench = (L: Landing, r: number, c: number): { zi: number; zF: number; ed: number } | null => {
    const zi = z[r * w + c]!,
      zF = z[(r + L.er) * w + c + L.ec]!;
    const zE = zAt(r + L.r[L.arcEnd]!, c + L.c[L.arcEnd]!);
    const legLen = L.lenM - L.arcLen;
    const lo = Math.max(zi - maxG * L.arcLen, zF - maxG * legLen, zE - cutFill),
      hi = Math.min(zi + maxG * L.arcLen, zF + maxG * legLen, zE + cutFill);
    if (!(lo <= hi)) return null;
    return { zi, zF, ed: Math.min(hi, Math.max(lo, zE)) };
  };
  /** The graded road's elevation at a landing's sample `k`. */
  const designAt = (L: Landing, b: { zi: number; zF: number; ed: number }, k: number) =>
    k <= L.arcEnd
      ? b.zi + ((b.ed - b.zi) * L.cum[k]!) / L.arcLen
      : b.ed + ((b.zF - b.ed) * (L.cum[k]! - L.arcLen)) / (L.lenM - L.arcLen);

  // Targets: several sites may share a cell.
  const atCell = new Map<number, number[]>();
  dsts.forEach((cell, k) => {
    if (cell >= 0) atCell.set(cell, [...(atCell.get(cell) ?? []), k]);
  });
  const live = new Uint8Array(dsts.length);
  dsts.forEach((cell, k) => (live[k] = cell >= 0 ? 1 : 0));
  let remaining = live.reduce((t, x) => t + x, 0);
  const exact = opts.exact === true;
  const best = new Float64Array(dsts.length).fill(Infinity);
  /** How each target was best reached: a state, or part of a landing (the state it left from, the landing, the sample). */
  const arrState = new Int32Array(dsts.length).fill(-1),
    arrLanding = new Int32Array(dsts.length).fill(-1),
    arrSample = new Int32Array(dsts.length).fill(-1);
  /** The estimate from a cell to the nearest target not yet reached. */
  /**
   * The estimate from each cell to each target. One part is the climb: a road rising dz at no more than the limit is
   * at least dz / maxG long, and since the grade term is convex, holding one grade the whole way is the cheapest way
   * to rise, so a road of length L costs at least L + wGrade·dz²/(L·maxG²), least at L = √wGrade·dz/maxG. The other
   * is a field: the grade-aware one (gradeEstimateTo), or for the exact search the cost factors' one (estimateTo).
   */
  // The weighted estimate settles for a route within estimateWeight of the cheapest (owner, 2026-10-10: 1.25).
  const weight = exact ? 1 : K.estimateWeight;
  const estimateFor = (cell: number, withField: boolean): Float32Array => {
    const field = !withField
      ? null
      : exact
        ? estimateTo(g, costField(g), cell)
        : gradeEstimateTo(g, costField(g), cell, maxG, wG);
    const tr = (cell / w) | 0,
      tc = cell % w,
      tz = z[cell]!;
    const e = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const dz = Math.abs(tz - z[i]!);
      const ry = (((i / w) | 0) - tr) * d.resY,
        cx = ((i % w) - tc) * d.res;
      const L0 = Math.max(Math.sqrt(ry * ry + cx * cx), dz / maxG);
      const climb =
        Math.sqrt(wG) * (dz / maxG) > L0
          ? 2 * Math.sqrt(wG) * (dz / maxG)
          : L0 + (wG * dz * dz) / (L0 * maxG * maxG);
      const fe = field ? field[i]! : NaN;
      e[i] = weight * (fe === fe ? Math.max(fe, climb) : climb); // NaN: no field, or the coarse grid doesn't reach
    }
    return e;
  };
  // The grade-aware field costs a search of its own per target, and most targets are reached before it would help:
  // it's built only for the targets still unreached after LAZY_FIELD expansions (the exact search builds its own at
  // once).
  let fields = exact;
  const toEachW = dsts.map((cell) => (cell < 0 ? null : estimateFor(cell, exact)));
  /** The estimate toward the nearest target not yet reached; rebuilt when a target is reached. */
  const hNear = new Float32Array(n);
  const rebuildNear = () => {
    hNear.fill(Infinity);
    toEachW.forEach((e, k) => {
      if (!e || !live[k]) return;
      for (let i = 0; i < n; i++) if (e[i]! < hNear[i]!) hNear[i] = e[i]!;
    });
  };
  rebuildNear();
  const hOf = (cell: number) => hNear[cell]!;
  const isTarget = new Uint8Array(n);
  for (const cell of atCell.keys()) isTarget[cell] = 1;
  const arrive = (cell: number, cost: number, state: number, landing: number, sample: number) => {
    if (!isTarget[cell]) return;
    const ks = atCell.get(cell)!;
    for (const k of ks)
      if (live[k] && cost < best[k]!) {
        best[k] = cost;
        arrState[k] = state;
        arrLanding[k] = landing;
        arrSample[k] = sample;
      }
  };

  const states = S + sources.length;
  if (dist.length < states) {
    dist = new Float32Array(states);
    how = new Uint16Array(states);
    closed = new Uint8Array(states);
  }
  dist.fill(Infinity, 0, states);
  closed.fill(0, 0, states);
  const cellOf = (s: number) => {
    if (s < S) return Math.floor(s / M);
    const [r, c] = sources[s - S]!;
    return r * w + c;
  };
  const heap = new MinHeap();
  sources.forEach((_, e) => {
    const cell = cellOf(S + e);
    dist[S + e] = 0;
    heap.push(hOf(cell), S + e);
    arrive(cell, 0, S + e, -1, -1);
  });
  const relax = (t: number, cost: number, via: number, cell: number) => {
    const c32 = Math.fround(cost);
    if (c32 >= dist[t]!) return;
    dist[t] = c32;
    how[t] = via;
    heap.push(c32 + hOf(cell), t);
    arrive(cell, c32, t, -1, -1);
  };

  let expanded = 0;
  while (heap.size && remaining) {
    const s = heap.pop(),
      f = heap.lastKey;
    // Settle every target no queued state could reach for less.
    let settled = false;
    for (let k = 0; k < live.length; k++)
      if (live[k] && best[k]! <= f) {
        live[k] = 0;
        remaining--;
        settled = true;
      }
    if (!remaining) break;
    if (settled) {
      // The estimate rises when the nearest target goes: re-key what's queued, this state included.
      rebuildNear();
      heap.rekey((v) => (closed[v] ? Infinity : dist[v]! + hOf(cellOf(v))));
      if (!closed[s]) heap.push(dist[s]! + hOf(cellOf(s)), s);
      continue;
    }
    if (closed[s]) continue;
    closed[s] = 1;
    if (!fields && ++expanded >= LAZY_FIELD) {
      fields = true;
      dsts.forEach((cell, k) => {
        if (live[k]) toEachW[k] = estimateFor(cell, true);
      });
      rebuildNear();
      heap.rekey((v) => (closed[v] ? Infinity : dist[v]! + hOf(cellOf(v))));
    }
    const i = cellOf(s),
      a = s >= S ? M : s % M,
      g0 = dist[s]!;
    const r = (i / w) | 0,
      c = i % w,
      zi = z[i]!;

    for (const b of T.next[a]!) {
      const [dr, dc] = MOVES[b]!;
      const rr = r + dr,
        cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= h || cc >= w) continue;
      const j = rr * w + cc;
      const zj = z[j]!;
      if (Number.isNaN(zj) || (keepIn && !passable(j, rr, cc))) continue;
      const len = T.len[b]!;
      const gr = Math.abs(zj - zi) / len;
      if (gr > maxG) continue;
      const sub = T.sub[b]!;
      if (sub.length) {
        // The ground where the move crosses the cells between its ends: within moveCutFillM of its straight line.
        // (The crossings lie between the move's two ends, both on the grid.)
        const P = GP.moves[b]!;
        let ok = true;
        for (let n = 0; n < sub.length; n++) {
          if (
            !(Math.abs(zProbe(P, n, i) - (zi + (zj - zi) * sub[n]!)) <= moveTol) ||
            (keepIn && !passable(i + P.near[n]!, r + P.nr[n]!, c + P.nc[n]!))
          ) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
      }
      let cost = len * (1 + wG * (gr / maxG) ** 2) * cellCost[j]!;
      if (acc[j]! >= streamCells && acc[i]! < streamCells) cost += K.crossingCost;
      if (a < M) cost += T.turnCost[a * M + b]!;
      relax(j * M + b, g0 + cost, a < M ? a : START + (s - S), j);
    }

    // A landing turns from a heading (not at the start), and only where the ground is steeper than the limit.
    if (a === M || !(Math.tan(((slope[i] || 0) * Math.PI) / 180) > maxG)) continue;
    // A target within a landing's reach of here could be passed on the way (and reached for less than its end).
    const targetNear = hOf(i) <= T.maxLandingM;
    // Which way the road was going: a switchback carries on the climb (or the descent), never turns it back.
    const [pdr, pdc] = MOVES[a]!;
    const climbIn = zi - z[i - pdr * w - pdc]!;
    for (const L of T.landings[a]!) {
      const { p: P, frac } = GP.landings[L.id]!;
      if (r + P.minR < 0 || r + P.maxR >= h || c + P.minC < 0 || c + P.maxC >= w) continue;
      const last = L.r.length - 1;
      const j = i + P.near[last]!;
      const zF = z[j]!;
      if (Number.isNaN(zF)) continue;
      // The graded bench (bench(), inlined): the road's elevation at the arc's end. (These read the elevation grid,
      // which stays in cache; the cost below reads the large state array, so it comes last.)
      const legLen = L.lenM - L.arcLen;
      const zE = zProbe(P, L.arcEnd, i);
      const lo = Math.max(zi - maxG * L.arcLen, zF - maxG * legLen, zE - cutFill),
        hi = Math.min(zi + maxG * L.arcLen, zF + maxG * legLen, zE + cutFill);
      if (!(lo <= hi)) continue;
      const ed = Math.min(hi, Math.max(lo, zE));
      if (climbIn * (ed - zi) < 0) continue;
      const base = g0 + K.landingCostM + T.turnCost[a * M + L.b]!;
      // Every metre costs at least 1: a landing that can't beat what already reaches its end isn't worth walking.
      if (!targetNear && Math.fround(base + L.lenM) >= dist[j * M + L.b]!) continue;
      const fArc = 1 + wG * (Math.abs(ed - zi) / L.arcLen / maxG) ** 2,
        fLeg = 1 + wG * (Math.abs(zF - ed) / legLen / maxG) ** 2;
      let cost = base,
        prevCell = i,
        ok = true;
      for (let k = 0; k <= last; k++) {
        const cell = i + P.near[k]!;
        const onArc = k <= L.arcEnd;
        const zd = onArc ? zi + (ed - zi) * frac[k]! : ed + (zF - ed) * frac[k]!;
        if (
          (keepIn && !passable(cell, r + P.nr[k]!, c + P.nc[k]!)) ||
          (onArc && tooSteep[cell] === 1) ||
          !(Math.abs(zProbe(P, k, i) - zd) <= cutFill)
        ) {
          ok = false;
          break;
        }
        cost += L.seg[k]! * (onArc ? fArc : fLeg) * cellCost[cell]!;
        if (acc[cell]! >= streamCells && acc[prevCell]! < streamCells) cost += K.crossingCost;
        prevCell = cell;
        if (targetNear && k < last) arrive(cell, cost, s, L.id, k); // a site the landing passes through
      }
      if (ok) relax(j * M + L.b, cost, LANDING + L.id, j);
    }
  }

  return dsts.map((cell, k) => {
    if (cell < 0 || best[k] === Infinity) return null;
    return trace(arrState[k]!, arrLanding[k]!, arrSample[k]!);
  });

  /** The path back from a target's arrival: states, and the samples of any landing on the way. */
  function trace(state: number, landing: number, sample: number): SearchResult {
    type Piece = { cell: number } | { from: number; L: Landing; upto: number };
    const pieces: Piece[] = [];
    if (landing >= 0) pieces.push({ from: cellOf(state), L: T.byId[landing]!, upto: sample });
    let s = state;
    while (s < S) {
      const j = cellOf(s),
        via = how[s]!;
      if (via >= LANDING) {
        const L = T.byId[via - LANDING]!;
        const from = j - L.er * w - L.ec;
        pieces.push({ from, L, upto: L.r.length - 1 });
        s = from * M + L.a;
      } else {
        pieces.push({ cell: j });
        const [dr, dc] = MOVES[s % M]!;
        const from = j - dr * w - dc;
        s = via >= START ? S + (via - START) : from * M + via;
      }
    }
    pieces.reverse();
    const src = cellOf(s);
    const pts: PathPoint[] = [{ r: (src / w) | 0, c: src % w, z: z[src]! }];
    const landings: RoutedPath["landings"] = [];
    for (const p of pieces) {
      if ("cell" in p) {
        pts.push({ r: (p.cell / w) | 0, c: p.cell % w, z: z[p.cell]! });
        continue;
      }
      const r0 = (p.from / w) | 0,
        c0 = p.from % w;
      const start = pts.length - 1;
      const bz = bench(p.L, r0, c0)!;
      pts[start]!.zd = bz.zi;
      let side = 0;
      for (let k = 0; k <= p.upto; k++) {
        const rr = r0 + p.L.r[k]!,
          cc = c0 + p.L.c[k]!;
        pts.push({ r: rr, c: cc, z: zAt(rr, cc), zd: designAt(p.L, bz, k) });
        if (k <= p.L.arcEnd) side = Math.max(side, slope[Math.round(rr) * w + Math.round(cc)] || 0);
      }
      if (p.upto >= p.L.arcEnd)
        landings.push({
          from: start,
          to: start + 1 + p.L.arcEnd,
          end: pts.length - 1,
          turnDeg: p.L.turnDeg,
          sideSlopeDeg: side,
        });
    }
    return { pts, landings, source: srcIndex[s - S]! };
  }
}

/**
 * The routed path simplified for building (Douglas–Peucker within `smoothEpsM` of the routed corridor), each straight
 * leg's grade re-checked end to end and split again where it's over the limit (the #91 study's alignment).
 */
export function smoothPath(path: RoutedPath, maxGrade: number, d: Dem): PathPoint[] {
  const p = path.pts;
  if (p.length < 3) return p.slice();
  const x = p.map((q) => q.c * d.res),
    y = p.map((q) => -q.r * d.resY);
  const keep = new Uint8Array(p.length);
  keep[0] = keep[p.length - 1] = 1;
  // A landing's bench is built as designed: its points stay.
  p.forEach((q, i) => {
    if (q.zd !== undefined) keep[i] = 1;
  });
  const zr = (q: PathPoint) => q.zd ?? q.z;
  const kept = [...keep.keys()].filter((i) => keep[i]);
  const stack: [number, number][] = kept.slice(1).map((j, n) => [kept[n]!, j]);
  while (stack.length) {
    const [i, j] = stack.pop()!;
    if (j - i < 2) continue;
    const dx = x[j]! - x[i]!,
      dy = y[j]! - y[i]!;
    const L2 = dx * dx + dy * dy;
    let k = -1,
      dmax = -1;
    for (let m = i + 1; m < j; m++) {
      const t = L2 ? Math.max(0, Math.min(1, ((x[m]! - x[i]!) * dx + (y[m]! - y[i]!) * dy) / L2)) : 0;
      const dd = Math.hypot(x[m]! - x[i]! - t * dx, y[m]! - y[i]! - t * dy);
      if (dd > dmax) {
        dmax = dd;
        k = m;
      }
    }
    const run = Math.sqrt(L2);
    const grade = run ? Math.abs(zr(p[j]!) - zr(p[i]!)) / run : Infinity;
    if (dmax <= K.smoothEpsM && grade <= maxGrade + 1e-9) continue;
    keep[k] = 1;
    stack.push([i, k], [k, j]);
  }
  return p.filter((_, i) => keep[i]);
}
