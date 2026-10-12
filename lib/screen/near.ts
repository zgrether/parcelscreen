/**
 * The 'near' step: places and roads, requested at the same time (CLAUDE.md: "The 'near' step should run
 * Photon and the TIGER road query in parallel"). Ported from proto L1111–1137.
 *
 * Deviation (approved in the step 9 review): in the prototype, a places outage (Photon and every Overpass
 * mirror down) failed the step before roads were fetched, so the run lost its road grade, the driveway term
 * in site scoring, and every driveway entrance. Now the roads, the road grade and its flag come through
 * regardless; only the places half is lost. The step still reports failure, via `placesError`.
 */
import { findPlaces, trailheadsNear, OverpassMirrors, PlacesError, type OverpassFallback } from "./places";
import type { HospitalCandidate, HospitalSource } from "./hospitals";
import { mergeTrailheads, officialTrailheads } from "./trailheads";
import { CancelledError, type HttpClient } from "../http";
import { fetchOsmRoads, type OsmWay } from "./osmRoads";
import { fetchRoads, roadToSite, type RoadFeature } from "./roads";
import type { Dem, Endpoints, ScreenResult, RawFlag } from "./types";
import type { LatLon } from "./util";

export interface NearDeps {
  http: HttpClient;
  endpoints: Endpoints;
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
  overpass?: OverpassFallback;
  hospitals?: HospitalSource;
  /** The OSM roads query, when not straight to the mirrors (the worker: the app's route). */
  osmRoads?: (centre: LatLon, signal?: AbortSignal) => Promise<OsmWay[]>;
}

export interface NearOutcome extends Pick<ScreenResult, "near" | "nearNote" | "road" | "roadNote"> {
  /** Session-only: the raw TIGER features, for site scoring and the driveway router. */
  roads: RoadFeature[];
  /** Session-only: every non-chain supermarket found, nearest first (findPlaces), for the closer grocery. */
  otherGrocers?: { name: string; ll: LatLon }[];
  /** Session-only: every candidate hospital, nearest first, with its emergency status when known (A2c). */
  hospitalPool?: HospitalCandidate[];
  flags: RawFlag[];
  /** Session-only: OpenStreetMap's tracks and service roads (VR3a); absent when Overpass didn't answer. */
  osmRoads?: OsmWay[];
  /** Sources that didn't answer without failing the step (v4): an official trailhead list, the OSM roads. */
  unanswered: string[];
  /**
   * Set when both place sources failed: the orchestrator marks the step failed with this message and its
   * "test the query" link, and keeps everything else here.
   */
  placesError?: PlacesError;
}

export async function nearStep(
  centre: LatLon,
  /** The best site's pin; the parcel centre when there is no site (proto L1132). */
  siteLL: LatLon | null,
  dWide: Dem | null,
  roadMaxGradePct: number,
  deps: NearDeps,
  mirrors: OverpassMirrors = new OverpassMirrors(),
): Promise<NearOutcome> {
  const unanswered: string[] = [];
  const [places, roads, official, osm] = await Promise.allSettled([
    findPlaces(centre, deps, mirrors),
    fetchRoads(centre, deps),
    officialTrailheads(centre, deps, unanswered), // follow-up 24: USFS and the state parks; never fails but for a cancel
    // VR3a: OSM's tracks and service roads, possible frontage where TIGER shows none.
    deps.osmRoads ? deps.osmRoads(centre, deps.signal) : fetchOsmRoads(centre, deps, mirrors),
  ]);
  if (roads.status === "rejected") throw roads.reason; // only cancellation reaches here
  if (osm.status === "rejected" && osm.reason instanceof CancelledError) throw osm.reason;
  if (osm.status === "rejected") unanswered.push("OpenStreetMap roads");
  const osmRoads = osm.status === "fulfilled" ? { osmRoads: osm.value } : {};
  if (official.status === "rejected") throw official.reason; // cancellation
  if (places.status === "rejected" && !(places.reason instanceof PlacesError)) throw places.reason; // cancellation
  const out: NearOutcome =
    places.status === "fulfilled"
      ? {
          near: {
            ...places.value.near,
            ...trailheadsNear(mergeTrailheads([...official.value, ...places.value.osmTrailheads]), centre),
          },
          ...(places.value.nearNote ? { nearNote: places.value.nearNote } : {}),
          roads: roads.value,
          otherGrocers: places.value.otherGrocers,
          hospitalPool: places.value.hospitalPool,
          flags: [],
          ...osmRoads,
          unanswered,
        }
      : { roads: roads.value, flags: [], ...osmRoads, unanswered, placesError: places.reason as PlacesError };
  if (!dWide) return out;
  return { ...out, ...roadToSite(roads.value, siteLL ?? centre, dWide, roadMaxGradePct) };
}
