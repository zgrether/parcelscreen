/**
 * Power lines near the parcel (step 14, docs/plans/step-14-land-uses.md §2.1): HIFLD Open's electric power
 * transmission lines within power.searchKm, or OpenStreetMap's power=line ways when HIFLD has none or doesn't answer.
 * Facts only: where the lines are, their voltage when known, whether one crosses the parcel. "What limits you" says
 * how far the house site is from the nearest (lib/uses), from the lines kept here.
 */
import {
  bbox,
  bboxPolygon,
  booleanIntersects,
  booleanPointInPolygon,
  buffer,
  length,
  along,
  lineString,
  pointToLineDistance,
  polygonToLine,
} from "@turf/turf";
import type { Feature, LineString, MultiLineString, MultiPolygon, Polygon } from "geojson";
import { z } from "zod";
import { CancelledError, type HttpClient } from "../http";
import { arcQuery } from "./arcgis";
import { SCREEN_CONSTANTS } from "./config";
import { OverpassMirrors, type PlacesDeps } from "./places";
import { M2FT, type LatLon } from "./util";

const K = SCREEN_CONSTANTS.power;

/** A power line as the screen keeps it: [lon, lat] vertices, rounded to 5 decimals. */
export interface PowerLine {
  /** Kilovolts when the source says (HIFLD's VOLTAGE; OSM's voltage tag, the highest of several). */
  kV: number | null;
  /** OSM's operator tag; null for HIFLD's lines (OWNER isn't asked for). */
  owner: string | null;
  coords: [number, number][];
}

export interface PowerFound {
  source: "hifld" | "osm";
  /** HIFLD's SOURCEDATE (the newest among the lines), or null; OSM has no date. */
  date: string | null;
  lines: PowerLine[];
}

const round5 = (v: number) => Math.round(v * 1e5) / 1e5;
const linesOf = (g: LineString | MultiLineString): [number, number][][] =>
  (g.type === "LineString" ? [g.coordinates] : g.coordinates).map((c) =>
    c.map((p) => [round5(p[0]!), round5(p[1]!)] as [number, number]),
  );

/** HIFLD's VOLTAGE is kV; -999999 and 0 mean unknown. */
const kvOf = (v: unknown): number | null => (typeof v === "number" && v > 0 ? v : null);

/** HIFLD's transmission lines within power.searchKm of the parcel. */
export async function hifldLines(
  url: string,
  parcel: Feature<Polygon | MultiPolygon>,
  deps: { http: HttpClient; signal?: AbortSignal },
): Promise<PowerFound> {
  const box = bboxPolygon(bbox(buffer(parcel, K.searchKm, { units: "kilometers" })!));
  const features = await arcQuery(
    url,
    box,
    {
      // Not OWNER: a utility's name isn't needed, and the recordings scrub owner fields on this host (scrubHar.ts).
      outFields: "VOLTAGE,STATUS,SOURCEDATE",
      maxAllowableOffset: K.simplifyDeg,
      geometryPrecision: 5,
    },
    { ...deps, timeoutMs: K.timeoutMs },
  );
  const lines: PowerLine[] = [];
  let date: string | null = null;
  for (const f of features) {
    const g = f.geometry;
    if (!g || (g.type !== "LineString" && g.type !== "MultiLineString")) continue;
    const p = (f.properties ?? {}) as Record<string, unknown>;
    if (typeof p.STATUS === "string" && /not in service|proposed/i.test(p.STATUS)) continue;
    const d = typeof p.SOURCEDATE === "number" ? new Date(p.SOURCEDATE).toISOString().slice(0, 10) : null;
    if (d && (!date || d > date)) date = d;
    for (const coords of linesOf(g))
      if (coords.length >= 2) lines.push({ kV: kvOf(p.VOLTAGE), owner: null, coords });
  }
  return { source: "hifld", date, lines };
}

/** OSM's power lines around a point, within power.searchKm. */
export function osmPowerQuery(centre: LatLon): string {
  const [lat, lon] = centre.map((v) => v.toFixed(6));
  return `[out:json][timeout:25];way["power"="line"](around:${K.searchKm * 1000},${lat},${lon});out tags geom;`;
}

const WaySchema = z.looseObject({
  type: z.literal("way"),
  tags: z.looseObject({ voltage: z.string().optional(), operator: z.string().optional() }),
  geometry: z.array(z.strictObject({ lat: z.number(), lon: z.number() })),
});

/** OSM's answer as power lines; a voltage tag is volts, maybe several ("138000;69000"): the highest, in kV. */
export function parseOsmPower(elements: readonly unknown[]): PowerFound {
  const lines = elements.flatMap((e) => {
    const w = WaySchema.safeParse(e);
    if (!w.success || w.data.geometry.length < 2) return [];
    const volts = (w.data.tags.voltage ?? "")
      .split(";")
      .map(Number)
      .filter((v) => v > 0);
    return [
      {
        kV: volts.length ? Math.max(...volts) / 1000 : null,
        owner: w.data.tags.operator ?? null,
        coords: w.data.geometry.map((g) => [round5(g.lon), round5(g.lat)] as [number, number]),
      },
    ];
  });
  return { source: "osm", date: null, lines };
}

export type OsmPowerSource = (centre: LatLon, signal?: AbortSignal) => Promise<PowerFound>;

/** Node and the tests: straight to the mirrors. The worker passes its own (the app's route, kind=power). */
export const osmPowerFromMirrors =
  (deps: PlacesDeps, mirrors: OverpassMirrors = new OverpassMirrors()): OsmPowerSource =>
  async (centre) =>
    parseOsmPower(await mirrors.query(osmPowerQuery(centre), deps));

/** The browser's query, through the app's route (no Overpass mirror answers a browser; see places.ts). */
export function osmPowerViaRoute(routeUrl: string, http: HttpClient): OsmPowerSource {
  return async (centre, signal) => {
    const r = await http.fetch(`${routeUrl}?kind=power&lat=${centre[0]}&lon=${centre[1]}`, {
      timeoutMs: SCREEN_CONSTANTS.near.overpassRouteTimeoutMs,
      ...(signal ? { signal } : {}),
    });
    const j = (await r.json().catch(() => ({}))) as { elements?: unknown[]; error?: string };
    if (!r.ok) throw new Error(j.error || `Overpass route ${r.status}`);
    return parseOsmPower(j.elements ?? []);
  };
}

/** HIFLD first; OSM when HIFLD fails or has no line within power.searchKm. Throws only when both fail. */
export async function findPower(
  parcel: Feature<Polygon | MultiPolygon>,
  centre: LatLon,
  hifld: () => Promise<PowerFound>,
  osm: OsmPowerSource,
  signal?: AbortSignal,
): Promise<PowerFound> {
  let first: unknown = null;
  try {
    const h = await hifld();
    if (h.lines.length) return h;
  } catch (e) {
    if (e instanceof CancelledError) throw e;
    first = e;
  }
  try {
    return await osm(centre, signal);
  } catch (e) {
    if (e instanceof CancelledError) throw e;
    throw first ?? e;
  }
}

export interface PowerMeasure {
  source: "hifld" | "osm";
  date: string | null;
  /** The lines within power.keepKm of the parcel, for the map and the house-site distance. */
  lines: PowerLine[];
  /** Feet from the parcel's boundary to the nearest line within power.searchKm; 0 when one crosses; null when none. */
  nearestFt: number | null;
  /** The nearest line's voltage, when known. */
  nearestKV: number | null;
  crosses: boolean;
  /** Feet of line inside the parcel. */
  insideFt: number;
}

/** What the lines mean for this parcel (pure). */
export function measurePower(found: PowerFound, parcel: Feature<Polygon | MultiPolygon>): PowerMeasure {
  const edges = polygonToLine(parcel);
  const edgeLines: Feature<LineString>[] = (
    edges.type === "FeatureCollection" ? edges.features : [edges]
  ).flatMap((f) =>
    f.geometry.type === "LineString"
      ? [f as Feature<LineString>]
      : f.geometry.coordinates.map((c) => lineString(c)),
  );
  let nearestM = Infinity;
  let nearestKV: number | null = null;
  let crosses = false;
  let insideM = 0;
  const kept: PowerLine[] = [];
  for (const l of found.lines) {
    const ln = lineString(l.coords);
    const hits = booleanIntersects(ln, parcel);
    // Distance to the boundary: the least over the line's vertices and the boundary's (both are simplified).
    let d = hits ? 0 : Infinity;
    if (!hits)
      for (const e of edgeLines) {
        for (const c of e.geometry.coordinates)
          d = Math.min(d, pointToLineDistance(c, ln, { units: "meters" }));
        for (const c of l.coords) d = Math.min(d, pointToLineDistance(c, e, { units: "meters" }));
      }
    if (d < nearestM || (d === nearestM && (l.kV ?? 0) > (nearestKV ?? 0))) {
      nearestM = d;
      nearestKV = l.kV;
    }
    if (hits) {
      crosses = true;
      const len = length(ln, { units: "meters" });
      for (let s = K.insideStepM / 2; s < len; s += K.insideStepM)
        if (booleanPointInPolygon(along(ln, s, { units: "meters" }), parcel)) insideM += K.insideStepM;
    }
    if (d <= K.keepKm * 1000) kept.push(l);
  }
  return {
    source: found.source,
    date: found.date,
    lines: kept,
    nearestFt: Number.isFinite(nearestM) ? Math.round(nearestM * M2FT) : null,
    nearestKV: Number.isFinite(nearestM) ? nearestKV : null,
    crosses,
    insideFt: Math.round(insideM * M2FT),
  };
}

/** Feet from a point to the nearest kept line, or null when none is kept (lib/uses: the house site's distance). */
export function feetToNearestLine(
  ll: LatLon,
  lines: readonly PowerLine[],
): { ft: number; kV: number | null } | null {
  let best: { ft: number; kV: number | null } | null = null;
  for (const l of lines) {
    const ft = pointToLineDistance([ll[1], ll[0]], lineString(l.coords), { units: "meters" }) * M2FT;
    if (!best || ft < best.ft) best = { ft: Math.round(ft), kV: l.kV };
  }
  return best;
}
