/**
 * Which states a search reaches (follow-up 53, #122 review): Virginia's, North Carolina's and Tennessee's outlines,
 * simplified, from lib/screen/data/state-outlines.json (`pnpm data:states`). The trailhead search asks a state's parks
 * service only when the state comes within its distance of the parcel.
 */
import { pointToPolygonDistance } from "@turf/turf";
import type { Polygon } from "geojson";
import outlines from "./data/state-outlines.json";
import type { LatLon } from "./util";

export type StateCode = "VA" | "NC" | "TN";

const OUTLINES = outlines.states as unknown as Record<StateCode, Polygon>;

/** How far the point is from the state, in km: 0 or less inside it. */
export function kmToState(state: StateCode, [lat, lon]: LatLon): number {
  return pointToPolygonDistance([lon, lat], OUTLINES[state], { units: "kilometers" });
}

/** The state comes within `km` of the point (or the point is in it). */
export const stateWithinKm = (state: StateCode, ll: LatLon, km: number): boolean =>
  kmToState(state, ll) <= km;
