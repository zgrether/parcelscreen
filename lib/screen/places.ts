/**
 * Hospitals, groceries and trailheads near the parcel (proto L861–882, L1111–1128).
 *
 * Step 14d (docs/plans/step-14d-places.md §3): the groceries and OSM trailheads come from the baked places
 * (lib/screen/placeData.ts, `public/places/v1/osm/`), not from Photon with Overpass as its fallback: a grade asks no
 * volunteer service for places. The cells are OpenStreetMap's, baked monthly with the same tags the live queries used.
 *
 * Hospitals aren't OpenStreetMap's (the ER follow-up, owner 2026-10-23; phase-0.md §9.69): they're the emergency
 * departments of CMS's list with the hand-checked overrides (hospitals.ts), the list the area catalog times.
 *
 * The Overpass mirrors stay here for what isn't a place: VR3a's OSM roads and the OSM power lines (plan §12, Q1).
 */
import { distance } from "@turf/turf";
import { CancelledError, retryAfterHeaderMs, type HttpClient } from "../http";
import { SCREEN_CONSTANTS } from "./config";
import type { Endpoints, ScreenResult } from "./types";
import { hospitalCandidates, loadHospitals, type HospitalCandidate, type HospitalSource } from "./hospitals";
import { cellsWithin, placesFromHttp, type PlacesSource } from "./placeData";
import type { TrailheadPoint } from "./trailheads";
import type { LatLon } from "./util";

const K = SCREEN_CONSTANTS.near;

export interface PlacesDeps {
  http: HttpClient;
  endpoints: Endpoints;
  signal?: AbortSignal;
  /** The Overpass 429 wait; injectable so tests don't wait. */
  sleep?: (ms: number) => Promise<void>;
  /** The ERs; injectable so tests can make it fail. Defaults to the committed list with the overrides. */
  hospitals?: HospitalSource;
  /** The baked places (step 14d); defaults to reading `endpoints.places` through `http`. */
  places?: PlacesSource;
}

/** The baked places a run reads: the injected source, else the cells at `endpoints.places`. */
export const placesOf = (deps: Pick<PlacesDeps, "http" | "endpoints" | "places">): PlacesSource =>
  deps.places ?? placesFromHttp(deps.http, deps.endpoints.places);

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
    // A snapshot: queries run at once (step 14: the roads and the power lines), and one that answers reorders
    // this.order while another is still walking it.
    const order = [...this.order];
    for (let i = 0; i < order.length; i++) {
      const u = order[i]!,
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
        if (this.order[0] !== u) this.order = [u, ...this.order.filter((x) => x !== u)];
        return j.elements || [];
      } catch (e) {
        if (e instanceof CancelledError) throw e;
        errs.push(`${host}: ${(e as Error).message}`);
      }
    }
    throw new Error("Overpass unreachable (" + errs.join("; ") + ")");
  }
}

/**
 * The places couldn't be read (step 14d: the baked cells; before it, both Photon and Overpass failing). Its "test the
 * query" link went to Photon's hospital search; with hospitals from the snapshot that query no longer runs, and no
 * clean OSM map view of hospitals near a point exists, so the link is gone (owner's fallback, A2c).
 */
export class PlacesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlacesError";
  }
}

/** The places half of the 'near' step (proto L1112–1128), from the baked OSM cells (step 14d). */
export async function findPlaces(
  centre: LatLon,
  deps: PlacesDeps,
): Promise<{
  near: NonNullable<ScreenResult["near"]>;
  /** Every OSM trailhead within near.trailheadKm, before the cap: the near step merges them with the official ones. */
  osmTrailheads: TrailheadPoint[];
  /**
   * Session-only: every non-chain supermarket within near.groceryKm, nearest first, before the cap of maxGrocers. The
   * drive step looks for a closer one here (owner, #81), not only among the six listed.
   */
  otherGrocers: { name: string; ll: LatLon }[];
  /**
   * Session-only: every ER the drive step may route to, nearest first. near.hospitals is its first maxHospitals.
   */
  hospitalPool: HospitalCandidate[];
}> {
  const [lat, lon] = centre;
  // Loaded alongside the cells, so places and roads still start together (it never rejects).
  const loading = (deps.hospitals ?? loadHospitals)();
  let places;
  try {
    places = await placesOf(deps)(
      "osm",
      cellsWithin(centre, Math.max(K.groceryKm, K.trailheadKm)),
      deps.signal,
    );
  } catch (e) {
    if (e instanceof CancelledError) throw e;
    throw new PlacesError(`Places: ${(e as Error).message}`);
  }
  const km = (ll: LatLon) => distance([lon, lat], [ll[1], ll[0]], { units: "kilometers" });
  // No list, no hospital: OpenStreetMap's are never timed (§9.69).
  const ers = await loading;
  const hospitalPool: HospitalCandidate[] = ers ? hospitalCandidates(ers, centre) : [];
  const grocers = places
    .flatMap((p) => (p.kind === "grocer" ? [{ name: p.name, ll: p.ll, km: km(p.ll), big: p.big }] : []))
    .filter((g) => g.km <= K.groceryKm)
    .sort((a, b) => a.km - b.km);
  const osmTrailheads: TrailheadPoint[] = places.flatMap((p): TrailheadPoint[] =>
    p.kind === "trailhead" && km(p.ll) <= K.trailheadKm ? [{ name: p.name, ll: p.ll, source: "osm" }] : [],
  );
  const trailheads = trailheadsNear(osmTrailheads, centre);
  return {
    near: {
      hospitals: hospitalPool.slice(0, K.maxHospitals).map(({ name, ll, km }) => ({ name, ll, km })),
      grocers: grocers.slice(0, K.maxGrocers),
      ...trailheads,
    },
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
      source: p.source,
      ...(p.serves?.length ? { serves: p.serves } : {}),
      drive: null, // the drive step sets it for the nearest few (follow-up 54)
    }))
    .sort((a, b) => a.km - b.km);
  return { trailheads: all.slice(0, K.maxTrailheads), trailheadCount: all.length };
}
