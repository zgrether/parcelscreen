/**
 * The 'near' step: places and roads, requested at the same time (CLAUDE.md: "The 'near' step should run
 * Photon and the TIGER road query in parallel"). Ported from proto L1111–1137.
 *
 * Deviation (approved in the step 9 review): in the prototype, a places outage (Photon and every Overpass
 * mirror down) failed the step before roads were fetched, so the run lost its road grade, the driveway term
 * in site scoring, and every driveway entrance. Now the roads, the road grade and its flag come through
 * regardless; only the places half is lost. The step still reports failure, via `placesError`.
 */
import { findPlaces, trailheadsNear, OverpassMirrors, PlacesError } from "./places";
import type { HospitalCandidate, HospitalSource } from "./hospitals";
import type { PlacesSource } from "./placeData";
import { mergeTrailheads, officialTrailheads } from "./trailheads";
import { CancelledError, type HttpClient } from "../http";
import { fetchOsmRoads, type OsmWay } from "./osmRoads";
import { fetchRoads, roadToSite, type RoadFeature } from "./roads";
import {
  findPower,
  hifldLines,
  measurePower,
  osmPowerFromMirrors,
  type OsmPowerSource,
  type PowerMeasure,
} from "./power";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import type { Dem, Endpoints, ScreenResult, RawFlag } from "./types";
import type { LatLon } from "./util";

export interface NearDeps {
  http: HttpClient;
  endpoints: Endpoints;
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
  hospitals?: HospitalSource;
  /** Step 14d: the baked places (groceries, trailheads); defaults to `endpoints.places`. */
  places?: PlacesSource;
  /** The OSM roads query, when not straight to the mirrors (the worker: the app's route). */
  osmRoads?: (centre: LatLon, signal?: AbortSignal) => Promise<OsmWay[]>;
  /** Step 14: the parcel, for the power lines near it; without it, none are looked for. */
  parcel?: Feature<Polygon | MultiPolygon>;
  /** Step 14: OSM's power lines, when not straight to the mirrors (the worker: the app's route, kind=power). */
  osmPower?: OsmPowerSource;
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
  /** Sources that didn't answer without failing the step (v4): the OSM roads, the power lines. */
  unanswered: string[];
  /** Step 14: the power lines near the parcel; absent when no parcel was given, or neither source answered. */
  power?: PowerMeasure;
  /**
   * Set when the baked places couldn't be read: the orchestrator marks the step failed with this message, and keeps
   * everything else here.
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
  const parcel = deps.parcel;
  const [places, roads, official, osm, power] = await Promise.allSettled([
    findPlaces(centre, deps),
    fetchRoads(centre, deps),
    officialTrailheads(centre, deps), // follow-up 24: USFS and the state parks, baked since step 14d
    // VR3a: OSM's tracks and service roads, possible frontage where TIGER shows none.
    deps.osmRoads ? deps.osmRoads(centre, deps.signal) : fetchOsmRoads(centre, deps, mirrors),
    // Step 14: HIFLD's power lines, else OSM's.
    parcel
      ? findPower(
          parcel,
          centre,
          () => hifldLines(deps.endpoints.power, parcel, deps),
          deps.osmPower ?? osmPowerFromMirrors(deps, mirrors),
          deps.signal,
        ).then((f) => measurePower(f, parcel))
      : Promise.resolve(undefined),
  ]);
  if (power.status === "rejected" && power.reason instanceof CancelledError) throw power.reason;
  if (power.status === "rejected") unanswered.push("Power lines");
  const powerOut = power.status === "fulfilled" && power.value ? { power: power.value } : {};
  if (roads.status === "rejected") throw roads.reason; // only cancellation reaches here
  if (osm.status === "rejected" && osm.reason instanceof CancelledError) throw osm.reason;
  if (osm.status === "rejected") unanswered.push("OpenStreetMap roads");
  const osmRoads = osm.status === "fulfilled" ? { osmRoads: osm.value } : {};
  if (official.status === "rejected" && official.reason instanceof CancelledError) throw official.reason;
  if (places.status === "rejected" && !(places.reason instanceof PlacesError)) throw places.reason; // cancellation
  // The official cells failing is the places half failing, as OSM's cells failing is.
  const placesError =
    places.status === "rejected"
      ? (places.reason as PlacesError)
      : official.status === "rejected"
        ? new PlacesError(`Places: ${(official.reason as Error).message}`)
        : null;
  const out: NearOutcome =
    places.status === "fulfilled" && official.status === "fulfilled"
      ? {
          near: {
            ...places.value.near,
            ...trailheadsNear(mergeTrailheads([...official.value, ...places.value.osmTrailheads]), centre),
          },
          roads: roads.value,
          otherGrocers: places.value.otherGrocers,
          hospitalPool: places.value.hospitalPool,
          flags: [],
          ...osmRoads,
          ...powerOut,
          unanswered,
        }
      : {
          roads: roads.value,
          flags: [],
          ...osmRoads,
          ...powerOut,
          unanswered,
          placesError: placesError!,
        };
  if (!dWide) return out;
  return { ...out, ...roadToSite(roads.value, siteLL ?? centre, dWide, roadMaxGradePct) };
}
