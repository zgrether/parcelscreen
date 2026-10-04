/**
 * Elevation: USGS 3DEP `exportImage` on the UTM 17N grid, with the AWS terrarium tiles as a fallback, plus
 * the grid helpers every later module uses. Ported from the prototype (proto L718–770, and `bilinear`
 * from the 3D view, L1663). The arithmetic is verbatim; two things are restructured:
 * - terrarium PNGs are decoded with fast-png instead of a canvas, so this runs in a Worker and in Node;
 * - DEMs are cached per session (DemCache), so re-running or re-evaluating never refetches the wide DEM
 *   (CLAUDE.md "cache the wide DEM per parcel centroid"). Nothing here is ever persisted.
 */
import { bbox, buffer } from "@turf/turf";
import type { Feature, Polygon } from "geojson";
import { decode } from "fast-png";
import { fromArrayBuffer } from "geotiff";
import { CancelledError, type HttpClient } from "../http";
import * as UTM from "../geo/utm";
import type { LatLon } from "../geo/types";
import { SCREEN_CONSTANTS } from "./config";
import type { Dem, Endpoints } from "./types";

const K = SCREEN_CONSTANTS.dem;

/** [west, south, east, north] in degrees. */
export type BboxLL = [number, number, number, number];

// ---------- grid helpers (proto L763–770) ----------

export const at = (d: Dem, r: number, c: number): number => d.z[r * d.w + c]!;
export const rcToUTM = (d: Dem, r: number, c: number): [number, number] => [
  d.x0 + (c + 0.5) * d.res,
  d.y0 - (r + 0.5) * d.resY,
];
export const utmToRC = (d: Dem, x: number, y: number): [number, number] => [
  Math.floor((d.y0 - y) / d.resY),
  Math.floor((x - d.x0) / d.res),
];
export const rcToLL = (d: Dem, r: number, c: number): LatLon => {
  const [x, y] = rcToUTM(d, r, c);
  return UTM.inv(x, y);
};
export const llToRC = (d: Dem, lat: number, lon: number): [number, number] => {
  const [x, y] = UTM.fwd(lat, lon);
  return utmToRC(d, x, y);
};
/** [[south, west], [north, east]] of the grid, as the prototype handed Leaflet. */
export const bounds = (d: Dem): [LatLon, LatLon] => {
  const sw = UTM.inv(d.x0, d.y0 - d.h * d.resY),
    ne = UTM.inv(d.x0 + d.w * d.res, d.y0);
  return [
    [sw[0], sw[1]],
    [ne[0], ne[1]],
  ];
};
export const inGrid = (d: Dem, r: number, c: number): boolean => r >= 0 && c >= 0 && r < d.h && c < d.w;

/** UTM → elevation by bilinear interpolation; NaN outside the grid or next to a no-data cell (proto L1663). */
export function bilinear(d: Dem, x: number, y: number): number {
  const fc = (x - d.x0) / d.res - 0.5,
    fr = (d.y0 - y) / d.resY - 0.5;
  const c0 = Math.floor(fc),
    r0 = Math.floor(fr);
  if (c0 < 0 || r0 < 0 || c0 >= d.w - 1 || r0 >= d.h - 1) return NaN;
  const ax = fc - c0,
    ay = fr - r0,
    z00 = at(d, r0, c0),
    z01 = at(d, r0, c0 + 1),
    z10 = at(d, r0 + 1, c0),
    z11 = at(d, r0 + 1, c0 + 1);
  if ([z00, z01, z10, z11].some(Number.isNaN)) return NaN;
  return (z00 * (1 - ax) + z01 * ax) * (1 - ay) + (z10 * (1 - ax) + z11 * ax) * ay;
}

// ---------- cache ----------

/**
 * In-memory, per session: DEMs keyed by (bbox to 1e-5°, cell size) and decoded terrarium tiles. Small LRU;
 * a parcel needs two DEMs, so four entries keep the last two parcels.
 */
export class DemCache {
  private readonly dems = new Map<string, Promise<Dem>>();
  readonly tiles = new Map<string, Promise<Float32Array>>();

  constructor(private readonly maxDems = 4) {}

  static key(b: BboxLL, resM: number): string {
    return `${b.map((v) => v.toFixed(5)).join(",")}@${resM}`;
  }

  get(key: string, load: () => Promise<Dem>): Promise<Dem> {
    const hit = this.dems.get(key);
    if (hit) {
      this.dems.delete(key); // refresh recency
      this.dems.set(key, hit);
      return hit;
    }
    const p = load();
    this.dems.set(key, p);
    p.catch(() => this.dems.delete(key)); // never cache a failure
    while (this.dems.size > this.maxDems) this.dems.delete(this.dems.keys().next().value!);
    return p;
  }
}

// ---------- fetching ----------

export interface DemDeps {
  http: HttpClient;
  endpoints: Endpoints;
  signal?: AbortSignal;
  /** Waits between 3DEP attempts; injectable so tests don't wait. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Told when 3DEP gave up and the terrarium fallback is used (the prototype's console.warn). */
  onWarn?: (message: string) => void;
  cache?: DemCache;
}

const defaultSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new CancelledError());
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new CancelledError());
      },
      { once: true },
    );
  });

interface Grid {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  w: number;
  h: number;
}

/** A DEM covering `bboxLL` at `resM` metres: 3DEP, else terrarium tiles (proto L718–739). */
export function fetchDEM(bboxLL: BboxLL, resM: number, deps: DemDeps): Promise<Dem> {
  const load = () => fetchDEMUncached(bboxLL, resM, deps);
  return deps.cache ? deps.cache.get(DemCache.key(bboxLL, resM), load) : load();
}

async function fetchDEMUncached(bboxLL: BboxLL, resM: number, deps: DemDeps): Promise<Dem> {
  const [W, S, E, N] = bboxLL;
  const [x0, y0] = UTM.fwd(S, W),
    [x1, y1] = UTM.fwd(N, E);
  const w = Math.max(K.minCellsPerSide, Math.ceil((x1 - x0) / resM)),
    h = Math.max(K.minCellsPerSide, Math.ceil((y1 - y0) / resM));
  if (w * h > K.maxCells) throw new Error("DEM request too large; raise cell size");
  const sleep = deps.sleep ?? defaultSleep;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < K.attempts; attempt++) {
    try {
      const q = new URLSearchParams({
        bbox: `${x0},${y0},${x1},${y1}`,
        bboxSR: "26917",
        imageSR: "26917",
        size: `${w},${h}`,
        format: "tiff",
        pixelType: "F32",
        interpolation: "RSP_BilinearInterpolation",
        noDataInterpretation: "esriNoDataMatchAny",
        f: "image",
      });
      const r = await deps.http.fetch(`${deps.endpoints.dem}/exportImage?${q}`, {
        timeoutMs: K.timeoutMs,
        ...(deps.signal ? { signal: deps.signal } : {}),
      });
      if (!r.ok) throw new Error("3DEP " + r.status);
      const tiff = await fromArrayBuffer(await r.arrayBuffer());
      const img = await tiff.getImage();
      const [band] = (await img.readRasters()) as unknown as ArrayLike<number>[];
      const [ox, oy] = img.getOrigin() as [number, number];
      const [rx, ry] = img.getResolution() as [number, number];
      const z = new Float32Array(band!.length);
      for (let i = 0; i < band!.length; i++) {
        const v = band![i]!;
        z[i] = v < K.noDataBelowM || !Number.isFinite(v) ? NaN : v;
      }
      return {
        z,
        w: img.getWidth(),
        h: img.getHeight(),
        x0: ox,
        y0: oy,
        res: Math.abs(rx),
        resY: Math.abs(ry),
        source: "USGS 3DEP",
      };
    } catch (e) {
      lastErr = e;
      if (e instanceof CancelledError) throw e;
      await sleep(K.retryDelayMs * (attempt + 1), deps.signal);
    }
  }
  deps.onWarn?.(
    `3DEP unavailable, falling back to Terrain Tiles: ${(lastErr as Error | null)?.message ?? ""}`,
  );
  return fetchTerrarium(bboxLL, resM, { x0, y0, x1, y1, w, h }, deps);
}

/** Decodes one terrarium tile: elevation = R·256 + G + B/256 − 32768 metres. */
export function decodeTerrarium(png: ArrayBuffer | Uint8Array): Float32Array {
  const img = decode(png instanceof Uint8Array ? png : new Uint8Array(png));
  if (img.width !== 256 || img.height !== 256)
    throw new Error(`terrarium tile is ${img.width}×${img.height}`);
  const ch = img.channels,
    d = img.data;
  const el = new Float32Array(65536);
  for (let i = 0; i < 65536; i++) el[i] = d[i * ch]! * 256 + d[i * ch + 1]! + d[i * ch + 2]! / 256 - 32768;
  return el;
}

function terrariumTile(z: number, tx: number, ty: number, deps: DemDeps): Promise<Float32Array> {
  const key = `${z}/${tx}/${ty}`;
  const hit = deps.cache?.tiles.get(key);
  if (hit) return hit;
  const p = (async () => {
    const r = await deps.http.fetch(
      `${deps.endpoints.terrarium}/${z}/${tx}/${ty}.png`,
      deps.signal ? { signal: deps.signal } : {},
    );
    if (!r.ok) throw new Error(`tile ${z}/${tx}/${ty}`);
    return decodeTerrarium(await r.arrayBuffer());
  })();
  deps.cache?.tiles.set(key, p);
  p.catch(() => deps.cache?.tiles.delete(key));
  return p;
}

/** Fallback DEM from AWS terrain tiles (USGS NED / SRTM), resampled onto the same UTM grid (proto L748–762). */
export async function fetchTerrarium(bboxLL: BboxLL, resM: number, g: Grid, deps: DemDeps): Promise<Dem> {
  const T = K.terrarium;
  if (resM < T.minResM) {
    resM = T.minResM;
    g = {
      ...g,
      w: Math.max(K.minCellsPerSide, Math.ceil((g.x1 - g.x0) / resM)),
      h: Math.max(K.minCellsPerSide, Math.ceil((g.y1 - g.y0) / resM)),
    };
  }
  const zoom = T.zoomFor.find(([maxRes]) => resM <= maxRes)![1],
    n = 2 ** zoom;
  const px = (lat: number, lon: number): [number, number] => {
    const x = ((lon + 180) / 360) * n * 256;
    const s = Math.sin((lat * Math.PI) / 180);
    const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n * 256;
    return [x, y];
  };
  const [W, S, E, N] = bboxLL;
  const [pxW, pyN] = px(N, W),
    [pxE, pyS] = px(S, E);
  const tx0 = Math.floor(pxW / 256),
    tx1 = Math.floor(pxE / 256),
    ty0 = Math.floor(pyN / 256),
    ty1 = Math.floor(pyS / 256);
  if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) > T.maxTiles) throw new Error("terrain fallback: area too large");
  const tiles: Record<string, Float32Array> = {};
  await Promise.all(
    Array.from({ length: (tx1 - tx0 + 1) * (ty1 - ty0 + 1) }, (_, i) => {
      const tx = tx0 + (i % (tx1 - tx0 + 1)),
        ty = ty0 + Math.floor(i / (tx1 - tx0 + 1));
      return terrariumTile(zoom, tx, ty, deps).then((t) => {
        tiles[`${tx}/${ty}`] = t;
      });
    }),
  );
  const sample = (lat: number, lon: number): number => {
    const [x, y] = px(lat, lon);
    const tx = Math.floor(x / 256),
      ty = Math.floor(y / 256);
    const t = tiles[`${tx}/${ty}`];
    if (!t) return NaN;
    const fx = x - tx * 256,
      fy = y - ty * 256;
    const i0 = Math.min(255, Math.floor(fx)),
      j0 = Math.min(255, Math.floor(fy)),
      i1 = Math.min(255, i0 + 1),
      j1 = Math.min(255, j0 + 1),
      ax = fx - i0,
      ay = fy - j0;
    return (
      (t[j0 * 256 + i0]! * (1 - ax) + t[j0 * 256 + i1]! * ax) * (1 - ay) +
      (t[j1 * 256 + i0]! * (1 - ax) + t[j1 * 256 + i1]! * ax) * ay
    );
  };
  const out: Dem = {
    z: new Float32Array(g.w * g.h),
    w: g.w,
    h: g.h,
    x0: g.x0,
    y0: g.y1,
    res: (g.x1 - g.x0) / g.w,
    resY: (g.y1 - g.y0) / g.h,
    source: "AWS Terrain Tiles (NED/SRTM)",
  };
  for (let r = 0; r < g.h; r++)
    for (let c = 0; c < g.w; c++) {
      const [lat, lon] = UTM.inv(g.x0 + (c + 0.5) * out.res, g.y1 - (r + 0.5) * out.resY);
      out.z[r * g.w + c] = sample(lat, lon);
    }
  return out;
}

// ---------- the 'dem' step ----------

/** The fine DEM's cell size from the user's setting: clamped to [1, 30] m, default 3 (proto L1012). */
export const fineResM = (demResM: number): number => Math.min(K.resMaxM, Math.max(K.resMinM, +demResM || 3));

/** Request bboxes for a parcel: the fine DEM (parcel + 150 m) and the wide DEM for the horizon (+ 6 km). */
export function parcelBboxes(parcel: Feature<Polygon>): { fine: BboxLL; wide: BboxLL } {
  return {
    fine: bbox(buffer(parcel, K.fineBufferKm, { units: "kilometers" })!) as BboxLL,
    wide: bbox(buffer(parcel, K.wideBufferKm, { units: "kilometers" })!) as BboxLL,
  };
}

/** The 'dem' step: fine then wide, sequentially as in the prototype (proto L1010–1015). */
export async function fetchParcelDems(
  parcel: Feature<Polygon>,
  demResM: number,
  deps: DemDeps,
): Promise<{ dFine: Dem; dWide: Dem }> {
  const b = parcelBboxes(parcel);
  const dFine = await fetchDEM(b.fine, fineResM(demResM), deps);
  const dWide = await fetchDEM(b.wide, K.wideResM, deps);
  return { dFine, dWide };
}
