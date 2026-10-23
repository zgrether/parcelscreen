/**
 * What the area profiler fetches once per area (step 13, docs/plans/step-13-area-catalog.md §3): NLCD 2021 land cover
 * (MRLC's WCS, one GeoTIFF reprojected to latitude and longitude), PAD-US fee land (paginated: a whole area can hold
 * more polygons than one answer), supermarkets and trailheads (one Overpass query), and the 30 m DEM in tiles. Every
 * request goes through the injected HttpClient (lib/http.ts), with its per-host throttle.
 */
import { bbox as bboxOf, booleanPointInPolygon, point, pointToPolygonDistance } from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { fromArrayBuffer } from "geotiff";
import type { HttpClient } from "../http";
import { SCREEN_CONSTANTS } from "../screen/config";
import { fetchDEM, inGrid, llToRC, type BboxLL, type DemDeps } from "../screen/dem";
import type { Dem } from "../screen/types";
import type { LatLon } from "../geo/types";

const K = SCREEN_CONSTANTS.areas;
/** [west, south, east, north], turf's order. */
export type Box = [number, number, number, number];

export const NLCD_WCS = "https://www.mrlc.gov/geoserver/mrlc_download/wcs";
export const NLCD_COVERAGE = "mrlc_download__NLCD_2021_Land_Cover_L48";
const EPSG_4326 = "http://www.opengis.net/def/crs/EPSG/0/4326";

/** A box widened by `km` on every side. */
export function widen([w, s, e, n]: Box, km: number): Box {
  const dLat = km / 111.2;
  const dLon = km / (111.32 * Math.cos((s * Math.PI) / 180));
  return [w - dLon, s - dLat, e + dLon, n + dLat];
}

// ---------- land cover ----------

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
export async function fetchLandCover(box: Box, http: HttpClient, scale = 1): Promise<LandCover> {
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
  const r = await http.fetch(`${NLCD_WCS}?${q}`, { timeoutMs: 120_000 });
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

// ---------- public land ----------

export interface PublicLand {
  /** Every fee polygon, whatever its access, with its box. */
  fee: { f: Feature<Polygon | MultiPolygon>; box: Box; open: boolean }[];
}

/** PAD-US fee land intersecting a box, every page of it, simplified to about 20 m. */
export async function fetchPublicLand(box: Box, http: HttpClient, url: string): Promise<PublicLand> {
  const [w, s, e, n] = box;
  const fee: PublicLand["fee"] = [];
  const page = 1000;
  for (let offset = 0; ; offset += page) {
    const body = new URLSearchParams({
      geometry: JSON.stringify({ xmin: w, ymin: s, xmax: e, ymax: n, spatialReference: { wkid: 4326 } }),
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "Pub_Access",
      outSR: "4326",
      maxAllowableOffset: "0.0002",
      resultOffset: String(offset),
      resultRecordCount: String(page),
      orderByFields: "OBJECTID",
      f: "geojson",
    });
    const r = await http.fetch(`${url}/query`, { method: "POST", body, timeoutMs: 120_000 });
    if (!r.ok) throw new Error(`PAD-US answered ${r.status}`);
    const j = (await r.json()) as {
      features?: Feature<Polygon | MultiPolygon | null, { Pub_Access?: string }>[];
      exceededTransferLimit?: boolean;
      properties?: { exceededTransferLimit?: boolean };
    };
    if (!j.features) throw new Error("PAD-US: no features in the answer");
    for (const f of j.features)
      if (f.geometry)
        fee.push({
          f: f as Feature<Polygon | MultiPolygon>,
          box: bboxOf(f as Feature<Polygon | MultiPolygon>) as Box,
          open: f.properties?.Pub_Access === "OA",
        });
    const more = j.exceededTransferLimit ?? j.properties?.exceededTransferLimit ?? false;
    if (!more || j.features.length === 0) break;
  }
  return { fee };
}

const inBox = ([lat, lon]: LatLon, [w, s, e, n]: Box) => lon >= w && lon <= e && lat >= s && lat <= n;

/** Whether a point is on any fee land. */
export function onPublicLand(land: PublicLand, ll: LatLon): boolean {
  const p = point([ll[1], ll[0]]);
  return land.fee.some((x) => inBox(ll, x.box) && booleanPointInPolygon(p, x.f));
}

/** Feet from a point to the nearest open-access public land, 0 on it; null when none was fetched. */
export function openLandFt(land: PublicLand, ll: LatLon): number | null {
  const p = point([ll[1], ll[0]]);
  // Nearest boxes first, so most polygons are skipped once one is close.
  const ftToBox = ([w, s, e, n]: Box) => {
    const dLat = Math.max(s - ll[0], 0, ll[0] - n) * 111_200;
    const dLon = Math.max(w - ll[1], 0, ll[1] - e) * 111_320 * Math.cos((ll[0] * Math.PI) / 180);
    return Math.hypot(dLat, dLon) * 3.28084;
  };
  const open = land.fee
    .filter((x) => x.open)
    .map((x) => ({ x, near: ftToBox(x.box) }))
    .sort((a, b) => a.near - b.near);
  let best: number | null = null;
  for (const { x, near } of open) {
    if (best !== null && near >= best) break;
    const d = pointToPolygonDistance(p, x.f, { units: "feet" });
    const ft = Math.max(0, d);
    if (best === null || ft < best) best = ft;
  }
  return best;
}

// ---------- places ----------

export interface Places {
  chains: LatLon[];
  otherGroceries: LatLon[];
  trailheads: LatLon[];
}

/** Supermarkets and trailheads in a box: one Overpass query, each mirror tried in turn. */
export async function fetchPlaces(box: Box, http: HttpClient, mirrors: readonly string[]): Promise<Places> {
  const [w, s, e, n] = box.map((x) => x.toFixed(4));
  const b = `${s},${w},${n},${e}`;
  const query = `[out:json][timeout:90];(nwr["shop"="supermarket"](${b});nwr["highway"="trailhead"](${b}););out center tags;`;
  let last: unknown = null;
  for (const m of mirrors) {
    try {
      const r = await http.fetch(m, {
        method: "POST",
        body: new URLSearchParams({ data: query }),
        timeoutMs: 120_000,
      });
      if (!r.ok) throw new Error(`${new URL(m).host} answered ${r.status}`);
      const j = (await r.json()) as {
        elements: {
          lat?: number;
          lon?: number;
          center?: { lat: number; lon: number };
          tags?: Record<string, string>;
        }[];
      };
      const out: Places = { chains: [], otherGroceries: [], trailheads: [] };
      for (const el of j.elements) {
        const lat = el.lat ?? el.center?.lat;
        const lon = el.lon ?? el.center?.lon;
        if (lat === undefined || lon === undefined) continue;
        const ll: LatLon = [+lat.toFixed(5), +lon.toFixed(5)];
        if (el.tags?.highway === "trailhead") out.trailheads.push(ll);
        else if (SCREEN_CONSTANTS.near.bigGrocer.test(`${el.tags?.name ?? ""} ${el.tags?.brand ?? ""}`))
          out.chains.push(ll);
        else out.otherGroceries.push(ll);
      }
      // Overpass's order isn't promised: sorted, so a run's tables are the same however it answers.
      const order = (a: LatLon, c: LatLon) => a[0] - c[0] || a[1] - c[1];
      out.chains.sort(order);
      out.otherGroceries.sort(order);
      out.trailheads.sort(order);
      return out;
    } catch (e) {
      last = e;
    }
  }
  throw new Error(`Overpass unreachable: ${String(last)}`);
}

/** The centres of a grid of cells about `coreKm` square over a box: where a radius search covers it. */
export function gridCentres([w, s, e, n]: Box, coreKm: number = K.demTileCoreKm): LatLon[] {
  const rows = Math.max(1, Math.ceil(((n - s) * 111.2) / coreKm));
  const cols = Math.max(1, Math.ceil(((e - w) * 111.32 * Math.cos((s * Math.PI) / 180)) / coreKm));
  const out: LatLon[] = [];
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++)
      out.push([
        +(s + ((n - s) * (i + 0.5)) / rows).toFixed(5),
        +(w + ((e - w) * (j + 0.5)) / cols).toFixed(5),
      ]);
  return out;
}

/** Points with no repeats (to 5 decimals), in a fixed order. */
export function distinct(points: readonly LatLon[]): LatLon[] {
  const seen = new Map(points.map((ll): [string, LatLon] => [`${ll[0].toFixed(5)},${ll[1].toFixed(5)}`, ll]));
  return [...seen.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

// ---------- the DEM, in tiles ----------

/**
 * DEM tiles covering `box`, each a core of about areas.demTileCoreKm square widened by `marginKm`, so every point has
 * a tile reaching `marginKm` past it on every side (the Long view's horizon).
 */
export async function fetchDemTiles(
  box: Box,
  marginKm: number,
  deps: DemDeps,
  resM: number = K.demResM,
): Promise<Dem[]> {
  const [w, s, e, n] = box;
  const kmLat = (n - s) * 111.2;
  const kmLon = (e - w) * 111.32 * Math.cos((s * Math.PI) / 180);
  const rows = Math.max(1, Math.ceil(kmLat / K.demTileCoreKm));
  const cols = Math.max(1, Math.ceil(kmLon / K.demTileCoreKm));
  const tiles: Dem[] = [];
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      const core: Box = [
        w + ((e - w) * j) / cols,
        s + ((n - s) * i) / rows,
        w + ((e - w) * (j + 1)) / cols,
        s + ((n - s) * (i + 1)) / rows,
      ];
      tiles.push(await fetchDEM(widen(core, marginKm) as BboxLL, resM, deps));
    }
  return tiles;
}

/** The tile a point is deepest inside: its rows and columns farthest from an edge. */
export function tileFor(
  tiles: readonly Dem[],
  [lat, lon]: LatLon,
): { dem: Dem; r: number; c: number } | null {
  let best: { dem: Dem; r: number; c: number; room: number } | null = null;
  for (const dem of tiles) {
    const [r, c] = llToRC(dem, lat, lon).map(Math.round) as [number, number];
    if (!inGrid(dem, r, c)) continue;
    const room = Math.min(r, c, dem.h - 1 - r, dem.w - 1 - c);
    if (!best || room > best.room) best = { dem, r, c, room };
  }
  return best && { dem: best.dem, r: best.r, c: best.c };
}
