/**
 * Water on the land (docs/plans/water.md): where water comes from, where it goes on the parcel, and what the soils
 * hold. Never graded.
 *
 * - **The upslope watershed** (`readWatershed`): 3DEP at 10 m over a box that grows until the catchment closes (or
 *   reaches water.watershedKm's last step), depressions filled, D8; the land draining onto the parcel, its land cover
 *   and roads, and the largest inflow.
 * - **On the parcel** (`measureWater`): flow on the fine grid, seeded at its edge with what the 10 m catchment brings in;
 *   flow lines, the wetness index (for the session's overlay; never stored), likely wet ground, possible pond sites.
 * - **Soil water**: each map unit's available water, drainage, water table, hydrologic group and organic matter.
 */
import { bbox, buffer, simplify } from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { CancelledError, type HttpClient } from "../http";
import { SCREEN_CONSTANTS } from "./config";
import { fetchDEM, llToRC, rcToLL, rcToUTM, utmToRC, type BboxLL, type DemCache } from "./dem";
import {
  accumulate,
  accumulateMfd,
  d8,
  downstream,
  fillDepressions,
  flowLines,
  maskOutline,
  pondSites,
  upslope,
  wetness,
} from "./hydro";
import { fetchLandCover, landCoverAt } from "./landcover";
import { fetchRoadsInBox } from "./roads";
import { components } from "./sites";
import { soilAt, type SoilUnit } from "./soils";
import { insideMask } from "./terrain";
import type { Dem, Endpoints, ScreenResult, SoilRow } from "./types";
import { M2_PER_ACRE, type LatLon } from "./util";

const K = SCREEN_CONSTANTS.water;
const M_PER_MI = 1609.344;

export type Water = NonNullable<ScreenResult["water"]>;

interface Io {
  http: HttpClient;
  endpoints: Endpoints;
  signal?: AbortSignal;
  /** The session's DEM cache: a second run of the same parcel asks 3DEP nothing again. */
  cache?: DemCache;
}

/** The 10 m catchment, as the fine grid's seeding and the result's watershed read it. */
export interface WatershedRead {
  d: Dem;
  acc: Float64Array;
  mask: Uint8Array;
  watershed: NonNullable<Water["watershed"]>;
}

type CoverShares = NonNullable<NonNullable<Water["watershed"]>["cover"]>;

/** NLCD classes, grouped as the summary names them. */
const COVER_GROUP: Record<number, keyof CoverShares> = {
  41: "forest",
  42: "forest",
  43: "forest",
  52: "open",
  71: "open",
  81: "open",
  82: "crops",
  21: "developed",
  22: "developed",
  23: "developed",
  24: "developed",
  11: "water",
  90: "water",
  95: "water",
};

/** Lat/lon of a cell's corner-free box around a mask's cells, [west, south, east, north]. */
function maskBox(d: Dem, mask: Uint8Array): BboxLL | null {
  let r0 = Infinity,
    r1 = -Infinity,
    c0 = Infinity,
    c1 = -Infinity;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const r = (i / d.w) | 0,
      c = i % d.w;
    r0 = Math.min(r0, r);
    r1 = Math.max(r1, r);
    c0 = Math.min(c0, c);
    c1 = Math.max(c1, c);
  }
  if (r0 === Infinity) return null;
  const [n, w] = rcToLL(d, r0 - 0.5, c0 - 0.5);
  const [s, e] = rcToLL(d, r1 + 0.5, c1 + 0.5);
  return [Math.min(w, e), Math.min(s, n), Math.max(w, e), Math.max(s, n)];
}

/** Metres between two [lon, lat] points (an equirectangular approximation, good at a road segment's scale). */
const segM = (a: number[], b: number[]) => {
  const k = Math.cos((((a[1]! + b[1]!) / 2) * Math.PI) / 180);
  return Math.hypot((b[0]! - a[0]!) * k, b[1]! - a[1]!) * 111_320;
};

/**
 * The land draining onto the parcel, on 3DEP at 10 m: the box grows through water.watershedKm until the catchment no
 * longer reaches its edge (`capped` when it still does at the last). Its land cover and roads are read over the
 * catchment's own box. Null when the elevation didn't come.
 */
export async function readWatershed(
  parcel: Feature<Polygon | MultiPolygon>,
  io: Io,
): Promise<WatershedRead | null> {
  let last: {
    d: Dem;
    dir: Int8Array;
    acc: Float64Array;
    target: Uint8Array;
    up: ReturnType<typeof upslope>;
    km: number;
  } | null = null;
  for (const km of K.watershedKm) {
    const box = bbox(buffer(parcel, km, { units: "kilometers" })!) as BboxLL;
    const d = await fetchDEM(box, K.watershedResM, io);
    const f = fillDepressions(d.z, d.w, d.h);
    const dir = d8(f, d.w, d.h, d.res, d.resY);
    const acc = accumulate(dir, d.w, d.h);
    const target = insideMask(d, parcel);
    const up = upslope(dir, d.w, d.h, target, acc);
    last = { d, dir, acc, target, up, km };
    if (!up.open) break;
  }
  if (!last) return null;
  const { d, dir, acc, target, up, km } = last;
  const cellAc = (d.res * d.resY) / M2_PER_ACRE;
  const acres = up.cells * cellAc;
  const outline = up.cells ? maskOutline(d, up.mask, K.outlineToleranceDeg) : null;
  // The largest inflow: the watershed cell flowing straight into the parcel that gathers the most of the watershed
  // itself (all of a cell's upstream would count water that left the parcel and came back in).
  let inflow: { ll: LatLon; acres: number } | null = null;
  if (up.cells) {
    const own = new Float64Array(d.w * d.h);
    for (let i = 0; i < own.length; i++) own[i] = up.mask[i] ? 1 : 0;
    const within = accumulate(dir, d.w, d.h, own);
    let best = -1;
    for (let i = 0; i < own.length; i++) {
      if (!up.mask[i]) continue;
      const j = downstream(dir, d.w, d.h, i);
      if (j < 0 || !target[j]) continue;
      if (best < 0 || within[i]! > within[best]!) best = i;
    }
    if (best >= 0)
      inflow = { ll: roundLL(rcToLL(d, (best / d.w) | 0, best % d.w)), acres: within[best]! * cellAc };
  }

  // What it's made of: land cover over its cells (sampled at most watershedCoverSamples times), and road miles.
  let cover: CoverShares | null = null;
  let roadMi: number | null = null;
  const box = up.cells ? maskBox(d, up.mask) : null;
  if (box) {
    try {
      const lc = await fetchLandCover(box, io.http, 1, {
        url: io.endpoints.nlcd,
        timeoutMs: SCREEN_CONSTANTS.cover.timeoutMs,
        ...(io.signal ? { signal: io.signal } : {}),
      });
      const tally = { forest: 0, open: 0, crops: 0, developed: 0, water: 0, other: 0 };
      const stride = Math.max(1, Math.floor(up.cells / K.watershedCoverSamples));
      let n = 0,
        k = 0;
      for (let i = 0; i < up.mask.length; i++) {
        if (!up.mask[i] || k++ % stride) continue;
        const cls = landCoverAt(lc, rcToLL(d, (i / d.w) | 0, i % d.w));
        if (cls === null || cls === 0) continue;
        tally[COVER_GROUP[cls] ?? "other"]++;
        n++;
      }
      if (n)
        cover = Object.fromEntries(
          Object.entries(tally).map(([g, v]) => [g, Math.round((100 * v) / n)]),
        ) as CoverShares;
    } catch (e) {
      if (e instanceof CancelledError) throw e;
    }
    try {
      const roads = await fetchRoadsInBox(box, io);
      let m = 0;
      for (const f of roads) {
        const lines = f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.coordinates;
        for (const line of lines)
          for (let j = 1; j < line.length; j++) {
            const a = line[j - 1]!,
              b = line[j]!;
            const len = segM(a, b);
            const steps = Math.max(1, Math.ceil(len / d.res));
            for (let t = 0; t < steps; t++) {
              const u = (t + 0.5) / steps;
              const [r, c] = llToRC(d, a[1]! + (b[1]! - a[1]!) * u, a[0]! + (b[0]! - a[0]!) * u);
              const rr = Math.round(r),
                cc = Math.round(c);
              if (rr >= 0 && cc >= 0 && rr < d.h && cc < d.w && up.mask[rr * d.w + cc]) m += len / steps;
            }
          }
      }
      roadMi = m / M_PER_MI;
    } catch (e) {
      if (e instanceof CancelledError) throw e;
    }
  }
  return {
    d,
    acc,
    mask: up.mask,
    watershed: {
      acres,
      outline,
      capped: up.open,
      reachKm: km,
      cover,
      roadMi,
      inflow,
    },
  };
}

const roundLL = ([lat, lon]: LatLon): LatLon => [+lat.toFixed(5), +lon.toFixed(5)];

/** The session's wetness index, for Surface › Wetness: never stored (CLAUDE.md, the fine grid's derivatives). */
export interface WaterSession {
  twi: Float32Array;
}

/**
 * Each map unit's soil water: available water (in, top 40 in), drainage, water table (in), hydrologic group and organic
 * matter, from the dominant component's row and the soil-water query; largest unit first.
 */
export function soilWater(
  units: readonly SoilUnit[] | null,
  rows: readonly SoilRow[],
  water: ReadonlyMap<string, { awsCm: number | null; omPct: number | null }> | null,
): Water["soils"] {
  if (!units) return [];
  const numOf = (v: unknown) =>
    v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;
  return units.map((u) => {
    const comp = rows
      .filter((x) => String(x.mukey) === u.mukey)
      .sort((a, b) => (+b.comppct_r! || 0) - (+a.comppct_r! || 0))[0];
    const w = water?.get(u.mukey);
    const wt = numOf(comp?.wtdepannmin);
    return {
      mukey: u.mukey,
      name: u.muname,
      acres: u.acres,
      awcIn: w?.awsCm != null ? +(w.awsCm / 2.54).toFixed(1) : null,
      drainage: comp ? String(comp.drclassdcd ?? comp.drainagecl ?? "") || null : null,
      waterTableIn: wt === null ? null : Math.round(wt / 2.54),
      hydGroup: comp?.hydgrpdcd ? String(comp.hydgrpdcd) : null,
      omPct: w?.omPct != null ? +w.omPct.toFixed(1) : null,
    };
  });
}

/**
 * Flow and wetness on the fine grid. Accumulation is its own (the driveway's is untouched): depressions filled, D8,
 * each edge cell flowing inward seeded with the 10 m catchment that arrives across its width. Lines over
 * water.flowLineAc; wet ground where the index is in water.twiWet's band and the soil is poorly drained (or the index
 * alone passes water.twiWetAlone); pond sites inside the parcel and out of the flood zone.
 */
export function measureWater(
  fine: { d: Dem; slope: Float32Array; inside: Uint8Array },
  shed: WatershedRead | null,
  wetSoil: Uint8Array,
  flood: Uint8Array | null,
): { flow: NonNullable<Water["flow"]>; session: WaterSession } {
  const { d, slope, inside } = fine;
  const { w, h } = d;
  const cell = d.res * d.resY;
  const cellAc = cell / M2_PER_ACRE;
  const f = fillDepressions(d.z, w, h);
  const dir = d8(f, w, h, d.res, d.resY);
  const seed = new Float64Array(w * h).fill(1);
  if (shed) {
    const cd = shed.d;
    for (let r = 0; r < h; r++)
      for (let c = 0; c < w; c++) {
        if (r > 0 && c > 0 && r < h - 1 && c < w - 1) continue;
        const i = r * w + c;
        if (downstream(dir, w, h, i) < 0) continue;
        const [x, y] = rcToUTM(d, r, c);
        const [cr, cc] = utmToRC(cd, x, y).map(Math.round) as [number, number];
        if (cr < 0 || cc < 0 || cr >= cd.h || cc >= cd.w) continue;
        // The coarse cell's upslope area per metre of its width, times this cell's width, in fine cells.
        seed[i] = 1 + (shed.acc[cr * cd.w + cc]! * cd.res * cd.resY) / cd.res / d.res;
      }
  }
  const acc = accumulate(dir, w, h, seed);
  // The wetness index on flow spread over every lower neighbour (D8 would pile a flat's water into one line).
  const twi = wetness(accumulateMfd(f, w, h, d.res, d.resY, seed), slope, d.res, d.resY, K.minSlopeDeg);

  // Flow lines, longest first, simplified for the map.
  const lines = flowLines(dir, acc, w, h, (K.flowLineAc * M2_PER_ACRE) / cell)
    .sort((a, b) => b.cells.length - a.cells.length || b.acc - a.acc)
    .slice(0, K.maxLines)
    .map((l) => {
      const coords = l.cells.map((i) => {
        const [lat, lon] = rcToLL(d, (i / w) | 0, i % w);
        return [lon, lat] as [number, number];
      });
      const g = simplify(
        { type: "LineString", coordinates: coords },
        { tolerance: K.lineToleranceDeg, highQuality: false },
      );
      return {
        coords: g.coordinates.map(([x, y]) => [+x!.toFixed(6), +y!.toFixed(6)] as [number, number]),
        acres: +(l.acc * cellAc).toFixed(1),
      };
    });

  // Likely wet ground or seeps: the index averaged over 3 × 3 cells, so a line of flow alone doesn't pass.
  const area = new Float32Array(w * h);
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      let s = 0,
        n = 0;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr,
            cc = c + dc;
          if (rr < 0 || cc < 0 || rr >= h || cc >= w) continue;
          const v = twi[rr * w + cc]!;
          if (Number.isNaN(v)) continue;
          s += v;
          n++;
        }
      area[r * w + c] = n ? s / n : NaN;
    }
  const wetScore = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const t = area[i]!;
    wetScore[i] = inside[i] && t >= K.twiWet && (wetSoil[i] || t >= K.twiWetAlone) ? 1 : 0;
  }
  const { comps } = components(d, wetScore, 1, K.wetMinAcres);
  const wet = comps
    .sort((a, b) => b.acres - a.acres)
    .slice(0, K.maxWet)
    .flatMap((comp) => {
      const m = new Uint8Array(w * h);
      let rs = 0,
        cs = 0;
      for (const i of comp.cells) {
        m[i] = 1;
        rs += (i / w) | 0;
        cs += i % w;
      }
      const outline = maskOutline(d, m, K.outlineToleranceFineDeg);
      if (!outline || outline.type !== "Polygon") return [];
      const n = comp.cells.length;
      return [
        {
          ll: roundLL(rcToLL(d, Math.round(rs / n), Math.round(cs / n))),
          acres: +comp.acres.toFixed(2),
          outline: { type: "Feature" as const, properties: {}, geometry: outline },
        },
      ];
    });

  // Possible pond sites: inside the parcel, out of the flood zone.
  const keep = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) keep[i] = inside[i] && !(flood && flood[i]) ? 1 : 0;
  const ponds = pondSites(d, acc, slope, keep, {
    minCells: (K.pondMinAc * M2_PER_ACRE) / cell,
    maxCells: (K.pondMaxAc * M2_PER_ACRE) / cell,
    maxSlopeDeg: K.pondMaxSlopeDeg,
    apartM: K.pondApartM,
    n: K.maxPonds,
  }).map((p) => ({
    ll: roundLL(rcToLL(d, (p.cell / w) | 0, p.cell % w)),
    acres: +(p.acc * cellAc).toFixed(1),
  }));

  return { flow: { lines, wet, ponds }, session: { twi } };
}

/** The best garden patch's soil water: its map unit's available water. */
export function gardenWater(
  garden: { ll: LatLon } | undefined,
  units: SoilUnit[] | null,
  rows: SoilRow[],
  soils: Water["soils"],
): Water["garden"] {
  if (!garden) return null;
  const row = soilAt(units, rows, garden.ll);
  if (!row) return null;
  const u = soils.find((s) => s.mukey === String(row.mukey));
  return u ? { name: u.name, awcIn: u.awcIn } : null;
}
