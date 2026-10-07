/**
 * Recorded parcel boundaries from the state services (NC OneMap, VGIN, TN Comptroller), tried in the
 * order given by `endpoints.parcels`. Ported from the prototype's pickParcel / refreshLines / setParcel
 * (proto L549–558, L657–705) with the map and DOM removed: callers get data back and render it.
 */
import { area, booleanPointInPolygon, destination, point, polygon } from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { CancelledError, type HttpClient } from "../http";
import { PARCEL_SERVICE_TIMEOUTS } from "./serviceStatus";
import { M2_PER_ACRE, type LatLon } from "./types";

export type ParcelSource = "county" | "drawn" | "square" | "split" | "saved" | "combined";

export interface ParcelRecord {
  geo: Feature<Polygon>;
  props: Record<string, unknown>;
  /** The service URL for county records; otherwise how the boundary was made. */
  source: string;
  /**
   * The record was a MultiPolygon and only its first polygon is kept, as in the prototype (plan B7);
   * the UI shows a "multi-part parcel: only the first part screened" note.
   */
  multiPart: boolean;
  /** For a combination: the parcels it was made from, so it can be edited later. */
  members?: ParcelRecord[];
}

export interface PickResult {
  parcel: ParcelRecord | null;
  /** What each service said when none returned a parcel, e.g. "services.nconemap.gov: no parcel at this point". */
  report: string[];
}

interface ParcelFeatureCollection {
  features?: Feature<Polygon | MultiPolygon>[];
  error?: { message?: string };
}

function firstPolygon(f: Feature<Polygon | MultiPolygon>): { geo: Feature<Polygon>; multiPart: boolean } {
  return f.geometry.type === "MultiPolygon"
    ? { geo: polygon(f.geometry.coordinates[0]!), multiPart: true }
    : { geo: polygon(f.geometry.coordinates), multiPart: false };
}

/** The parcel under a point: each service in turn until one returns a feature. */
export async function pickParcelAt(
  http: HttpClient,
  serviceUrls: readonly string[],
  ll: LatLon,
  signal?: AbortSignal,
): Promise<PickResult> {
  const report: string[] = [];
  for (const url of serviceUrls) {
    const short = url.replace(/^https?:\/\//, "").split("/")[0];
    try {
      const q = new URLSearchParams({
        geometry: `${ll[1]},${ll[0]}`,
        geometryType: "esriGeometryPoint",
        inSR: "4326",
        spatialRel: "esriSpatialRelIntersects",
        outFields: "*",
        returnGeometry: "true",
        outSR: "4326",
        f: "geojson",
      });
      const r = await http.fetch(`${url}/query?${q}`, {
        ...PARCEL_SERVICE_TIMEOUTS,
        ...(signal ? { signal } : {}),
      });
      if (!r.ok) {
        report.push(`${short}: HTTP ${r.status}`);
        continue;
      }
      const j = (await r.json()) as ParcelFeatureCollection;
      if (j.error) {
        report.push(`${short}: ${j.error.message || "error"}`);
        continue;
      }
      const f = (j.features || [])[0];
      if (!f) {
        report.push(`${short}: no parcel at this point`);
        continue;
      }
      const { geo, multiPart } = firstPolygon(f);
      return {
        parcel: { geo, props: (f.properties as Record<string, unknown>) || {}, source: url, multiPart },
        report,
      };
    } catch (err) {
      if (err instanceof CancelledError) throw err;
      report.push(`${short}: ${(err as Error).message || "unreachable"}`);
    }
  }
  return { parcel: null, report };
}

export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface ParcelLine {
  feature: Feature<Polygon | MultiPolygon>;
  /** The service it came from (the prototype's `_src`). */
  source: string;
}

/**
 * Which outline a tap means, of those drawn under it: the ones containing the point, the smallest first;
 * null when none contains it. Neighbours share their boundary lines, so a tap right on a line is inside
 * both, and which one the map happened to draw on top made the choice before.
 */
export function pickOutline(lines: readonly ParcelLine[], ll: LatLon): ParcelLine | null {
  const pt = point([ll[1], ll[0]]);
  let best: { line: ParcelLine; m2: number } | null = null;
  for (const line of lines) {
    if (!booleanPointInPolygon(pt, line.feature)) continue;
    const m2 = area(line.feature);
    if (!best || m2 < best.m2) best = { line, m2 };
  }
  return best?.line ?? null;
}

/** Which recorded parcel to use when the user taps an outline (same first-polygon rule as pickParcelAt). */
export function parcelFromLine(line: ParcelLine): ParcelRecord {
  const { geo, multiPart } = firstPolygon(line.feature);
  return {
    geo,
    props: (line.feature.properties as Record<string, unknown>) || {},
    source: line.source,
    multiPart,
  };
}

export interface ParcelFacts {
  acres: number;
  owner: string | null;
  parcelId: string | null;
  address: string | null;
  county: string | null;
}

/** Case-insensitive lookup over the services' differing attribute names (proto L695–696). */
export function parcelFacts(geo: Feature<Polygon>, props: Record<string, unknown>): ParcelFacts {
  const keys = Object.keys(props);
  const pick = (...ks: string[]): string | null => {
    for (const k of ks) {
      const hit = keys.find((x) => x.toLowerCase() === k.toLowerCase());
      if (hit && props[hit]) return String(props[hit]);
    }
    return null;
  };
  return {
    // A combined boundary may include a bridged strip that isn't part of the listing (lib/geo/combine.ts).
    acres: typeof props.combined_acres === "number" ? props.combined_acres : area(geo) / M2_PER_ACRE,
    owner: pick("ownname", "owner", "ownername", "owner1", "OWNER_NAME"),
    parcelId: pick("parno", "parcelid", "pin", "gispin", "PARCEL_ID", "parid"),
    address: pick("siteadd", "situs", "address", "SITE_ADDRESS"),
    // LOCALITY is VA's (e.g. "Floyd County"); the prototype left the county blank for VA parcels.
    county: pick("county", "cntyname", "COUNTY_NAME", "LOCALITY"),
  };
}

/** The "Boundary source" line in the parcel facts table (proto L703). */
export function boundarySourceLabel(source: string, props: Record<string, unknown>): string {
  if (source === "drawn") return "drawn by hand";
  if (source === "square") return "square around a point (not a real boundary)";
  if (source === "saved") return "saved parcel";
  if (source === "split")
    return `split from ${String(props.split_from || "parent")} — verify against the recorded plat`;
  if (source === "combined") {
    const gap = typeof props.combined_gap_m === "number" ? props.combined_gap_m : 0;
    return (
      `combined from ${String(props.parno || "several parcels")}` +
      (gap > 0
        ? ` — bridged a ${Math.round(gap)} m gap (road right-of-way?); the acres leave the strip out`
        : "")
    );
  }
  return "county record";
}

/** A square of `acres` centred on a point, for places with no parcel service (proto L679–682). */
export function squareAround(ll: LatLon, acres: number): Feature<Polygon> {
  const a = Math.max(0.25, acres || 5),
    half = Math.sqrt(a * M2_PER_ACRE) / 2 / 1000;
  const c = [ll[1], ll[0]];
  const pts = [45, 135, 225, 315].map(
    (b) => destination(c, half * Math.SQRT2, b, { units: "kilometers" }).geometry.coordinates,
  );
  pts.push(pts[0]!);
  return polygon([pts]);
}
