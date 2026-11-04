/**
 * Boulder potential (docs/plans/boulders.md): where on the parcel bouldering on one's own land might be, from two
 * readings the screen already has. Both are estimates, never graded.
 *
 * - **Soils:** the NRCS map units whose name, or one of whose major components, says bouldery, very or extremely
 *   stony, rubbly, rubble land or rock outcrop (`boulderTerms`).
 * - **Lidar texture:** fine-scale roughness of the 3 m bare-earth elevation once the slope's trend is taken out
 *   (`roughness`), kept where rough cells are dense over at least about a quarter acre, off cliffs and out of
 *   drainages (`roughPatches`).
 *
 * The result's `boulders` (an optional field, §9.65's exception, as Climbing's): the acres of either, each map unit
 * flagged with its acres, and the rough patches with their outlines for the map.
 */
import { booleanPointInPolygon, convex, featureCollection, point } from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { rcToLL } from "./dem";
import { SCREEN_CONSTANTS } from "./config";
import { components } from "./sites";
import type { Dem, SoilRow } from "./types";
import { M2_PER_ACRE, type LatLon } from "./util";

const K = SCREEN_CONSTANTS.boulders;

/** The words in a soil name that mean boulders or bare rock at the surface. "Stony" alone doesn't count. */
const TERMS: readonly [RegExp, string][] = [
  [/\bbouldery\b/i, "bouldery"],
  [/\bextremely stony\b/i, "extremely stony"],
  [/\bvery stony\b/i, "very stony"],
  [/\brubble land\b/i, "rubble land"],
  [/\brubbly\b/i, "rubbly"],
  [/\brock outcrop\b/i, "rock outcrop"],
];

/** The boulder words a soil map unit's or component's name carries, in the order above; none for most soils. */
export function boulderTerms(name: string | null | undefined): string[] {
  if (!name) return [];
  return TERMS.filter(([re]) => re.test(name)).map(([, word]) => word);
}

/** A map unit on the parcel whose name or major components say boulders or rock. */
export interface BoulderSoil {
  mukey: string;
  /** The map unit's name, as NRCS gives it. */
  name: string;
  acres: number;
  /** The boulder words found, in the map unit's name or its components' (each once). */
  terms: string[];
}

/** The flagged map units, largest first. A unit's acres are its area inside the parcel (soils.ts fetchSoilPolygons). */
export function boulderSoils(
  units: readonly { mukey: string; muname: string; acres: number }[] | null,
  rows: readonly SoilRow[],
): BoulderSoil[] {
  if (!units) return [];
  const out: BoulderSoil[] = [];
  for (const u of units) {
    const names = [
      u.muname,
      ...rows.filter((r) => String(r.mukey) === u.mukey).map((r) => String(r.compname ?? "")),
    ];
    const terms = [...new Set(names.flatMap(boulderTerms))];
    if (terms.length) out.push({ mukey: u.mukey, name: u.muname, acres: u.acres, terms });
  }
  return out.sort((a, b) => b.acres - a.acres);
}

/** A box mean of `v` over (2r+1)² cells, NaN cells left out; NaN where the window has none. */
function boxMean(v: Float32Array, w: number, h: number, r: number): Float32Array {
  // Summed-area tables of the values and of their count.
  const W = w + 1,
    sum = new Float64Array(W * (h + 1)),
    cnt = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let rs = 0,
      rc = 0;
    for (let x = 0; x < w; x++) {
      const z = v[y * w + x]!;
      if (!Number.isNaN(z)) {
        rs += z;
        rc++;
      }
      sum[(y + 1) * W + x + 1] = sum[y * W + x + 1]! + rs;
      cnt[(y + 1) * W + x + 1] = cnt[y * W + x + 1]! + rc;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const y0 = Math.max(0, y - r),
        y1 = Math.min(h, y + r + 1),
        x0 = Math.max(0, x - r),
        x1 = Math.min(w, x + r + 1);
      const at = (t: Float64Array) => t[y1 * W + x1]! - t[y0 * W + x1]! - t[y1 * W + x0]! + t[y0 * W + x0]!;
      const n = at(cnt);
      out[y * w + x] = n ? at(sum) / n : NaN;
    }
  return out;
}

/**
 * Fine-scale roughness, metres: the spread (standard deviation) over a small window of the ground's height above its
 * local trend. The trend is the mean over a wider window, which a plane (any steady slope) passes through unchanged,
 * so a smooth hillside of any steepness reads near zero and a field of boulders a few feet high reads high.
 */
export function roughness(d: Dem): Float32Array {
  const { z, w, h } = d;
  const trend = boxMean(z, w, h, K.trendCells);
  const resid = new Float32Array(w * h),
    resid2 = new Float32Array(w * h);
  // Within one trend window of the grid's edge the window is cut short, so its mean leaves the plane: no reading
  // there (the fine grid reaches past the parcel, so the parcel's own cells are read).
  const T = K.trendCells;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const edge = x < T || y < T || x >= w - T || y >= h - T;
      const r = edge ? NaN : z[i]! - trend[i]!;
      resid[i] = r;
      resid2[i] = r * r;
    }
  const m = boxMean(resid, w, h, K.roughCells),
    m2 = boxMean(resid2, w, h, K.roughCells),
    out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++)
    out[i] = Number.isNaN(resid[i]!) ? NaN : Math.sqrt(Math.max(0, m2[i]! - m[i]! * m[i]!));
  return out;
}

/**
 * The cliff cells: connected bands of cells steeper than K.cliffDeg at least K.cliffLenM long end to end. A boulder's
 * sides are steep too at 3 m, but they make a short blob, not a band.
 */
export function cliffs(d: Dem, slope: Float32Array): Float32Array {
  const { w } = d;
  const steep = slope.map((s) => (s > K.cliffDeg ? 1 : 0));
  const { comps } = components(d, steep, 1, 0);
  const out = new Float32Array(slope.length);
  for (const c of comps) {
    let r0 = Infinity,
      r1 = -Infinity,
      c0 = Infinity,
      c1 = -Infinity;
    for (const i of c.cells) {
      const r = (i / w) | 0,
        col = i % w;
      r0 = Math.min(r0, r);
      r1 = Math.max(r1, r);
      c0 = Math.min(c0, col);
      c1 = Math.max(c1, col);
    }
    if (Math.hypot((r1 - r0 + 1) * d.resY, (c1 - c0 + 1) * d.res) >= K.cliffLenM)
      for (const i of c.cells) out[i] = 1;
  }
  return out;
}

/** A patch of rough ground: where it is, how big, and its outline for the map. */
export interface RoughPatch {
  ll: LatLon;
  acres: number;
  outline: Feature<Polygon>;
}

/**
 * The patches of unusually rough ground inside the parcel, largest first: cells rougher than K.roughM, kept where at
 * least K.denseShare of their neighbourhood is rough (scattered rough cells are noise), never on a cliff (slope over
 * K.cliffDeg) or in a drainage (more than K.drainageM below the wider ground around it), in patches of at least
 * K.minAcres. Also the rough acres, and the grid of patch cells for the combined acres.
 */
export function roughPatches(
  d: Dem,
  slope: Float32Array,
  inside: Uint8Array,
): { patches: RoughPatch[]; acres: number; cells: Uint8Array } {
  const { w, h } = d;
  const rough = roughness(d);
  const valley = boxMean(d.z, w, h, K.drainageCells);
  const nearCliff = boxMean(cliffs(d, slope), w, h, K.trendCells);
  // A drainage: well below the wider ground around it; its banks too.
  const low = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) low[i] = d.z[i]! - valley[i]! < -K.drainageM ? 1 : 0;
  const nearDrainage = boxMean(low, w, h, K.drainageEdgeCells);
  const isRough = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const cliff = nearCliff[i]! > 0;
    const drainage = nearDrainage[i]! > 0;
    isRough[i] = inside[i] && rough[i]! >= K.roughM && !cliff && !drainage ? 1 : 0;
  }
  // Dense rough ground: the share of rough cells around each cell.
  const dense = boxMean(isRough, w, h, K.denseCells);
  const keep = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) keep[i] = inside[i] && isRough[i] && dense[i]! >= K.denseShare ? 1 : 0;
  const { comps } = components(d, keep, 1, K.minAcres);
  const cells = new Uint8Array(w * h);
  let acres = 0;
  const patches: RoughPatch[] = [];
  for (const c of comps) {
    acres += c.acres;
    for (const i of c.cells) cells[i] = 1;
    if (patches.length >= K.maxPatches) continue;
    let rs = 0,
      cs = 0;
    const corners = [];
    for (const i of c.cells) {
      const r = (i / w) | 0,
        col = i % w;
      rs += r;
      cs += col;
      // The cell's corners, so a patch's outline covers its cells and not only their centres.
      for (const [dr, dc] of [
        [-0.5, -0.5],
        [-0.5, 0.5],
        [0.5, -0.5],
        [0.5, 0.5],
      ] as const) {
        const [lat, lon] = rcToLL(d, r + dr, col + dc);
        corners.push(point([lon, lat]));
      }
    }
    const hull = convex(featureCollection(corners));
    if (!hull) continue;
    const ll = rcToLL(d, Math.round(rs / c.cells.length), Math.round(cs / c.cells.length));
    patches.push({ ll, acres: c.acres, outline: hull });
  }
  return { patches, acres, cells };
}

/** The parcel's boulder ground: the soils, the rough patches, and the acres of either (a cell counted once). */
export interface Boulders {
  acres: number;
  soilAcres: number;
  soils: BoulderSoil[];
  /** Null when there was no fine elevation to read. */
  rough: { acres: number; patches: RoughPatch[] } | null;
}

/**
 * The measurement. With both readings, the acres of either are counted on the elevation grid, a cell inside a flagged
 * map unit or a rough patch counted once; without the grid, the flagged map units' acres.
 */
export function measureBoulders(
  units:
    | readonly { mukey: string; muname: string; acres: number; geos: Feature<Polygon | MultiPolygon>[] }[]
    | null,
  rows: readonly SoilRow[],
  grid: { d: Dem; slope: Float32Array; inside: Uint8Array } | null,
): Boulders {
  const soils = boulderSoils(units, rows);
  const soilAcres = soils.reduce((n, s) => n + s.acres, 0);
  if (!grid) return { acres: soilAcres, soilAcres, soils, rough: null };
  const { d, slope, inside } = grid;
  const { patches, acres: roughAcres, cells } = roughPatches(d, slope, inside);
  const flagged = new Set(soils.map((s) => s.mukey));
  const geos = (units ?? []).filter((u) => flagged.has(u.mukey)).flatMap((u) => u.geos);
  let n = 0;
  for (let r = 0; r < d.h; r++)
    for (let c = 0; c < d.w; c++) {
      const i = r * d.w + c;
      if (!inside[i]) continue;
      if (cells[i]) {
        n++;
        continue;
      }
      if (!geos.length) continue;
      const [lat, lon] = rcToLL(d, r, c);
      if (geos.some((g) => booleanPointInPolygon([lon, lat], g))) n++;
    }
  const acres = (n * d.res * d.resY) / M2_PER_ACRE;
  return { acres, soilAcres, soils, rough: { acres: roughAcres, patches } };
}
