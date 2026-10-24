/**
 * NLCD 2021 land cover (MRLC's WCS, one GeoTIFF reprojected to latitude and longitude), for the area profiler (step 13)
 * and, since step 14, the parcel screen (docs/plans/step-14-land-uses.md §2.4): how much of the parcel is forest, how
 * much open, and how much open ground is gentle, and near a road. Not graded: Hunt, Camp and Garden read it.
 */
import { fromArrayBuffer } from "geotiff";
import { lineString, pointToLineDistance } from "@turf/turf";
import type { HttpClient } from "../http";
import { SCREEN_CONSTANTS } from "./config";
import { rcToLL } from "./dem";
import type { Dem } from "./types";
import { M2_PER_ACRE } from "../geo/types";
import type { LatLon } from "./util";

export const NLCD_WCS = "https://www.mrlc.gov/geoserver/mrlc_download/wcs";
export const NLCD_COVERAGE = "mrlc_download__NLCD_2021_Land_Cover_L48";
const EPSG_4326 = "http://www.opengis.net/def/crs/EPSG/0/4326";

/** [west, south, east, north], turf's order. */
export type Box = [number, number, number, number];

export interface LandCover {
  west: number;
  north: number;
  dx: number;
  dy: number;
  w: number;
  h: number;
  classes: Uint8Array;
}

/** NLCD's class at a point; null off the raster. */
export function landCoverAt(g: LandCover, [lat, lon]: LatLon): number | null {
  const c = Math.floor((lon - g.west) / g.dx);
  const r = Math.floor((g.north - lat) / g.dy);
  if (r < 0 || c < 0 || r >= g.h || c >= g.w) return null;
  return g.classes[r * g.w + c]!;
}

/** NLCD 2021 over a box, reprojected by the WCS to latitude and longitude; `scale` below 1 coarsens it (the tests). */
export async function fetchLandCover(
  box: Box,
  http: HttpClient,
  scale = 1,
  opts: { signal?: AbortSignal; timeoutMs?: number; url?: string } = {},
): Promise<LandCover> {
  const [w, s, e, n] = box;
  const q = [
    "service=WCS",
    "version=2.0.1",
    "request=GetCoverage",
    `coverageId=${NLCD_COVERAGE}`,
    `subset=Lat(${s.toFixed(4)},${n.toFixed(4)})`,
    `subset=Long(${w.toFixed(4)},${e.toFixed(4)})`,
    `subsettingcrs=${EPSG_4326}`,
    `outputcrs=${EPSG_4326}`,
    ...(scale < 1 ? [`scalefactor=${scale}`] : []),
    "format=image/geotiff",
  ].join("&");
  const r = await http.fetch(`${opts.url ?? NLCD_WCS}?${q}`, {
    timeoutMs: opts.timeoutMs ?? 120_000,
    ...(opts.signal ? { signal: opts.signal } : {}),
  });
  if (!r.ok) throw new Error(`NLCD answered ${r.status}`);
  const image = await (await fromArrayBuffer(await r.arrayBuffer())).getImage();
  const [x0, y0] = image.getOrigin() as [number, number];
  const [dx, dy] = image.getResolution() as [number, number];
  const [band] = (await image.readRasters()) as unknown as [ArrayLike<number>];
  return {
    west: x0,
    north: y0,
    dx: Math.abs(dx),
    dy: Math.abs(dy),
    w: image.getWidth(),
    h: image.getHeight(),
    classes: Uint8Array.from(band),
  };
}

const K = SCREEN_CONSTANTS.cover;

/** NLCD's forest classes (deciduous, evergreen, mixed). */
const FOREST = new Set([41, 42, 43]);
/** Open land: barren, shrub, grassland, pasture and hay, crops. */
const OPEN = new Set([31, 52, 71, 81, 82]);

export interface Cover {
  /** Percent of the parcel's cells, 0–100, rounded. */
  forestPct: number;
  openPct: number;
  /** Open ground at most uses.trailMaxGradePct steep. */
  openGentleAc: number;
  /** Of that, the acres within cover.nearRoadFt of a road. */
  openNearRoadAc: number;
  year: number;
}

/**
 * The parcel's cover from the fine DEM's cells inside it: each cell's NLCD class at its centre (30 m NLCD over 3 m
 * cells), its slope from the terrain step, and its distance to the nearest road (every cover.roadStride cells).
 */
export function measureCover(
  lc: LandCover,
  d: Dem,
  slopeDeg: Float32Array,
  inside: Uint8Array,
  roads: readonly [number, number][][],
): Cover {
  const gentleDeg = (Math.atan(SCREEN_CONSTANTS.uses.trailMaxGradePct / 100) * 180) / Math.PI;
  const cellAc = (d.res * d.resY) / M2_PER_ACRE;
  const lines = roads.filter((c) => c.length >= 2).map((c) => lineString(c));
  const nearM = K.nearRoadFt / 3.28084;
  let n = 0,
    forest = 0,
    open = 0,
    gentle = 0,
    near = 0;
  for (let r = 0; r < d.h; r++)
    for (let c = 0; c < d.w; c++) {
      const i = r * d.w + c;
      if (!inside[i]) continue;
      n++;
      const cls = landCoverAt(lc, rcToLL(d, r, c));
      if (cls === null) continue;
      if (FOREST.has(cls)) forest++;
      else if (OPEN.has(cls)) {
        open++;
        if (slopeDeg[i]! <= gentleDeg) {
          gentle++;
          // The road distance on a coarser lattice: the cell stands for its stride-square block.
          if (r % K.roadStride === 0 && c % K.roadStride === 0 && lines.length) {
            const [lat, lon] = rcToLL(d, r, c);
            if (lines.some((l) => pointToLineDistance([lon, lat], l, { units: "meters" }) <= nearM))
              near += K.roadStride * K.roadStride;
          }
        }
      }
    }
  const pct = (k: number) => (n ? Math.round((k / n) * 100) : 0);
  return {
    forestPct: pct(forest),
    openPct: pct(open),
    openGentleAc: Math.round(gentle * cellAc * 100) / 100,
    openNearRoadAc: Math.round(Math.min(near, gentle) * cellAc * 100) / 100,
    year: 2021,
  };
}
