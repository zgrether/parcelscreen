/**
 * Mapped streams (step 14, docs/plans/step-14-land-uses.md §2.5): the National Map's NHD flowlines within
 * streams.bufferFt of the parcel, and how much perennial and intermittent stream runs inside it. Not graded: the
 * Garden use reads it for water. NHD answers slowly, so the request starts with the run (index.ts).
 */
import {
  along,
  bbox,
  bboxPolygon,
  booleanPointInPolygon,
  buffer,
  length,
  lineString,
  pointToLineDistance,
} from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import type { HttpClient } from "../http";
import { arcQuery } from "./arcgis";
import { SCREEN_CONSTANTS } from "./config";
import { M2FT, type LatLon } from "./util";

const K = SCREEN_CONSTANTS.streams;

export interface Flowline {
  name: string | null;
  /** NHD's FCODE: 46006 perennial, 46003 intermittent, others (canals, ephemeral, artificial paths). */
  fcode: number | null;
  coords: [number, number][];
}

/** The flowlines near the parcel. */
export async function fetchFlowlines(
  url: string,
  parcel: Feature<Polygon | MultiPolygon>,
  deps: { http: HttpClient; signal?: AbortSignal },
): Promise<Flowline[]> {
  const box = bboxPolygon(bbox(buffer(parcel, K.bufferFt / M2FT, { units: "meters" })!));
  const features = await arcQuery(
    url,
    box,
    { outFields: "GNIS_NAME,FCODE", maxAllowableOffset: 0.00005, geometryPrecision: 5 },
    { ...deps, timeoutMs: K.timeoutMs },
  );
  return features.flatMap((f) => {
    const g = f.geometry;
    if (!g || (g.type !== "LineString" && g.type !== "MultiLineString")) return [];
    const p = (f.properties ?? {}) as Record<string, unknown>;
    // The National Map's hydro service answers with lower-case field names; the NHD's own spelling is upper case.
    const name = p.GNIS_NAME ?? p.gnis_name;
    const fcode = p.FCODE ?? p.fcode;
    const parts = g.type === "LineString" ? [g.coordinates] : g.coordinates;
    return parts
      .filter((c) => c.length >= 2)
      .map((c) => ({
        name: typeof name === "string" && name ? name : null,
        fcode: typeof fcode === "number" ? fcode : null,
        coords: c.map((q) => [q[0]!, q[1]!] as [number, number]),
      }));
  });
}

export interface Streams {
  /** Feet of perennial stream inside the parcel. */
  perennialFt: number;
  intermittentFt: number;
  /** The named streams inside or within streams.bufferFt. */
  names: string[];
  /** Feet from the best site to the nearest perennial or intermittent flowline found; null when none was. */
  nearestFt: number | null;
}

export function measureStreams(
  lines: readonly Flowline[],
  parcel: Feature<Polygon | MultiPolygon>,
  site: LatLon | null,
): Streams {
  let perennialM = 0,
    intermittentM = 0;
  let nearestM = Infinity;
  const names = new Set<string>();
  for (const f of lines) {
    const perennial = (K.perennial as readonly number[]).includes(f.fcode ?? -1);
    const intermittent = (K.intermittent as readonly number[]).includes(f.fcode ?? -1);
    if (!perennial && !intermittent) continue;
    const ln = lineString(f.coords);
    if (f.name) names.add(f.name);
    if (site) nearestM = Math.min(nearestM, pointToLineDistance([site[1], site[0]], ln, { units: "meters" }));
    const len = length(ln, { units: "meters" });
    let inside = 0;
    for (let s = K.stepM / 2; s < len; s += K.stepM)
      if (booleanPointInPolygon(along(ln, s, { units: "meters" }), parcel)) inside += K.stepM;
    if (perennial) perennialM += inside;
    else intermittentM += inside;
  }
  return {
    perennialFt: Math.round(perennialM * M2FT),
    intermittentFt: Math.round(intermittentM * M2FT),
    names: [...names].sort(),
    nearestFt: Number.isFinite(nearestM) ? Math.round(nearestM * M2FT) : null,
  };
}
