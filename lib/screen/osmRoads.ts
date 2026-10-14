/**
 * OpenStreetMap's tracks, service roads and unclassified ways near the parcel (VR3a; owner, #110 follow-up): the
 * roads Census TIGER leaves out. When TIGER shows no frontage, one of these along the boundary is "possible frontage
 * on an unmapped track", which the deed or plat has to confirm. Through Overpass, the mirrors the places step uses
 * (in the browser, the app's /api/places/overpass route).
 */
import { lineString, nearestPointOnLine, pointToLineDistance, distance } from "@turf/turf";
import { z } from "zod";
import type { HttpClient } from "../http";
import { SCREEN_CONSTANTS } from "./config";
import { OverpassMirrors, type PlacesDeps } from "./places";
import type { RoadFeature } from "./roads";
import { M2FT, type LatLon } from "./util";

const K = SCREEN_CONSTANTS.osmRoads;

export interface OsmWay {
  id: number;
  highway: string;
  name: string | null;
  /** Follow-up 55: what the road in is (a track's grade, private access, a driveway). */
  tracktype: string | null;
  access: string | null;
  service: string | null;
  /** [lon, lat] */
  coords: [number, number][];
}

const WaySchema = z.looseObject({
  type: z.literal("way"),
  id: z.number(),
  tags: z.looseObject({
    highway: z.string(),
    name: z.string().optional(),
    tracktype: z.string().optional(),
    access: z.string().optional(),
    service: z.string().optional(),
  }),
  geometry: z.array(z.strictObject({ lat: z.number(), lon: z.number() })),
});
const AnswerSchema = z.looseObject({ elements: z.array(z.unknown()) });

/** The query: the ways within the roads step's radius of the parcel's centre, with their geometry. */
export function osmRoadsQuery(centre: LatLon, radiusM: number = SCREEN_CONSTANTS.roads.radiusM): string {
  const [lat, lon] = centre.map((v) => v.toFixed(6));
  return `[out:json][timeout:25];way["highway"~"^(${K.highways.join("|")})$"](around:${radiusM},${lat},${lon});out tags geom;`;
}

/** Overpass's answer as ways; anything else in it is ignored. */
export function parseOsmWays(json: unknown): OsmWay[] {
  const els = AnswerSchema.parse(json).elements;
  return els.flatMap((e) => {
    const w = WaySchema.safeParse(e);
    if (!w.success || w.data.geometry.length < 2) return [];
    return [
      {
        id: w.data.id,
        highway: w.data.tags.highway,
        name: w.data.tags.name ?? null,
        tracktype: w.data.tags.tracktype ?? null,
        access: w.data.tags.access ?? null,
        service: w.data.tags.service ?? null,
        coords: w.data.geometry.map((g) => [g.lon, g.lat] as [number, number]),
      },
    ];
  });
}

/** Node and the tests: straight to the mirrors. The worker passes its own (the app's route). */
export async function fetchOsmRoads(
  centre: LatLon,
  deps: PlacesDeps,
  mirrors: OverpassMirrors = new OverpassMirrors(),
): Promise<OsmWay[]> {
  return parseOsmWays({ elements: await mirrors.query(osmRoadsQuery(centre), deps) });
}

/** The browser's query, through the app's route (no Overpass mirror answers a browser; see places.ts). */
export function osmRoadsViaRoute(
  routeUrl: string,
  http: HttpClient,
): (centre: LatLon, signal?: AbortSignal) => Promise<OsmWay[]> {
  return async (centre, signal) => {
    const r = await http.fetch(`${routeUrl}?kind=roads&lat=${centre[0]}&lon=${centre[1]}`, {
      timeoutMs: SCREEN_CONSTANTS.near.overpassRouteTimeoutMs,
      ...(signal ? { signal } : {}),
    });
    const j = (await r.json().catch(() => ({}))) as { elements?: unknown[]; error?: string };
    if (!r.ok) throw new Error(j.error || `Overpass route ${r.status}`);
    return parseOsmWays({ elements: j.elements ?? [] });
  };
}

/** The ways as road lines for the frontage search, named as the report shows them ("unmapped track"). */
export const osmRoadFeatures = (ways: readonly OsmWay[]): RoadFeature[] =>
  ways.map((w) => ({
    ...lineString(w.coords),
    properties: { NAME: w.name ?? `unmapped ${w.highway}` },
  }));

/**
 * From a point on an OSM way, the shortest way along the OSM network to a TIGER road (a vertex within
 * `osmRoads.joinM` of one): the road's name and the distance, or null when none is within `osmRoads.maxWalkM`.
 */
export function reachesTiger(
  ways: readonly OsmWay[],
  start: { wayIndex: number; ll: LatLon },
  tiger: readonly RoadFeature[],
): { road: string; ft: number } | null {
  // The network: vertices by position, edges along each way.
  const key = (c: [number, number]) => `${c[0].toFixed(7)},${c[1].toFixed(7)}`;
  const at = new Map<string, number>();
  const pos: [number, number][] = [];
  const edges: [number, number][][] = [];
  const vertex = (c: [number, number]) => {
    let i = at.get(key(c));
    if (i === undefined) {
      i = pos.length;
      at.set(key(c), i);
      pos.push(c);
      edges.push([]);
    }
    return i;
  };
  const wayVertices = ways.map((w) => w.coords.map(vertex));
  ways.forEach((w, k) => {
    const v = wayVertices[k]!;
    for (let j = 1; j < v.length; j++) {
      const m = distance(w.coords[j - 1]!, w.coords[j]!, { units: "meters" });
      edges[v[j - 1]!]!.push([v[j]!, m]);
      edges[v[j]!]!.push([v[j - 1]!, m]);
    }
  });
  // Which vertices touch a TIGER road, and which road.
  const roadAt = (i: number): string | null => {
    for (const r of tiger) {
      const lines = r.geometry.type === "LineString" ? [r.geometry.coordinates] : r.geometry.coordinates;
      for (const l of lines)
        if (l.length > 1 && pointToLineDistance(pos[i]!, lineString(l), { units: "meters" }) <= K.joinM)
          return r.properties.NAME || "road";
    }
    return null;
  };
  // Start: the entrance's place along its way, then every vertex of that way at its distance along.
  const way = ways[start.wayIndex]!;
  const here = nearestPointOnLine(lineString(way.coords), [start.ll[1], start.ll[0]], { units: "meters" });
  const along = here.properties.location ?? 0;
  const dist = new Array<number>(pos.length).fill(Infinity);
  let walked = 0;
  wayVertices[start.wayIndex]!.forEach((v, j) => {
    if (j) walked += distance(way.coords[j - 1]!, way.coords[j]!, { units: "meters" });
    dist[v] = Math.min(dist[v]!, Math.abs(walked - along));
  });
  // Dijkstra, small graphs: the nearest unsettled vertex by a scan.
  const done = new Uint8Array(pos.length);
  for (;;) {
    let u = -1;
    for (let i = 0; i < pos.length; i++) if (!done[i] && (u < 0 || dist[i]! < dist[u]!)) u = i;
    if (u < 0 || dist[u]! > K.maxWalkM) return null;
    done[u] = 1;
    const road = roadAt(u);
    if (road) return { road, ft: dist[u]! * M2FT };
    for (const [v, m] of edges[u]!) if (dist[u]! + m < dist[v]!) dist[v] = dist[u]! + m;
  }
}
