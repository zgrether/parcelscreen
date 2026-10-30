/**
 * Hamilton County's own parcel service (the Tennessee counties mission, docs/plans/tn-counties.md): the requests the
 * unit tests replay, recorded once from the live Live_Parcels layer by `pnpm record:tn-hamilton` into
 * test/fixtures/tn-hamilton/parcels.har (owner and address fields scrubbed). As tnCarter.ts, the recorder and the
 * tests make the same calls, through the app's own functions.
 *
 * The parcel: Three Gorges Farms tract 1, 048 045.24 (on Three Gorges Road, Soddy-Daisy, 5.09 ac, object id 8192),
 * just east of Worley Road (checked live 2026-10-30, tn-counties.md §0).
 */
import { join, resolve } from "node:path";
import { pointOnFeature } from "@turf/turf";
import { createHttpClient, type HttpClient } from "@/lib/http";
import { countTile, fetchTile, fullRecord, tilesFor } from "@/lib/geo/parcelTiles";
import { stateOf } from "@/lib/geo/parcelFields";
import { pickParcelAt } from "@/lib/geo/parcels";
import type { LatLon } from "@/lib/geo/types";
import { DEFAULT_ENDPOINTS } from "@/lib/screen/config";
import { searchParcelNumbers } from "@/lib/search/sources";
import { createReplayFetch, loadHar } from "./replayFetch";
import { instantClock } from "./pipeline";

export const HAMILTON_SOURCE = DEFAULT_ENDPOINTS.parcels.find((u) => u.includes("hamiltontn.gov"))!;
export const HAMILTON_HAR_DIR = join(resolve(process.cwd(), "test", "fixtures"), "tn-hamilton");
export const HAMILTON_HAR = join(HAMILTON_HAR_DIR, "parcels.har");

export const TN_SERVICES = DEFAULT_ENDPOINTS.parcels.filter((u) => stateOf(u) === "TN");

export const THREE_GORGES_OID = 8192;
export const THREE_GORGES_TAX_CARD = "048 045.24";
export const THREE_GORGES_GISLINK = "033048    04524";

/** Every request the tests replay, in one run. */
export async function hamiltonSamples(http: HttpClient) {
  const record = await fullRecord(http, {
    source: HAMILTON_SOURCE,
    props: { OBJECTID: THREE_GORGES_OID },
  });
  const [lon, lat] = pointOnFeature(record.geo).geometry.coordinates as [number, number];
  const inside: LatLon = [lat, lon];
  const tile = tilesFor({ west: lon, east: lon, north: lat, south: lat })[0]!;
  const lines = await fetchTile(http, HAMILTON_SOURCE, tile, "coarse");
  const count = await countTile(http, HAMILTON_SOURCE, tile);
  // Tennessee's services in the app's order: the state's layer, which has no Hamilton parcels, then the county's.
  const picked = await pickParcelAt(http, TN_SERVICES, inside);
  // The map's search: the household's region and the map's view over Soddy-Daisy.
  const search = await searchParcelNumbers(
    http,
    { sources: [HAMILTON_SOURCE], bbox: [-85.3, 35.2, -85.1, 35.4] },
    "48 45.24",
  );
  return { record, inside, tile, lines, count, picked, search };
}

/** An HttpClient answering from the recording, offline. */
export const hamiltonReplay = (): HttpClient =>
  createHttpClient({
    env: "node",
    fetchImpl: createReplayFetch(loadHar(HAMILTON_HAR)),
    clock: instantClock(),
  });
