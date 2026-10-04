/**
 * Graded suitability surfaces (house and garden, 0–100 per cell) and the site search: connected house
 * sites, shelves and garden patches, the per-surface acreage diagnostics, and the terrain step's site flags.
 * Ported verbatim (proto L911–958, L1028–1038). Nothing here is a veto; soils handle vetoes later.
 */
import { SCREEN_CONSTANTS } from "./config";
import { rcToLL } from "./dem";
import type { Dem, ScreenResult, UserConfig } from "./types";
import { lerp, M2FT, M2_PER_ACRE, type Curve } from "./util";

const S = SCREEN_CONSTANTS.suitability;
const K = SCREEN_CONSTANTS.sites;

/** Aspect score: 100 on near-flat ground, else by angular distance from `targetDeg` along the aspect curve. */
export function aspectScore(
  slopeDeg: number,
  aspectDeg: number,
  targetDeg: number = S.cellAspectTargetDeg,
): number {
  if (slopeDeg < S.flatBelowDeg) return 100;
  const d = Math.min(Math.abs(aspectDeg - targetDeg), 360 - Math.abs(aspectDeg - targetDeg));
  return lerp(d, S.aspectCurve);
}

/** The frost curve with the user's thermal-belt height as its second breakpoint. */
export function frostCurve(
  f: { atFloor: number; full: number; beltTopFt: number; exposedFt: number; exposed: number },
  thermalMinFt: number,
): Curve {
  return [
    [0, f.atFloor],
    [thermalMinFt, f.full],
    [f.beltTopFt, f.full],
    [f.exposedFt, f.exposed],
  ];
}

export interface Surfaces {
  house: Float32Array;
  garden: Float32Array;
  /** Per cell: [slope score, aspect score, frost score] of the house surface. */
  parts: Float32Array;
}

/** House and garden suitability for every cell inside the parcel; NaN outside it or on no-data. */
export function suitability(
  d: Dem,
  slope: Float32Array,
  aspect: Float32Array,
  inside: Uint8Array,
  vf: number,
  thermalMinFt: number,
): Surfaces {
  const n = d.w * d.h,
    house = new Float32Array(n),
    garden = new Float32Array(n),
    parts = new Float32Array(n * 3);
  const frostH = frostCurve(S.frostHouse, thermalMinFt),
    frostG = frostCurve(S.frostGarden, thermalMinFt);
  const H = S.house,
    G = S.garden;
  for (let i = 0; i < n; i++) {
    if (!inside[i] || Number.isNaN(slope[i]!)) {
      house[i] = NaN;
      garden[i] = NaN;
      continue;
    }
    const s = slope[i]!,
      above = (d.z[i]! - vf) * M2FT;
    const slH = lerp(s, S.slopeHouse),
      slG = lerp(s, S.slopeGarden);
    const asp = aspectScore(s, aspect[i]!);
    const th = lerp(above, frostH); // frost pocket → belt → exposed top
    const thG = lerp(above, frostG);
    house[i] =
      slH * (H.slopeBase + (H.aspectWeight * asp) / 100) * (H.frostBase + (H.frostWeight * th) / 100);
    garden[i] =
      slG * (G.slopeBase + (G.aspectWeight * asp) / 100) * (G.frostBase + (G.frostWeight * thG) / 100);
    parts[i * 3] = slH;
    parts[i * 3 + 1] = asp;
    parts[i * 3 + 2] = th;
  }
  return { house, garden, parts };
}

export interface Component {
  /** Label value in the returned label grid. */
  id: number;
  cells: number[];
  acres: number;
}

/**
 * 4-connected patches of cells scoring ≥ minScore, at least minAcres, optionally excluding cells already
 * labelled in another grid. Too-small patches are marked −1 in the label grid. Largest first (stable sort,
 * so equal-area patches keep scan order).
 */
export function components(
  d: Dem,
  score: Float32Array,
  minScore: number,
  minAcres: number,
  excludeLabel?: Int32Array,
): { comps: Component[]; label: Int32Array } {
  const { w, h } = d,
    cell = d.res * d.resY,
    minCells = Math.ceil((minAcres * M2_PER_ACRE) / cell),
    label = new Int32Array(w * h),
    out: Component[] = [];
  let n = 0;
  const stack: number[] = [];
  const excluded = (j: number) => !!excludeLabel && excludeLabel[j]! > 0;
  for (let s = 0; s < w * h; s++) {
    if (!(score[s]! >= minScore) || label[s] || excluded(s)) continue;
    n++;
    stack.push(s);
    label[s] = n;
    const cells: number[] = [];
    while (stack.length) {
      const i = stack.pop()!;
      cells.push(i);
      const r = (i / w) | 0,
        c = i % w;
      for (const [dr, dc] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const rr = r + dr,
          cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= h || cc >= w) continue;
        const j = rr * w + cc;
        if (score[j]! >= minScore && !label[j] && !excluded(j)) {
          label[j] = n;
          stack.push(j);
        }
      }
    }
    if (cells.length < minCells) {
      for (const i of cells) label[i] = -1;
      continue;
    }
    out.push({ id: n, cells, acres: (cells.length * cell) / M2_PER_ACRE });
  }
  out.sort((a, b) => b.acres - a.acres);
  return { comps: out, label };
}

export interface Summary extends Component {
  elevFt: number;
  slopeDeg: number;
  /** Circular mean of the cells' aspects. */
  aspectDeg: number;
  /** Mean row/column, rounded: where the pin goes. */
  rc: [number, number];
  score: number;
  slopeScore: number;
  aspectScore: number;
  thermalScore: number;
}

export function summarize(
  d: Dem,
  slope: Float32Array,
  aspect: Float32Array,
  score: Float32Array,
  parts: Float32Array,
  comp: Component,
): Summary {
  let sz = 0,
    ss = 0,
    sx = 0,
    sy = 0,
    sr = 0,
    sc = 0,
    sq = 0,
    p0 = 0,
    p1 = 0,
    p2 = 0;
  for (const i of comp.cells) {
    sz += d.z[i]!;
    ss += slope[i]!;
    const ang = (aspect[i]! * Math.PI) / 180;
    sx += Math.sin(ang);
    sy += Math.cos(ang);
    sr += (i / d.w) | 0;
    sc += i % d.w;
    sq += score[i]!;
    p0 += parts[i * 3]!;
    p1 += parts[i * 3 + 1]!;
    p2 += parts[i * 3 + 2]!;
  }
  const k = comp.cells.length;
  return {
    ...comp,
    elevFt: (sz / k) * M2FT,
    slopeDeg: ss / k,
    aspectDeg: ((Math.atan2(sx, sy) * 180) / Math.PI + 360) % 360,
    rc: [Math.round(sr / k), Math.round(sc / k)],
    score: sq / k,
    slopeScore: p0 / k,
    aspectScore: p1 / k,
    thermalScore: p2 / k,
  };
}

export interface SiteSearch {
  benches: (Summary & { relaxed: boolean })[];
  label: Int32Array;
  shelves: Summary[];
  shelfLabel: Int32Array;
  gardens: Summary[];
  gardenLabel: Int32Array;
  surfaces: Surfaces;
  diag: { houseAc: number; shelfAc: number; gardenAc: number; totalAc: number };
  /** The house threshold actually used (relaxed if nothing qualified at houseMin). */
  houseMin: number;
  relaxed: boolean;
}

type SiteConfig = Pick<
  UserConfig,
  | "houseMin"
  | "shelfMin"
  | "gardenMin"
  | "benchMinAcres"
  | "shelfMinAcres"
  | "gardenMinAcres"
  | "thermalMinFt"
>;

/** House sites, shelves and garden patches on the fine DEM. */
export function findSites(
  d: Dem,
  slope: Float32Array,
  aspect: Float32Array,
  inside: Uint8Array,
  vf: number,
  cfg: SiteConfig,
): SiteSearch {
  const surf = suitability(d, slope, aspect, inside, vf, cfg.thermalMinFt);
  let houseMin = cfg.houseMin,
    relaxed = false;
  let hc = components(d, surf.house, houseMin, cfg.benchMinAcres);
  if (!hc.comps.length) {
    houseMin = Math.max(K.relaxFloor, cfg.houseMin - K.relaxBy);
    hc = components(d, surf.house, houseMin, cfg.benchMinAcres);
    relaxed = hc.comps.length > 0;
  }
  const benches = hc.comps.map((c) => ({
    ...summarize(d, slope, aspect, surf.house, surf.parts, c),
    relaxed,
  }));
  const sc = components(d, surf.house, cfg.shelfMin, cfg.shelfMinAcres, hc.label);
  const shelves = sc.comps
    .map((c) => summarize(d, slope, aspect, surf.house, surf.parts, c))
    .slice(0, K.maxShelves);
  const gc = components(d, surf.garden, cfg.gardenMin, cfg.gardenMinAcres);
  const gardens = gc.comps
    .map((c) => summarize(d, slope, aspect, surf.garden, surf.parts, c))
    .slice(0, K.maxGardens);
  const cell = d.res * d.resY,
    ac = (x: number) => (x * cell) / M2_PER_ACRE;
  let hAc = 0,
    sAc = 0,
    gAc = 0,
    n = 0;
  for (let i = 0; i < surf.house.length; i++) {
    if (Number.isNaN(surf.house[i]!)) continue;
    n++;
    if (surf.house[i]! >= cfg.houseMin) hAc++;
    else if (surf.house[i]! >= cfg.shelfMin) sAc++;
    if (surf.garden[i]! >= cfg.gardenMin) gAc++;
  }
  return {
    benches,
    label: hc.label,
    shelves,
    shelfLabel: sc.label,
    gardens,
    gardenLabel: gc.label,
    surfaces: surf,
    diag: { houseAc: ac(hAc), shelfAc: ac(sAc), gardenAc: ac(gAc), totalAc: ac(n) },
    houseMin,
    relaxed,
  };
}

/** The result's view of the search (proto L1030, L1037–1038): pins in lat/lon instead of grid cells. */
export function siteResults(
  dFine: Dem,
  vf: number,
  search: SiteSearch,
): Required<Pick<ScreenResult, "benches" | "shelves" | "gardens" | "houseMinUsed">> {
  const pin = (s: Summary) => rcToLL(dFine, s.rc[0], s.rc[1]);
  return {
    benches: search.benches.map((b) => ({
      acres: b.acres,
      elevFt: b.elevFt,
      slopeDeg: b.slopeDeg,
      aspectDeg: b.aspectDeg,
      score: b.score,
      ll: pin(b),
    })),
    shelves: search.shelves.map((s) => ({
      acres: s.acres,
      elevFt: s.elevFt,
      slopeDeg: s.slopeDeg,
      aspectDeg: s.aspectDeg,
      score: s.score,
      ll: pin(s),
    })),
    gardens: search.gardens.map((g) => ({
      acres: g.acres,
      elevFt: g.elevFt,
      slopeDeg: g.slopeDeg,
      aspectDeg: g.aspectDeg,
      score: g.score,
      aboveFt: g.elevFt - vf * M2FT,
      ll: pin(g),
    })),
    houseMinUsed: search.houseMin,
  };
}

/**
 * The terrain step's site flags (proto L1033–1036), in order: a compact-shelf warning, or "no house site"
 * (fatal, or a warning when a house is marked), or the relaxed-threshold warning. The p90 slope flag
 * (terrain.ts) follows these.
 */
export function siteFlags(search: SiteSearch, cfg: UserConfig, hasHouse: boolean): ScreenResult["flags"] {
  const best = search.benches[0];
  const dg = search.diag;
  const compact = search.shelves.filter((s) => s.acres >= cfg.compactMinAcres);
  if (!best && compact.length)
    return [
      {
        lvl: "warn",
        t: `No natural house site (nothing reaches ${cfg.benchMinAcres} contiguous ac at ${search.houseMin}/100), but ${compact.length} pad-sized shelf${compact.length > 1 ? "s" : ""} of ${compact.map((s) => s.acres.toFixed(2)).join(", ")} ac could take a house with a cut pad and walls. If a house is already there, that's the earthwork paid for.`,
      },
    ];
  if (!best)
    return [
      {
        lvl: hasHouse ? "warn" : "fatal",
        t: `No house site: no contiguous ${cfg.benchMinAcres} ac scores even ${search.houseMin}/100 (${dg.houseAc.toFixed(1)} ac scores ≥${cfg.houseMin}, ${dg.shelfAc.toFixed(1)} ac more scores ≥${cfg.shelfMin}). If the imagery shows a flat pad, check the suitability overlay and the DEM cell size before believing this.`,
      },
    ];
  if (best.relaxed)
    return [
      {
        lvl: "warn",
        t: `Nothing reaches ${cfg.houseMin}/100 over ${cfg.benchMinAcres} contiguous acres; house sites below are at a relaxed ${search.houseMin}. Expect cut-and-fill for a pad.`,
      },
    ];
  return [];
}
