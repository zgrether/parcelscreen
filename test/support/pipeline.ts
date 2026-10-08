/**
 * Runs a recorded fixture through the ported steps so far, offline, so each step's parity test starts
 * from the port's own upstream results (not the prototype's). Grows step by step until the orchestrator
 * (step 10) replaces it.
 */
import { area, centroid, feature, polygon } from "@turf/turf";
import { createHttpClient, type Clock } from "@/lib/http";
import { DEFAULT_ENDPOINTS, DEFAULT_USER_CONFIG } from "@/lib/screen/config";
import { DemCache, fetchParcelDems } from "@/lib/screen/dem";
import { findSites, siteResults } from "@/lib/screen/sites";
import { fetchSoilPolygons, fetchSoils, screenableRows, vetBenches, vetGardens } from "@/lib/screen/soils";
import { insideMasks, slopeAspect, valleyFloor } from "@/lib/screen/terrain";
import { M2_PER_ACRE, type LatLon } from "@/lib/screen/util";
import { loadFixture, type FixtureSlug } from "./fixtures";
import { fixtureParcel } from "./scenarios";

/** Virtual time: the per-host throttle (1 req/s to OSRM and Photon) advances it instead of waiting. */
export function instantClock(): Clock {
  let t = 0;
  return { now: () => t, sleep: async (ms) => void (t += ms) };
}

export async function throughSites(slug: FixtureSlug) {
  const fx = loadFixture(slug);
  const fetch = fx.replayFetch();
  const deps = {
    http: createHttpClient({ env: "node", fetchImpl: fetch, clock: instantClock() }),
    endpoints: DEFAULT_ENDPOINTS,
    cache: new DemCache(),
  };
  // The parcel as the app screens it: the county record through the recipe (every part, follow-up 29).
  const input = await fixtureParcel(slug);
  const parcel = polygon(input.polygon.coordinates);
  const ownLand = input.ownLand ? feature(input.ownLand) : undefined;
  const acres = area(ownLand ?? parcel) / M2_PER_ACRE;
  const { dFine, dWide } = await fetchParcelDems(parcel, DEFAULT_USER_CONFIG.demResM, deps);
  const { slope, aspect } = slopeAspect(dFine);
  const { own: inside } = insideMasks(dFine, parcel, ownLand);
  const [lon, lat] = centroid(parcel).geometry.coordinates as [number, number];
  const centre: LatLon = [lat, lon];
  const vf = valleyFloor(dWide, centre);
  const search = findSites(dFine, slope, aspect, inside, vf, DEFAULT_USER_CONFIG);
  return {
    fx,
    fetch,
    deps,
    parcel,
    /** What soils, flood and public land measure: the own land, or the parcel when it has no strip (follow-up 29). */
    measured: ownLand ?? parcel,
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

/** …then the soils step: rows, map units, vetted benches (with the re-picked best) and gardens. */
export async function throughSoils(slug: FixtureSlug) {
  const t = await throughSites(slug);
  const rows = screenableRows(await fetchSoils(t.measured, t.deps));
  const units = await fetchSoilPolygons(t.measured, t.deps);
  const vet = vetBenches(t.search.benches, t.dFine, units, rows);
  return { ...t, rows, units, vet, gardens: vetGardens(t.sites.gardens, units, rows) };
}
