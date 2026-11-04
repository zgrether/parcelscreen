/**
 * Hydrology on an elevation grid (docs/plans/water.md §1): depressions filled, D8 flow directions, accumulation (with
 * optional inflow seeded at the grid's edge), the cells draining onto a target (a watershed), a topographic wetness
 * index, flow lines traced downhill, and a mask's outline. Pure: grids in, arrays out; no fetching and no DOM.
 *
 * The driveway's own `flowAccum` (driveway.ts) is separate on purpose: its culvert counts are graded and stay as they
 * are.
 */
import { simplify } from "@turf/turf";
import type { MultiPolygon, Polygon, Position } from "geojson";
import { rcToLL } from "./dem";
import type { Dem } from "./types";

/** The 8 neighbours, as row and column steps; a direction is an index into these (−1: flows off the grid). */
export const DR = [-1, -1, 0, 1, 1, 1, 0, -1] as const;
export const DC = [0, 1, 1, 1, 0, -1, -1, -1] as const;

/** A min-heap of cell indices by a key, for the priority flood. */
class Heap {
  private idx: number[] = [];
  constructor(private key: Float64Array) {}
  get size() {
    return this.idx.length;
  }
  push(i: number) {
    const a = this.idx,
      k = this.key;
    a.push(i);
    let n = a.length - 1;
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (k[a[p]!]! <= k[a[n]!]!) break;
      [a[p], a[n]] = [a[n]!, a[p]!];
      n = p;
    }
  }
  pop(): number {
    const a = this.idx,
      k = this.key;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let n = 0;
      for (;;) {
        const l = 2 * n + 1,
          r = l + 1;
        let m = n;
        if (l < a.length && k[a[l]!]! < k[a[m]!]!) m = l;
        if (r < a.length && k[a[r]!]! < k[a[m]!]!) m = r;
        if (m === n) break;
        [a[m], a[n]] = [a[n]!, a[m]!];
        n = m;
      }
    }
    return top;
  }
}

/**
 * Depressions filled by a priority flood from the grid's edge (and from beside missing cells), each cell raised to at
 * least a hair above the cell it was reached from, so pits and flats drain instead of stopping water (Barnes et al.,
 * 2014, "+ε"). Missing cells stay NaN.
 */
export function fillDepressions(z: Float32Array, w: number, h: number, eps = 1e-4): Float64Array {
  const f = new Float64Array(w * h);
  const closed = new Uint8Array(w * h);
  const heap = new Heap(f);
  for (let i = 0; i < w * h; i++) {
    f[i] = z[i]!;
    if (Number.isNaN(z[i]!)) closed[i] = 1;
  }
  const seed = (i: number) => {
    if (closed[i]) return;
    closed[i] = 1;
    heap.push(i);
  };
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      const i = r * w + c;
      if (closed[i] && !Number.isNaN(z[i]!)) continue;
      if (r === 0 || c === 0 || r === h - 1 || c === w - 1) seed(i);
      else if (Number.isNaN(z[i]!))
        for (let k = 0; k < 8; k++) {
          const j = (r + DR[k]!) * w + c + DC[k]!;
          if (!Number.isNaN(z[j]!)) seed(j);
        }
    }
  while (heap.size) {
    const i = heap.pop();
    const r = (i / w) | 0,
      c = i % w;
    for (let k = 0; k < 8; k++) {
      const rr = r + DR[k]!,
        cc = c + DC[k]!;
      if (rr < 0 || cc < 0 || rr >= h || cc >= w) continue;
      const j = rr * w + cc;
      if (closed[j]) continue;
      closed[j] = 1;
      f[j] = Math.max(f[j]!, f[i]! + eps);
      heap.push(j);
    }
  }
  return f;
}

/** D8 directions on a filled grid: the steepest drop per unit distance; −1 where no neighbour is lower (an outlet). */
export function d8(f: Float64Array, w: number, h: number, res: number, resY: number): Int8Array {
  const dir = new Int8Array(w * h).fill(-1);
  const dist = DR.map((dr, k) => Math.hypot(dr * resY, DC[k]! * res));
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      const i = r * w + c;
      if (Number.isNaN(f[i]!)) continue;
      let best = 0,
        bk = -1;
      for (let k = 0; k < 8; k++) {
        const rr = r + DR[k]!,
          cc = c + DC[k]!;
        if (rr < 0 || cc < 0 || rr >= h || cc >= w) continue;
        const j = rr * w + cc;
        if (Number.isNaN(f[j]!)) continue;
        const s = (f[i]! - f[j]!) / dist[k]!;
        if (s > best) {
          best = s;
          bk = k;
        }
      }
      dir[i] = bk;
    }
  return dir;
}

/** The cell a direction points to, or −1. */
export const downstream = (dir: Int8Array, w: number, h: number, i: number): number => {
  const k = dir[i]!;
  if (k < 0) return -1;
  const r = ((i / w) | 0) + DR[k]!,
    c = (i % w) + DC[k]!;
  return r < 0 || c < 0 || r >= h || c >= w ? -1 : r * w + c;
};

/**
 * Accumulation along D8, in cells: each cell counts itself (or its seed weight, for inflow from beyond the grid) and
 * everything upstream of it. In topological order (Kahn's), so it's linear in the cells.
 */
export function accumulate(dir: Int8Array, w: number, h: number, seed?: Float64Array): Float64Array {
  const n = w * h;
  const acc = new Float64Array(n);
  const indeg = new Int32Array(n);
  const down = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    acc[i] = seed ? seed[i]! : 1;
    down[i] = downstream(dir, w, h, i);
    if (down[i]! >= 0) indeg[down[i]!]!++;
  }
  const queue = new Int32Array(n);
  let head = 0,
    tail = 0;
  for (let i = 0; i < n; i++) if (indeg[i] === 0) queue[tail++] = i;
  while (head < tail) {
    const i = queue[head++]!;
    const j = down[i]!;
    if (j < 0) continue;
    acc[j]! += acc[i]!;
    if (--indeg[j]! === 0) queue[tail++] = j;
  }
  return acc;
}

/**
 * The cells draining onto a target (its upslope watershed, the target's own cells left out), the largest inflow into
 * it (the outside cell that passes the most accumulation straight into the target), and whether the watershed reaches
 * the grid's edge (it may not be closed: a bigger box would find more).
 */
export function upslope(
  dir: Int8Array,
  w: number,
  h: number,
  target: Uint8Array,
  acc?: Float64Array,
): { mask: Uint8Array; cells: number; inflow: { cell: number; acc: number } | null; open: boolean } {
  const mask = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let i = 0; i < w * h; i++) if (target[i]) stack.push(i);
  let cells = 0,
    open = false;
  let inflow: { cell: number; acc: number } | null = null;
  while (stack.length) {
    const i = stack.pop()!;
    const r = (i / w) | 0,
      c = i % w;
    for (let k = 0; k < 8; k++) {
      const rr = r + DR[k]!,
        cc = c + DC[k]!;
      if (rr < 0 || cc < 0 || rr >= h || cc >= w) continue;
      const j = rr * w + cc;
      if (target[j] || mask[j] || downstream(dir, w, h, j) !== i) continue;
      mask[j] = 1;
      cells++;
      if (rr === 0 || cc === 0 || rr === h - 1 || cc === w - 1) open = true;
      if (target[i] && acc && (!inflow || acc[j]! > inflow.acc)) inflow = { cell: j, acc: acc[j]! };
      stack.push(j);
    }
  }
  return { mask, cells, inflow, open };
}

/**
 * Topographic wetness index, ln(a / tan β): a is the specific catchment area (the accumulation's area per metre of
 * contour, the cell's width), β the slope, floored so a flat reads very wet but finite. NaN where the slope is missing.
 */
export function wetness(
  acc: Float64Array,
  slopeDeg: Float32Array,
  res: number,
  resY: number,
  minSlopeDeg: number,
): Float32Array {
  const out = new Float32Array(acc.length);
  const width = Math.sqrt(res * resY);
  const floor = Math.tan((minSlopeDeg * Math.PI) / 180);
  for (let i = 0; i < acc.length; i++) {
    const s = slopeDeg[i]!;
    if (Number.isNaN(s)) {
      out[i] = NaN;
      continue;
    }
    const a = (acc[i]! * res * resY) / width;
    out[i] = Math.log(a / Math.max(floor, Math.tan((s * Math.PI) / 180)));
  }
  return out;
}

/**
 * Flow lines: the cells whose accumulation reaches `minCells`, traced downhill from each head (a cell with no such cell
 * flowing into it) until the line leaves the set or joins one already traced (the joining cell is kept, so lines meet).
 * Each line is its cells, upstream first, with the accumulation at its last cell.
 */
export function flowLines(
  dir: Int8Array,
  acc: Float64Array,
  w: number,
  h: number,
  minCells: number,
  keep?: Uint8Array,
): { cells: number[]; acc: number }[] {
  const on = (i: number) => acc[i]! >= minCells && (!keep || !!keep[i]);
  const fed = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (!on(i)) continue;
    const j = downstream(dir, w, h, i);
    if (j >= 0 && on(j)) fed[j] = 1;
  }
  const seen = new Uint8Array(w * h);
  const lines: { cells: number[]; acc: number }[] = [];
  for (let i = 0; i < w * h; i++) {
    if (!on(i) || fed[i]) continue;
    const cells: number[] = [];
    let j = i;
    while (j >= 0 && on(j)) {
      cells.push(j);
      if (seen[j]) break;
      seen[j] = 1;
      j = downstream(dir, w, h, j);
    }
    if (cells.length >= 2) lines.push({ cells, acc: acc[cells[cells.length - 1]!]! });
  }
  return lines;
}

/**
 * A mask's outline: its cells' outer edges chained into rings (cell corners, in grid coordinates), then put on the map
 * and simplified to `toleranceDeg`. Rings that run clockwise in (column, −row) are holes, set in the outer ring that
 * holds them. Null for an empty mask.
 */
export function maskOutline(d: Dem, mask: Uint8Array, toleranceDeg = 0): Polygon | MultiPolygon | null {
  const { w, h } = d;
  const at = (r: number, c: number) => r >= 0 && c >= 0 && r < h && c < w && !!mask[r * w + c];
  // Directed edges between corners (corner (r, c) is the cell's top-left), the mask on the edge's left as we walk.
  const next = new Map<string, [number, number][]>();
  const add = (r0: number, c0: number, r1: number, c1: number) => {
    const k = `${r0},${c0}`;
    const v = next.get(k);
    if (v) v.push([r1, c1]);
    else next.set(k, [[r1, c1]]);
  };
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      if (!at(r, c)) continue;
      if (!at(r - 1, c)) add(r, c + 1, r, c); // top edge, walked west
      if (!at(r + 1, c)) add(r + 1, c, r + 1, c + 1); // bottom, east
      if (!at(r, c - 1)) add(r, c, r + 1, c); // left, south
      if (!at(r, c + 1)) add(r + 1, c + 1, r, c + 1); // right, north
    }
  const rings: [number, number][][] = [];
  for (const [k, outs] of next) {
    while (outs.length) {
      const [r0, c0] = k.split(",").map(Number) as [number, number];
      const ring: [number, number][] = [[r0, c0]];
      let cur = outs.pop()!;
      while (!(cur[0] === r0 && cur[1] === c0)) {
        ring.push(cur);
        const o = next.get(`${cur[0]},${cur[1]}`)!;
        cur = o.pop()!;
      }
      ring.push([r0, c0]);
      rings.push(ring);
    }
  }
  if (!rings.length) return null;
  // Straight runs of cell edges kept as their two ends.
  for (const ring of rings)
    for (let i = ring.length - 2; i >= 1; i--) {
      const [ar, ac] = ring[i - 1]!,
        [br, bc] = ring[i]!,
        [cr, cc] = ring[i + 1]!;
      if ((br - ar) * (cc - bc) === (bc - ac) * (cr - br)) ring.splice(i, 1);
    }
  // The ring may start mid-run: then its start (and closing point) goes too, and the ring closes on its next corner.
  for (const ring of rings) {
    const n = ring.length;
    if (n < 5) continue;
    const [ar, ac] = ring[n - 2]!,
      [br, bc] = ring[0]!,
      [cr, cc] = ring[1]!;
    if ((br - ar) * (cc - bc) === (bc - ac) * (cr - br)) {
      ring.shift();
      ring[ring.length - 1] = ring[0]!;
    }
  }
  // Shoelace in (c, −r): positive is counter-clockwise, an outer ring here.
  const area = (ring: [number, number][]) => {
    let s = 0;
    for (let i = 1; i < ring.length; i++)
      s += ring[i - 1]![1] * -ring[i]![0] - ring[i]![1] * -ring[i - 1]![0];
    return s / 2;
  };
  const toLL = (ring: [number, number][]): Position[] =>
    ring.map(([r, c]) => {
      const [lat, lon] = rcToLL(d, r - 0.5, c - 0.5);
      return [lon, lat];
    });
  const inside = (pt: [number, number], ring: [number, number][]) => {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ri, ci] = ring[i]!,
        [rj, cj] = ring[j]!;
      if (ri > pt[0] !== rj > pt[0] && pt[1] < ((cj - ci) * (pt[0] - ri)) / (rj - ri) + ci) hit = !hit;
    }
    return hit;
  };
  const outers = rings.filter((r) => area(r) > 0);
  const holes = rings.filter((r) => area(r) < 0);
  const polys: Position[][][] = outers.map((o) => [toLL(o)]);
  for (const hole of holes) {
    const pt: [number, number] = [hole[0]![0] + 0.5, hole[0]![1] + 0.5];
    const k = outers.findIndex((o) => inside(pt, o));
    if (k >= 0) polys[k]!.push(toLL(hole));
  }
  const geom: Polygon | MultiPolygon =
    polys.length === 1
      ? { type: "Polygon", coordinates: polys[0]! }
      : { type: "MultiPolygon", coordinates: polys };
  return toleranceDeg > 0 ? simplify(geom, { tolerance: toleranceDeg, highQuality: false }) : geom;
}

/**
 * Possible pond sites: cells on the flow, inside `keep`, gathering between `minCells` and `maxCells`, on ground gentler
 * than `maxSlopeDeg`; ranked by what they gather per degree of slope (the most water on the flattest ground), the best
 * `n` at least `apartM` apart.
 */
export function pondSites(
  d: Dem,
  acc: Float64Array,
  slopeDeg: Float32Array,
  keep: Uint8Array,
  o: { minCells: number; maxCells: number; maxSlopeDeg: number; apartM: number; n: number },
): { cell: number; acc: number }[] {
  const { w } = d;
  const cand: { cell: number; acc: number; score: number }[] = [];
  for (let i = 0; i < acc.length; i++) {
    const a = acc[i]!,
      s = slopeDeg[i]!;
    if (!keep[i] || a < o.minCells || a > o.maxCells || !(s < o.maxSlopeDeg)) continue;
    cand.push({ cell: i, acc: a, score: a / Math.max(s, 0.5) });
  }
  cand.sort((x, y) => y.score - x.score || x.cell - y.cell);
  const out: { cell: number; acc: number }[] = [];
  for (const x of cand) {
    if (out.length >= o.n) break;
    const r = (x.cell / w) | 0,
      c = x.cell % w;
    const far = out.every((p) => {
      const pr = (p.cell / w) | 0,
        pc = p.cell % w;
      return Math.hypot((pr - r) * d.resY, (pc - c) * d.res) >= o.apartM;
    });
    if (far) out.push({ cell: x.cell, acc: x.acc });
  }
  return out;
}
