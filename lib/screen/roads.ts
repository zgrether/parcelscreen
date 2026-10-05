/**
 * Census TIGERweb roads near the parcel, the nearest road to a point, and the straight-line driveway grade
 * to the best site. Ported verbatim (proto L841–854, L1130–1136), except that the three road layers are
 * requested in parallel (CLAUDE.md). Results keep the prototype's layer order (local, secondary, primary),
 * because nearestRoad keeps the first of equally close roads.
 */
import { lineString, nearestPointOnLine } from "@turf/turf";
import type { Feature, LineString, MultiLineString } from "geojson";
import { CancelledError, type HttpClient } from "../http";
import { SCREEN_CONSTANTS } from "./config";
import { at, llToRC } from "./dem";
import type { Dem, Endpoints, ScreenResult } from "./types";
import { M2FT, type LatLon } from "./util";

const K = SCREEN_CONSTANTS.roads;

export type RoadFeature = Feature<LineString | MultiLineString, { NAME?: string | null; MTFCC?: string }>;

export interface RoadDeps {
  http: HttpClient;
  endpoints: Endpoints;
  signal?: AbortSignal;
}

/** Road centrelines within `radiusM` of a point, from TIGER layers 8, 6 and 2. A failed layer adds nothing. */
export async function fetchRoads(
  ll: LatLon,
  deps: RoadDeps,
  radiusM: number = K.radiusM,
): Promise<RoadFeature[]> {
  const perLayer = await Promise.all(
    K.layers.map(async (lyr) => {
      const q = new URLSearchParams({
        geometry: `${ll[1]},${ll[0]}`,
        geometryType: "esriGeometryPoint",
        inSR: "4326",
        distance: String(radiusM),
        units: "esriSRUnit_Meter",
        spatialRel: "esriSpatialRelIntersects",
        outFields: "NAME,MTFCC",
        returnGeometry: "true",
        outSR: "4326",
        f: "geojson",
      });
      try {
        const r = await deps.http.fetch(`${deps.endpoints.tiger}/${lyr}/query`, {
          method: "POST",
          body: q,
          timeoutMs: K.timeoutMs,
          ...(deps.signal ? { signal: deps.signal } : {}),
        });
        if (!r.ok) return [];
        const j = (await r.json()) as { features?: RoadFeature[] };
        return (j.features || []).filter((f) => f.geometry);
      } catch (e) {
        if (e instanceof CancelledError) throw e;
        return [];
      }
    }),
  );
  return perLayer.flat();
}

export interface NearestRoad {
  name: string;
  distM: number;
  ll: LatLon;
}

/** The closest point on any road to `ll`, and that road's name. */
export function nearestRoad(roads: RoadFeature[], ll: LatLon): NearestRoad | null {
  const pt = [ll[1], ll[0]];
  let best: NearestRoad | null = null;
  for (const f of roads) {
    const lines: Feature<LineString>[] =
      f.geometry.type === "MultiLineString"
        ? f.geometry.coordinates.map((c) => lineString(c))
        : [f as Feature<LineString>];
    for (const ln of lines) {
      try {
        const np = nearestPointOnLine(ln, pt, { units: "meters" });
        if (!best || np.properties.dist! < best.distM)
          best = {
            name: f.properties.NAME || "unnamed road",
            distM: np.properties.dist!,
            ll: [np.geometry.coordinates[1]!, np.geometry.coordinates[0]!],
          };
      } catch {
        /* a degenerate line contributes nothing, as in the prototype */
      }
    }
  }
  return best;
}

/**
 * The straight-line driveway from the nearest road to the best site (proto L1132–1136): rise over run on
 * the wide DEM, and a warning when it's steeper than the grade limit.
 */
export function roadToSite(
  roads: RoadFeature[],
  siteLL: LatLon,
  dWide: Dem,
  roadMaxGradePct: number,
): Pick<ScreenResult, "road" | "roadNote"> & { flags: ScreenResult["flags"] } {
  const flags: ScreenResult["flags"] = [];
  const nr = nearestRoad(roads, siteLL);
  if (nr && nr.distM > K.minDistM) {
    const [rr, rc] = llToRC(dWide, nr.ll[0], nr.ll[1]);
    const zr = at(dWide, rr, rc);
    const [br, bc] = llToRC(dWide, siteLL[0], siteLL[1]);
    const zb = at(dWide, br, bc);
    if (!Number.isNaN(zr) && !Number.isNaN(zb)) {
      const road = {
        name: nr.name,
        riseFt: (zb - zr) * M2FT,
        runFt: nr.distM * M2FT,
        gradePct: (Math.abs(zb - zr) / nr.distM) * 100,
      };
      if (road.gradePct > roadMaxGradePct)
        flags.push({
          lvl: "warn",
          t: `Straight-line grade from ${road.name} to the bench is ${road.gradePct.toFixed(0)}% over ${Math.round(road.runFt)} ft. A ${roadMaxGradePct}% driveway needs roughly ${Math.round(Math.abs(road.riseFt) / (roadMaxGradePct / 100))} ft of road — switchbacks, culverts, and a bigger bill.`,
        });
      return { road, flags };
    }
    return { flags };
  }
  if (!roads.length)
    return { roadNote: "No Census road within 1,500 m of the parcel — driveway grade not computed.", flags };
  return { flags };
}
