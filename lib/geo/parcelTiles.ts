/**
 * Parcel outlines for display, fetched by zoom-14 tile (step 13f plan §1): each state service is asked for a
 * tile's parcels with three fields and simplified geometry, paging when a tile holds more than one response
 * allows. The outlines are for drawing and picking only; a selection fetches the parcel's full record by its
 * object id (`fullRecord`), so screening, acres and the dedupe key never see simplified geometry.
 */
import { bbox, booleanIntersects, featureCollection, point, pointToPolygonDistance } from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { CancelledError, HttpError, type HttpClient } from "../http";
import {
  fieldsFor,
  isPlaceholderRecord,
  recordOutFields,
  sqlString,
  whereFor,
  whereParam,
} from "./parcelFields";
import { PARCEL_SERVICE_TIMEOUTS } from "./serviceStatus";
import {
  parcelFromFeatures,
  parcelFromLine,
  type Bounds,
  type ParcelLine,
  type ParcelRecord,
} from "./parcels";

/**
 * Outlines are fetched and drawn from this zoom up (the prototype used 15). 13f first went to 13.5, which
 * pulled up to ~11,000 outlines into a town view; the owner moved it to 14.
 */
export const LINES_MIN_ZOOM = 14;
/** Below this zoom, a tile with more than DENSE_TILE parcels isn't drawn (it waits for zoom 15). */
export const DENSE_BELOW_ZOOM = 15;
export const DENSE_TILE = 1500;
/** Tiles are the standard Web Mercator XYZ grid at this zoom: about 1.95 × 1.55 km at 37°N. */
export const TILE_ZOOM = 14;

export type Detail = "coarse" | "fine";
/** `maxAllowableOffset` in degrees (outSR 4326): about 2.5 m below zoom 15, about 0.5 m from 15 up. */
export const OFFSET_DEG: Record<Detail, number> = { coarse: 0.000025, fine: 0.000005 };
export const detailFor = (zoom: number): Detail => (zoom >= 15 ? "fine" : "coarse");
/** Pages fetched per tile before it's marked incomplete. */
export const MAX_PAGES = 3;

// The services' field names moved to parcelFields.ts, beside the full record's (#89 pre-flight review).
export { fieldsFor } from "./parcelFields";

export interface Tile {
  x: number;
  y: number;
  bounds: Bounds;
}

const lon2x = (lon: number, n: number) => ((lon + 180) / 360) * n;
const lat2y = (lat: number, n: number) =>
  ((1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2) * n;
const x2lon = (x: number, n: number) => (x / n) * 360 - 180;
const y2lat = (y: number, n: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;

/** The zoom-14 tiles a view touches. */
export function tilesFor(b: Bounds): Tile[] {
  const n = 2 ** TILE_ZOOM;
  const out: Tile[] = [];
  const [x0, x1] = [Math.floor(lon2x(b.west, n)), Math.floor(lon2x(b.east, n))];
  const [y0, y1] = [Math.floor(lat2y(b.north, n)), Math.floor(lat2y(b.south, n))];
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++)
      out.push({
        x,
        y,
        bounds: { west: x2lon(x, n), east: x2lon(x + 1, n), north: y2lat(y, n), south: y2lat(y + 1, n) },
      });
  return out;
}

export const tileKey = (serviceUrl: string, detail: Detail, t: Pick<Tile, "x" | "y">) =>
  `${serviceUrl}|${detail}|${TILE_ZOOM}/${t.x}/${t.y}`;

/** A drawn outline's identity across tiles: its service and object id. */
export function lineKey(line: ParcelLine): string {
  const f = fieldsFor(line.source);
  const props = (line.feature.properties ?? {}) as Record<string, unknown>;
  return `${line.source}|${String(props[f.oid] ?? line.feature.id ?? JSON.stringify(line.feature.geometry))}`;
}

export interface TileResult {
  lines: ParcelLine[];
  /** False when the tile held more than MAX_PAGES pages: some outlines are missing. */
  complete: boolean;
  /** A request failed: worth trying again later, so not cached. */
  failed: boolean;
}

interface Page {
  features?: Feature<Polygon | MultiPolygon>[];
  exceededTransferLimit?: boolean;
  properties?: { exceededTransferLimit?: boolean };
  error?: { message?: string };
}

/** One service's outlines in one tile. A failed request yields what was fetched so far, marked failed. */
/**
 * One page of a tile's outlines, as the form body of a POST to `<service>/query`. Save offline (step 14e) sends the
 * same bodies, so the service worker's cache keys match the map's.
 */
export function tileQuery(serviceUrl: string, tile: Tile, detail: Detail, page: number): URLSearchParams {
  const f = fieldsFor(serviceUrl);
  const b = tile.bounds;
  return new URLSearchParams({
    geometry: JSON.stringify({
      xmin: b.west,
      ymin: b.south,
      xmax: b.east,
      ymax: b.north,
      spatialReference: { wkid: 4326 },
    }),
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    ...whereParam(serviceUrl),
    outFields: [f.oid, f.id, f.county].join(","),
    returnGeometry: "true",
    outSR: "4326",
    maxAllowableOffset: String(OFFSET_DEG[detail]),
    geometryPrecision: "5",
    // Paging needs a stable order (ArcGIS orders by object id when asked).
    orderByFields: f.oid,
    resultOffset: String(page * f.maxRecords),
    resultRecordCount: String(f.maxRecords),
    f: "geojson",
  });
}

export async function fetchTile(
  http: HttpClient,
  serviceUrl: string,
  tile: Tile,
  detail: Detail,
  signal?: AbortSignal,
): Promise<TileResult> {
  const lines: ParcelLine[] = [];
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const q = tileQuery(serviceUrl, tile, detail, page);
      const r = await http.fetch(`${serviceUrl}/query`, {
        method: "POST",
        body: q,
        ...PARCEL_SERVICE_TIMEOUTS,
        ...(signal ? { signal } : {}),
      });
      if (!r.ok) return { lines, complete: false, failed: true };
      const j = (await r.json()) as Page;
      if (j.error) return { lines, complete: false, failed: true };
      for (const feature of j.features ?? [])
        if (!isPlaceholderRecord(serviceUrl, feature.properties)) lines.push({ feature, source: serviceUrl });
      if (!(j.exceededTransferLimit || j.properties?.exceededTransferLimit))
        return { lines, complete: true, failed: false };
    }
    return { lines, complete: false, failed: false };
  } catch (err) {
    if (err instanceof CancelledError) throw err;
    return { lines, complete: false, failed: true };
  }
}

/**
 * How many parcels a service has in a tile (a count-only request: a few bytes), for the density guard.
 * Null when the service doesn't answer.
 */
export async function countTile(
  http: HttpClient,
  serviceUrl: string,
  tile: Tile,
  signal?: AbortSignal,
): Promise<number | null> {
  const b = tile.bounds;
  const q = new URLSearchParams({
    geometry: JSON.stringify({
      xmin: b.west,
      ymin: b.south,
      xmax: b.east,
      ymax: b.north,
      spatialReference: { wkid: 4326 },
    }),
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    ...whereParam(serviceUrl),
    returnCountOnly: "true",
    f: "json",
  });
  try {
    const r = await http.fetch(`${serviceUrl}/query`, {
      method: "POST",
      body: q,
      ...PARCEL_SERVICE_TIMEOUTS,
      ...(signal ? { signal } : {}),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { count?: unknown };
    return typeof j.count === "number" ? j.count : null;
  } catch (err) {
    if (err instanceof CancelledError) throw err;
    return null;
  }
}

/** Whether a tile is drawn at this zoom: always from DENSE_BELOW_ZOOM; below it, only if not dense. */
export const drawsAt = (zoom: number, count: number | null): boolean =>
  zoom >= DENSE_BELOW_ZOOM || count === null || count <= DENSE_TILE;

/**
 * The full county record behind a drawn outline (the fields the app reads, full geometry), by the object id in its
 * properties, or for a service whose parcels can be several features (Tennessee, step 2) by its id: every feature of
 * the record, as one multi-part parcel. Where the service marks boundary conflicts, the record says whether one
 * overlaps it (`boundary_conflict`). Throws when there's no id or the service doesn't return the record: a
 * simplified outline is never used in its place. A service that fails (an HTTP error, or an ArcGIS error in the body)
 * throws HttpError, so the explorer can name it (serviceStatus isServiceDown).
 */
export async function fullRecord(
  http: HttpClient,
  outline: { source: string; props: Record<string, unknown> },
  signal?: AbortSignal,
): Promise<ParcelRecord> {
  const f = fieldsFor(outline.source);
  const key = f.groupById ? outline.props[f.id] : outline.props[f.oid];
  if (key == null || key === "") throw new Error("This outline has no record id");
  const q = new URLSearchParams({
    ...(f.groupById
      ? { where: whereFor(outline.source, `${f.id}=${sqlString(String(key))}`), orderByFields: f.oid }
      : { objectIds: String(key) }),
    outFields: recordOutFields(outline.source),
    returnGeometry: "true",
    outSR: "4326",
    f: "geojson",
  });
  const r = await http.fetch(`${outline.source}/query?${q}`, {
    ...PARCEL_SERVICE_TIMEOUTS,
    ...(signal ? { signal } : {}),
  });
  const host = new URL(outline.source).host;
  if (!r.ok) throw new HttpError(r.status, host);
  const j = (await r.json()) as Page;
  if (j.error) throw new HttpError(500, host, j.error.message || `${host} error`);
  const features = j.features ?? [];
  if (!features.length) throw new Error("The record wasn't found");
  const record = f.groupById
    ? parcelFromFeatures(features, outline.source)
    : parcelFromLine({ feature: features[0]!, source: outline.source });
  return f.conflictWhere ? withConflicts(http, record, f.conflictWhere, signal) : record;
}

/** A conflict this close to a parcel's edge, m, touches it: county lines don't always meet exactly. */
export const CONFLICT_NEAR_M = 1;

/**
 * The record, with `boundary_conflict: true` when a conflict polygon touches or overlaps any part of it. The county
 * draws the disputed land as its own polygon beside the parcels it's between, sharing their edges (Carter's 010066
 * 03700, checked 2026-10-17: the conflict lies outside the tract, three of its corners on the tract's line), so a
 * conflict touching the parcel concerns it. The service is asked for the conflicts in the record's bounding box; if it
 * doesn't answer, the record is returned as it is, because a missing warning shouldn't stop a selection.
 */
async function withConflicts(
  http: HttpClient,
  record: ParcelRecord,
  conflictWhere: string,
  signal?: AbortSignal,
): Promise<ParcelRecord> {
  const parts = record.parts?.length ? record.parts : [record.geo];
  const [west, south, east, north] = bbox(featureCollection(parts));
  const q = new URLSearchParams({
    where: conflictWhere,
    geometry: JSON.stringify({
      xmin: west,
      ymin: south,
      xmax: east,
      ymax: north,
      spatialReference: { wkid: 4326 },
    }),
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "OBJECTID",
    returnGeometry: "true",
    outSR: "4326",
    f: "geojson",
  });
  try {
    const r = await http.fetch(`${record.source}/query`, {
      method: "POST",
      body: q,
      ...PARCEL_SERVICE_TIMEOUTS,
      ...(signal ? { signal } : {}),
    });
    if (!r.ok) return record;
    const j = (await r.json()) as Page;
    if (j.error) return record;
    const touches = (j.features ?? []).some((c) => parts.some((part) => conflictTouches(c, part)));
    return touches ? { ...record, props: { ...record.props, boundary_conflict: true } } : record;
  } catch (err) {
    if (err instanceof CancelledError) throw err;
    return record;
  }
}

/** Whether a conflict polygon overlaps the parcel's part, shares its edge, or has a corner within CONFLICT_NEAR_M of it. */
export function conflictTouches(conflict: Feature<Polygon | MultiPolygon>, part: Feature<Polygon>): boolean {
  if (booleanIntersects(conflict, part)) return true;
  const rings =
    conflict.geometry.type === "Polygon" ? [conflict.geometry.coordinates] : conflict.geometry.coordinates;
  return rings.some((poly) =>
    poly[0]!.some((c) => pointToPolygonDistance(point(c), part, { units: "meters" }) <= CONFLICT_NEAR_M),
  );
}

/** Tiles already fetched this session, least recently used dropped first (memory only, never persisted). */
export class TileCache {
  private readonly tiles = new Map<string, TileResult>();
  constructor(private readonly max = 400) {}

  get(key: string): TileResult | undefined {
    const hit = this.tiles.get(key);
    if (hit) {
      // Re-insert: a Map iterates in insertion order, so the oldest entry is the least recently used.
      this.tiles.delete(key);
      this.tiles.set(key, hit);
    }
    return hit;
  }

  set(key: string, value: TileResult): void {
    this.tiles.delete(key);
    this.tiles.set(key, value);
    while (this.tiles.size > this.max) this.tiles.delete(this.tiles.keys().next().value!);
  }

  get size(): number {
    return this.tiles.size;
  }
}
