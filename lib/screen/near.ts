/**
 * The 'near' step: places and roads, requested at the same time (CLAUDE.md: "The 'near' step should run
 * Photon and the TIGER road query in parallel"). Ported from proto L1111–1137.
 *
 * Deviation (approved in the step 9 review): in the prototype, a places outage (Photon and every Overpass
 * mirror down) failed the step before roads were fetched, so the run lost its road grade, the driveway term
 * in site scoring, and every driveway entrance. Now the roads, the road grade and its flag come through
 * regardless; only the places half is lost. The step still reports failure, via `placesError`.
 */
import type { HttpClient } from "../http";
import { findPlaces, OverpassMirrors, PlacesError } from "./places";
import { fetchRoads, roadToSite, type RoadFeature } from "./roads";
import type { Dem, Endpoints, ScreenResult } from "./types";
import type { LatLon } from "./util";

export interface NearDeps {
  http: HttpClient;
  endpoints: Endpoints;
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
}

export interface NearOutcome extends Pick<ScreenResult, "near" | "nearNote" | "road" | "roadNote"> {
  /** Session-only: the raw TIGER features, for site scoring and the driveway router. */
  roads: RoadFeature[];
  flags: ScreenResult["flags"];
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
  const [places, roads] = await Promise.allSettled([
    findPlaces(centre, deps, mirrors),
    fetchRoads(centre, deps),
  ]);
  if (roads.status === "rejected") throw roads.reason; // only cancellation reaches here
  if (places.status === "rejected" && !(places.reason instanceof PlacesError)) throw places.reason; // cancellation
  const out: NearOutcome =
    places.status === "fulfilled"
      ? { ...places.value, roads: roads.value, flags: [] }
      : { roads: roads.value, flags: [], placesError: places.reason as PlacesError };
  if (!dWide) return out;
  return { ...out, ...roadToSite(roads.value, siteLL ?? centre, dWide, roadMaxGradePct) };
}
