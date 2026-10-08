/**
 * Trailheads from the Forest Service and the state parks, merged with OpenStreetMap's (follow-up 24, Batch A
 * A2b; docs/plans/batch-a.md §3, owner 2026-10-08).
 *
 * - USFS: its INFRA recreation sites of subtype TRAILHEAD (Elk Garden A.T., …).
 * - State parks: each state's park points (VA VGIN landmarks, NC DPR, TN TDEC), listed as the park.
 * - OSM: highway=trailhead or information=trailhead (lib/screen/places.ts).
 *
 * Two points are one trailhead only when they're within near.trailheadDedupeM AND their names match after
 * normalisation (case, punctuation, the words "trailhead", "TH" and "parking" stripped); otherwise both are kept.
 * Of a matched pair the official point is kept: USFS, then the state's, then OSM's.
 */
import { distance } from "@turf/turf";
import { CancelledError, type HttpClient } from "../http";
import { SCREEN_CONSTANTS } from "./config";
import type { Endpoints } from "./types";
import type { LatLon } from "./util";

const K = SCREEN_CONSTANTS.near;

export type TrailheadSource = "usfs" | "state" | "osm";

export interface TrailheadPoint {
  name: string;
  ll: LatLon;
  source: TrailheadSource;
}

/** Each state's park layer: its name field and, where the layer holds more than parks, the filter. */
const STATE_PARKS: Readonly<Record<string, { name: string; where?: string }>> = {
  "vginmaps.vdem.virginia.gov": { name: "LandmkName", where: "PlaceType='State Park Points'" },
  "services6.arcgis.com": { name: "FullName" }, // NC DPR
  "services5.arcgis.com": { name: "PARK_NAME" }, // TN TDEC
};

/** Name in title case when a source shouts it (USFS: "ELK GARDEN A.T."), else as given. */
export function readableName(s: string): string {
  const t = s.trim();
  if (t !== t.toUpperCase() || !/[A-Z]{3}/.test(t)) return t;
  return t.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

/** The dedupe form of a name: lower case, punctuation out, "trailhead"/"th"/"parking" dropped. */
export function normalizeTrailheadName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter((w) => w && w !== "trailhead" && w !== "th" && w !== "parking")
    .join(" ");
}

const RANK: Record<TrailheadSource, number> = { usfs: 0, state: 1, osm: 2 };

/** Merges the sources: official points first; a point is dropped only if a kept one is near AND same-named. */
export function mergeTrailheads(points: readonly TrailheadPoint[]): TrailheadPoint[] {
  const kept: TrailheadPoint[] = [];
  for (const p of [...points].sort((a, b) => RANK[a.source] - RANK[b.source])) {
    const n = normalizeTrailheadName(p.name);
    const dup = kept.some(
      (k) =>
        normalizeTrailheadName(k.name) === n &&
        distance([k.ll[1], k.ll[0]], [p.ll[1], p.ll[0]], { units: "meters" }) <= K.trailheadDedupeM,
    );
    if (!dup) kept.push(p);
  }
  return kept;
}

interface ArcPoint {
  attributes: Record<string, unknown>;
  geometry?: { x: number; y: number };
}

/** Points of one ArcGIS layer within `km` of the centre. */
async function pointsNear(
  url: string,
  centre: LatLon,
  km: number,
  fields: { name: string; where?: string },
  deps: { http: HttpClient; signal?: AbortSignal },
): Promise<{ name: string; ll: LatLon }[]> {
  const q = new URLSearchParams({
    geometry: `${centre[1]},${centre[0]}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    distance: String(km * 1000),
    units: "esriSRUnit_Meter",
    where: fields.where ?? "1=1",
    outFields: fields.name,
    returnGeometry: "true",
    outSR: "4326",
    f: "json",
  });
  const r = await deps.http.fetch(`${url}/query`, {
    method: "POST",
    body: q,
    timeoutMs: K.officialTimeoutMs,
    ...(deps.signal ? { signal: deps.signal } : {}),
  });
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
  const j = (await r.json()) as { features?: ArcPoint[]; error?: { message?: string } };
  if (j.error) throw new Error(`${new URL(url).host}: ${j.error.message ?? "error"}`);
  return (j.features ?? [])
    .filter((f) => f.geometry && typeof f.attributes[fields.name] === "string")
    .map((f) => ({
      name: readableName(String(f.attributes[fields.name])),
      ll: [f.geometry!.y, f.geometry!.x] as LatLon,
    }));
}

/**
 * The official trailheads within near.trailheadKm: USFS's and the state parks'. A source that fails is left
 * out (OpenStreetMap still answers, and the count says what was found); a cancel still cancels.
 */
export async function officialTrailheads(
  centre: LatLon,
  deps: { http: HttpClient; endpoints: Endpoints; signal?: AbortSignal },
): Promise<TrailheadPoint[]> {
  const asked: Promise<TrailheadPoint[]>[] = [
    pointsNear(
      deps.endpoints.usfsRecSites,
      centre,
      K.trailheadKm,
      { name: "site_name", where: "site_subtype='TRAILHEAD'" },
      deps,
    ).then((ps) => ps.map((p) => ({ ...p, source: "usfs" as const }))),
    ...deps.endpoints.stateParks.flatMap((url) => {
      const fields = STATE_PARKS[new URL(url).host];
      return fields
        ? [
            pointsNear(url, centre, K.trailheadKm, fields, deps).then((ps) =>
              ps.map((p) => ({ ...p, source: "state" as const })),
            ),
          ]
        : [];
    }),
  ];
  const settled = await Promise.allSettled(asked);
  const cancelled = settled.find((s) => s.status === "rejected" && s.reason instanceof CancelledError);
  if (cancelled) throw (cancelled as PromiseRejectedResult).reason;
  return settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
}
