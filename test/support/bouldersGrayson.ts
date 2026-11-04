/**
 * Boulder potential's sanity test (docs/plans/boulders.md §1): Grayson Highlands' boulder field, north of Massie Gap,
 * read through the engine's own functions: its 3 m elevation and its soils, then measureBoulders. Recorded once from
 * 3DEP and NRCS by `pnpm record:boulders` (on CI's runners, boulders.yml) into
 * test/fixtures/boulders-grayson/network.har; the unit test (lib/screen/boulders-grayson.test.ts) replays it.
 */
import { join, resolve } from "node:path";
import type { Feature, Polygon } from "geojson";
import { createHttpClient, type HttpClient } from "@/lib/http";
import { measureBoulders } from "@/lib/screen/boulders";
import { DEFAULT_ENDPOINTS } from "@/lib/screen/config";
import { fetchDEM, fineResM, parcelBboxes } from "@/lib/screen/dem";
import { fetchSoilPolygons, fetchSoils, screenableRows } from "@/lib/screen/soils";
import { insideMasks, slopeAspect } from "@/lib/screen/terrain";
import { createReplayFetch, loadHar } from "./replayFetch";
import { instantClock } from "./pipeline";

export const BOULDERS_HAR_DIR = join(resolve(process.cwd(), "test", "fixtures"), "boulders-grayson");
export const BOULDERS_HAR = join(BOULDERS_HAR_DIR, "network.har");

/**
 * The open highland north of Massie Gap's lot (36.63314, −81.50731) toward Wilburn Ridge, where the park's boulders
 * lie in the meadows: about 900 m by 1,070 m. Not a parcel; a box the engine reads as one.
 */
export const GRAYSON_FIELD: Feature<Polygon> = {
  type: "Feature",
  properties: {},
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [-81.512, 36.632],
        [-81.5, 36.632],
        [-81.5, 36.64],
        [-81.512, 36.64],
        [-81.512, 36.632],
      ],
    ],
  },
};

/** The field read as the engine reads a parcel: the fine grid, the soils, then the boulder measurement. */
export async function readGraysonBoulders(http: HttpClient, replaying = false) {
  const io = { http, endpoints: DEFAULT_ENDPOINTS };
  const d = await fetchDEM(parcelBboxes(GRAYSON_FIELD).fine, fineResM(3), {
    ...io,
    // Live, 3DEP's retries wait as the app's do; replayed, nothing waits.
    ...(replaying ? { sleep: async () => undefined } : {}),
  });
  const { slope } = slopeAspect(d);
  const inside = insideMasks(d, GRAYSON_FIELD).own;
  const rows = screenableRows(await fetchSoils(GRAYSON_FIELD, io));
  const units = await fetchSoilPolygons(GRAYSON_FIELD, io);
  const boulders = measureBoulders(units, rows, { d, slope, inside });
  return { d, slope, inside, rows, units, boulders };
}

/** An HttpClient answering from the recording, offline. */
export const graysonReplay = (): HttpClient =>
  createHttpClient({
    env: "node",
    fetchImpl: createReplayFetch(loadHar(BOULDERS_HAR)),
    clock: instantClock(),
  });
