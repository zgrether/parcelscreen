/**
 * Tennessee's parcel service in Carter County (step 2, PR 2): the requests the unit tests replay, recorded once from
 * the live public-use layer by `pnpm record:tn` into test/fixtures/tn-carter/parcels.har (owner fields scrubbed).
 * The recorder and the tests make the same calls, through the app's own functions, so a change in what the app
 * asks shows as a replay miss.
 *
 * The parcels, checked live 2026-10-17:
 * - 010066 03700: a 67-acre tract (map 066, parcel 037.00) with a "Parcel Conflict" polygon (PARCEL_TYPE 5) over part
 *   of it, sharing its GISLINK;
 * - 010083 08000: one parcel drawn as two polygons with the same record (map 083, parcel 080.00, 45.75 deeded acres).
 */
import { join, resolve } from "node:path";
import { createHttpClient, type HttpClient } from "@/lib/http";
import { fullRecord, fetchTile, countTile, tilesFor, type Tile } from "@/lib/geo/parcelTiles";
import { pickParcelAt } from "@/lib/geo/parcels";
import { DEFAULT_ENDPOINTS } from "@/lib/screen/config";
import { searchParcelNumbers } from "@/lib/search/sources";
import { createReplayFetch, loadHar } from "./replayFetch";
import { instantClock } from "./pipeline";

export const TN_SOURCE = DEFAULT_ENDPOINTS.parcels.find((u) => u.includes("Tennessee_Property_Boundaries"))!;
export const TN_HAR = resolve(process.cwd(), "test", "fixtures", "tn-carter", "parcels.har");

export const CONFLICT_GISLINK = "010066    03700";
export const TWO_PIECE_GISLINK = "010083    08000";
/** Inside the conflict polygon (its centroid), which a point pick must not return. */
export const IN_CONFLICT: [number, number] = [36.27555, -82.15623];
/** The zoom-14 tile holding the conflict parcel. */
export const CONFLICT_TILE: Tile = tilesFor({
  west: -82.1573,
  east: -82.1573,
  north: 36.2789,
  south: 36.2789,
})[0]!;

/** Every request the tests replay, in one run. */
export async function carterSamples(http: HttpClient) {
  const tile = await fetchTile(http, TN_SOURCE, CONFLICT_TILE, "coarse");
  const count = await countTile(http, TN_SOURCE, CONFLICT_TILE);
  const outline = (gislink: string) => ({
    source: TN_SOURCE,
    props: { OBJECTID: 0, GISLINK: gislink, COUNTY_NAME: "Carter" },
  });
  const conflict = await fullRecord(http, outline(CONFLICT_GISLINK));
  const twoPiece = await fullRecord(http, outline(TWO_PIECE_GISLINK));
  const counties = new Map([[TN_SOURCE, new Set(["Carter"])]]);
  const search = await searchParcelNumbers(http, counties, "66 37");
  const searchTwoPiece = await searchParcelNumbers(http, counties, "083 080");
  const picked = await pickParcelAt(http, [TN_SOURCE], IN_CONFLICT);
  return { tile, count, conflict, twoPiece, search, searchTwoPiece, picked };
}

/** An HttpClient answering from the recording, offline. */
export const carterReplay = (): HttpClient =>
  createHttpClient({ env: "node", fetchImpl: createReplayFetch(loadHar(TN_HAR)), clock: instantClock() });

export const TN_HAR_DIR = join(resolve(process.cwd(), "test", "fixtures"), "tn-carter");
