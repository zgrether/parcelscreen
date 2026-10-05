/**
 * Runs a recorded fixture through the ported steps so far, offline, so each step's parity test starts
 * from the port's own upstream results (not the prototype's). Grows step by step until the orchestrator
 * (step 10) replaces it.
 */
import { area, centroid, polygon } from "@turf/turf";
import { createHttpClient } from "@/lib/http";
import { DEFAULT_ENDPOINTS, DEFAULT_USER_CONFIG } from "@/lib/screen/config";
import { DemCache, fetchParcelDems } from "@/lib/screen/dem";
import { findSites, siteResults } from "@/lib/screen/sites";
import { insideMask, slopeAspect, valleyFloor } from "@/lib/screen/terrain";
import { M2_PER_ACRE, type LatLon } from "@/lib/screen/util";
import { loadFixture, type FixtureSlug } from "./fixtures";

export async function throughSites(slug: FixtureSlug) {
  const fx = loadFixture(slug);
  const fetch = fx.replayFetch();
  const deps = {
    http: createHttpClient({ env: "node", fetchImpl: fetch }),
    endpoints: DEFAULT_ENDPOINTS,
    cache: new DemCache(),
  };
  const parcel = polygon(fx.input.polygon.geometry.coordinates);
  const acres = area(parcel) / M2_PER_ACRE;
  const { dFine, dWide } = await fetchParcelDems(parcel, DEFAULT_USER_CONFIG.demResM, deps);
  const { slope, aspect } = slopeAspect(dFine);
  const inside = insideMask(dFine, parcel);
  const [lon, lat] = centroid(parcel).geometry.coordinates as [number, number];
  const centre: LatLon = [lat, lon];
  const vf = valleyFloor(dWide, centre);
  const search = findSites(dFine, slope, aspect, inside, vf, DEFAULT_USER_CONFIG);
  return {
    fx,
    fetch,
    deps,
    parcel,
    acres,
    centre,
    dFine,
    dWide,
    slope,
    aspect,
    inside,
    vf,
    search,
    sites: siteResults(dFine, vf, search),
  };
}
