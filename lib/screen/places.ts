/**
 * Hospitals, groceries and trailheads near the parcel, from OpenStreetMap via Photon (komoot), with the
 * Overpass mirrors as a fallback. Ported verbatim (proto L861–882, L1111–1128).
 *
 * Batch A A2c (owner, 2026-10-09): hospitals come from the committed OSM snapshot (hospitals.ts), with their
 * emergency tag; Photon (by tag, amenity and healthcare) and Overpass supply them only if it can't be loaded.
 *
 * Deviation (step 13 CORS check): no Overpass mirror answers a browser any more (overpass-api.de sends 406
 * to browser User-Agents, openstreetmap.fr 403 "white-listed usages only", the other two time out), so in
 * the browser the fallback goes through /api/places/overpass, which runs `overpassPlaces` server-side with
 * an identifying User-Agent. In Node the mirrors are called directly, as before.
 */
import { distance } from "@turf/turf";
import { CancelledError, retryAfterHeaderMs, type HttpClient } from "../http";
import { SCREEN_CONSTANTS } from "./config";
import type { Endpoints, ScreenResult } from "./types";
import {
  hospitalCandidates,
  loadHospitalSnapshot,
  type HospitalCandidate,
  type HospitalSource,
} from "./hospitals";
import type { TrailheadPoint } from "./trailheads";
import type { LatLon } from "./util";

const K = SCREEN_CONSTANTS.near;

/** Runs the three Overpass queries for a centre some other way (the browser: through the server route). */
export type OverpassFallback = (centre: LatLon, signal?: AbortSignal) => Promise<OsmElement[]>;

export interface PlacesDeps {
  http: HttpClient;
  endpoints: Endpoints;
  signal?: AbortSignal;
  /** The Overpass 429 wait; injectable so tests don't wait. */
  sleep?: (ms: number) => Promise<void>;
  /** When set, replaces calling the Overpass mirrors directly. */
  overpass?: OverpassFallback;
  /** The hospital snapshot; injectable so tests can make it fail. Defaults to the committed one. */
  hospitals?: HospitalSource;
}

/** An OSM element as Overpass returns it; Photon results are reshaped into the same form. */
export interface OsmElement {
  type: string;
  /** Overpass's element id; with `type`, the OSM identity. */
  id?: number;
  /** Photon's OSM identity ("way/123"); its elements are reshaped as nodes, so `type` can't say. */
  osm?: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string | undefined>;
}

const opLL = (e: OsmElement): LatLon =>
  e.type === "node" ? [e.lat!, e.lon!] : [e.center!.lat, e.center!.lon];

/**
 * OSM places by tag around a point, nearest first, through Photon's reverse geocoder (Batch A, A2b). The forward
 * search (`photon`, removed in A2c with its last use, hospitals) matched its query text against names: `q=supermarket` found "Slaughters' Supermarket" but
 * never a Food Lion, which left Grayson Mud Creek with no grocer although Lansing and West Jefferson have them
 * (follow-up 25), and `q=trailhead` missed trailheads not named so (follow-up 24). Reverse, filtered by the tag
 * within `radiusKm`, returns every match.
 */
export async function photonNear(
  tag: string,
  lat: number,
  lon: number,
  radiusKm: number,
  deps: PlacesDeps,
  limit: number = K.photonLimit,
): Promise<OsmElement[]> {
  const base = new URL("../reverse", deps.endpoints.photon).toString();
  const u = `${base}?lat=${lat}&lon=${lon}&osm_tag=${encodeURIComponent(tag)}&radius=${radiusKm}&limit=${limit}`;
  const r = await deps.http.fetch(u, {
    timeoutMs: K.photonTimeoutMs,
    ...(deps.signal ? { signal: deps.signal } : {}),
  });
  if (!r.ok) throw new Error("Photon " + r.status);
  const j = (await r.json()) as {
    features?: {
      geometry: { coordinates: [number, number] };
      properties: { name?: string; osm_type?: string; osm_id?: number };
    }[];
  };
  const [k, v] = tag.split(":") as [string, string];
  const TYPE: Record<string, string> = { N: "node", W: "way", R: "relation" };
  return (j.features || []).map((f) => ({
    type: "node",
    ...(f.properties.osm_type && f.properties.osm_id !== undefined
      ? { osm: `${TYPE[f.properties.osm_type] ?? f.properties.osm_type}/${f.properties.osm_id}` }
      : {}),
    lat: f.geometry.coordinates[1],
    lon: f.geometry.coordinates[0],
    tags: { name: f.properties.name, [k]: v },
  }));
}

/**
 * Overpass mirrors, tried in order; whichever answers moves to the front for the rest of the run
 * (proto L861–874). One instance per screen run.
 *
 * Deviation (owner's rule, step 13c): only the main mirror (the first configured) is waited on. A 429/503
 * from it waits its Retry-After (5 s without one, as the prototype waited) and is retried once; a Retry-After
 * over the cap moves on at once. Any other mirror's failure moves straight on. The prototype waited 5 s on
 * a 429 from any mirror. The HTTP client's own 429/503 retries are off for these requests, so nothing stacks.
 */
export class OverpassMirrors {
  private order: string[] | null = null;

  async query(ql: string, deps: PlacesDeps): Promise<OsmElement[]> {
    if (!this.order) this.order = [...deps.endpoints.overpass];
    const main = deps.endpoints.overpass[0];
    const errs: string[] = [];
    for (let i = 0; i < this.order.length; i++) {
      const u = this.order[i]!,
        host = u.split("/")[2];
      try {
        const opts = {
          timeoutMs: K.overpassTimeoutMs,
          retries: 0,
          ...(deps.signal ? { signal: deps.signal } : {}),
        };
        let r = await deps.http.fetch(`${u}?data=${encodeURIComponent(ql)}`, opts);
        if (u === main && (r.status === 429 || r.status === 503)) {
          const wait = retryAfterHeaderMs(r, Date.now()) ?? K.overpass429WaitMs;
          if (wait <= K.overpassRetryAfterCapMs) {
            await r.body?.cancel();
            await (deps.sleep ?? ((ms: number) => new Promise<void>((s) => setTimeout(s, ms))))(wait);
            r = await deps.http.fetch(`${u}?data=${encodeURIComponent(ql)}`, opts);
          }
        }
        if (!r.ok) {
          errs.push(`${host} ${r.status}`);
          continue;
        }
        const j = (await r.json()) as { elements?: OsmElement[] };
        if (i > 0) this.order.unshift(...this.order.splice(i, 1));
        return j.elements || [];
      } catch (e) {
        if (e instanceof CancelledError) throw e;
        errs.push(`${host}: ${(e as Error).message}`);
      }
    }
    throw new Error("Overpass unreachable (" + errs.join("; ") + ")");
  }
}

/** The Overpass fallback: hospitals, supermarkets and trailheads around a centre (proto L1117–1124). */
export async function overpassPlaces(
  centre: LatLon,
  deps: PlacesDeps,
  mirrors: OverpassMirrors,
): Promise<OsmElement[]> {
  const [lat, lon] = centre;
  const box = (km: number) => {
    const d = km / 111,
      dx = d / Math.cos((lat * Math.PI) / 180);
    return `${(lat - d).toFixed(4)},${(lon - dx).toFixed(4)},${(lat + d).toFixed(4)},${(lon + dx).toFixed(4)}`;
  };
  const e1s = await mirrors.query(
    `[out:json][timeout:30][bbox:${box(K.hospitalKm)}];(node["amenity"="hospital"];way["amenity"="hospital"];);out center;`,
    deps,
  );
  const e2s = await mirrors.query(
    `[out:json][timeout:30][bbox:${box(K.groceryKm)}];(node["shop"="supermarket"];way["shop"="supermarket"];);out center;`,
    deps,
  );
  const e3s = await mirrors.query(
    `[out:json][timeout:30][bbox:${box(K.trailheadKm)}];(node["highway"="trailhead"];node["information"="trailhead"];);out;`,
    deps,
  );
  return [...e1s, ...e2s, ...e3s];
}

/**
 * The browser's Overpass fallback: GET `routeUrl?lat=…&lon=…`, which answers `{ elements }` or, when every
 * mirror failed, a 502 with `{ error: "Overpass unreachable (…)" }`, the same message as calling them directly.
 */
export function overpassViaRoute(routeUrl: string, http: HttpClient): OverpassFallback {
  return async (centre, signal) => {
    const r = await http.fetch(`${routeUrl}?lat=${centre[0]}&lon=${centre[1]}`, {
      timeoutMs: K.overpassRouteTimeoutMs,
      ...(signal ? { signal } : {}),
    });
    const j = (await r.json().catch(() => ({}))) as { elements?: OsmElement[]; error?: string };
    if (!r.ok) throw new Error(j.error || `Overpass route ${r.status}`);
    return j.elements || [];
  };
}

/**
 * Both place sources failed. Its "test the query" link went to Photon's hospital search; with hospitals from
 * the snapshot that query no longer runs, and no clean OSM map view of hospitals near a point exists, so the
 * link is gone (owner's fallback, A2c).
 */
export class PlacesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlacesError";
  }
}

/** An element's OSM identity, when its source gave one. */
const osmIdOf = (e: OsmElement): string | undefined =>
  e.osm ?? (e.id !== undefined ? `${e.type}/${e.id}` : undefined);

/** The places half of the 'near' step (proto L1112–1128). */
export async function findPlaces(
  centre: LatLon,
  deps: PlacesDeps,
  mirrors: OverpassMirrors,
): Promise<{
  near: NonNullable<ScreenResult["near"]>;
  nearNote?: string;
  /** Every OSM trailhead found, before the cap: the near step merges them with the official ones (follow-up 24). */
  osmTrailheads: TrailheadPoint[];
  /**
   * Session-only: every non-chain supermarket found within near.groceryKm, nearest first, before the cap of
   * maxGrocers. The drive step looks for a closer one here (owner, #81), not only among the six listed.
   */
  otherGrocers: { name: string; ll: LatLon }[];
  /**
   * Session-only: every hospital the drive step may route to, nearest first, with its emergency status when
   * the snapshot gave it (A2c). near.hospitals is its first maxHospitals.
   */
  hospitalPool: HospitalCandidate[];
}> {
  const [lat, lon] = centre;
  // Loaded alongside Photon, not before it, so places and roads still start together (it never rejects).
  const loading = (deps.hospitals ?? loadHospitalSnapshot)();
  let els: OsmElement[] = [];
  let nearNote: string | undefined;
  try {
    // By tag, not by name (photonNear): groceries and trailheads (follow-ups 25 and 24), and hospitals only
    // when the snapshot couldn't be loaded, both tags (A2c).
    const ps = await Promise.all([
      photonNear("shop:supermarket", lat, lon, K.groceryKm, deps),
      photonNear("highway:trailhead", lat, lon, K.trailheadKm, deps),
      loading.then((snap) =>
        snap
          ? []
          : Promise.all([
              photonNear("amenity:hospital", lat, lon, K.hospitalKm, deps),
              photonNear("healthcare:hospital", lat, lon, K.hospitalKm, deps),
            ]).then((h) => h.flat()),
      ),
    ]);
    els = ps.flat();
    if (!els.length) throw new Error("returned nothing");
  } catch (e1) {
    if (e1 instanceof CancelledError) throw e1;
    try {
      els = deps.overpass
        ? await deps.overpass(centre, deps.signal)
        : await overpassPlaces(centre, deps, mirrors);
      nearNote = "Places came from Overpass (Photon was unavailable).";
    } catch (e2) {
      if (e2 instanceof CancelledError) throw e2;
      throw new PlacesError(`Photon: ${(e1 as Error).message}; Overpass: ${(e2 as Error).message}`);
    }
  }
  const withPos = els.filter((e) => e.lat || e.center);
  const km = (e: OsmElement) => distance([lon, lat], [opLL(e)[1], opLL(e)[0]], { units: "kilometers" });
  const snapshot = await loading;
  const seen = new Set<string>();
  const hospitalPool: HospitalCandidate[] = snapshot
    ? hospitalCandidates(snapshot, centre)
    : withPos
        .filter((e) => e.tags?.amenity === "hospital" || e.tags?.healthcare === "hospital")
        .filter((e) => !K.excludeHospital.test(e.tags!.name || ""))
        .filter((e) => {
          // One element found by both tags, once.
          const id = osmIdOf(e);
          if (id === undefined) return true;
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        })
        .map((e) => ({ name: e.tags!.name || "Hospital", ll: opLL(e), km: km(e) }))
        .sort((a, b) => a.km - b.km);
  const grocers = withPos
    .filter((e) => e.tags?.shop === "supermarket")
    .map((e) => ({
      name: e.tags!.name || "Supermarket",
      ll: opLL(e),
      km: km(e),
      big: K.bigGrocer.test(e.tags!.name || ""),
    }))
    .sort((a, b) => a.km - b.km);
  const osmTrailheads: TrailheadPoint[] = withPos
    .filter((e) => e.tags?.highway === "trailhead" || e.tags?.information === "trailhead")
    .map((e) => ({ name: e.tags!.name || "Trailhead", ll: opLL(e), source: "osm" as const }));
  const trailheads = trailheadsNear(osmTrailheads, centre);
  return {
    near: {
      hospitals: hospitalPool.slice(0, K.maxHospitals).map(({ name, ll, km }) => ({ name, ll, km })),
      grocers: grocers.slice(0, K.maxGrocers),
      ...trailheads,
    },
    ...(nearNote ? { nearNote } : {}),
    osmTrailheads,
    otherGrocers: grocers.filter((g) => !g.big).map(({ name, ll }) => ({ name, ll })),
    hospitalPool,
  };
}

/** Trailheads as the result keeps them: nearest first, the first near.maxTrailheads, and the count of all. */
export function trailheadsNear(
  points: readonly TrailheadPoint[],
  centre: LatLon,
): Pick<NonNullable<ScreenResult["near"]>, "trailheads" | "trailheadCount"> {
  const [lat, lon] = centre;
  const all = points
    .map((p) => ({
      name: p.name,
      ll: p.ll,
      km: distance([lon, lat], [p.ll[1], p.ll[0]], { units: "kilometers" }),
    }))
    .sort((a, b) => a.km - b.km);
  return { trailheads: all.slice(0, K.maxTrailheads), trailheadCount: all.length };
}
