/**
 * The 'near' step: places and roads, requested at the same time (CLAUDE.md: "The 'near' step should run
 * Photon and the TIGER road query in parallel"). The prototype fetched roads only after places succeeded
 * (proto L1111–1137); its outcomes are kept exactly: when places fail, the step fails and no roads are
 * returned, so later steps see none, just as before.
 */
import type { HttpClient } from "../http";
import { findPlaces, OverpassMirrors } from "./places";
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
  if (places.status === "rejected") throw places.reason; // as before: no places, no roads
  if (roads.status === "rejected") throw roads.reason; // only cancellation reaches here
  const out: NearOutcome = { ...places.value, roads: roads.value, flags: [] };
  if (!dWide) return out;
  return { ...out, ...roadToSite(roads.value, siteLL ?? centre, dWide, roadMaxGradePct) };
}
