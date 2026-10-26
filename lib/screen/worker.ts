/**
 * Web Worker entry: runs the screen off the main thread and posts typed progress (docs/plans/phase-0.md §3b).
 * All logic is in worker-protocol.ts; this file only connects it to the worker scope.
 */
import { createHttpClient } from "../http";
import { osmRoadsViaRoute } from "./osmRoads";
import { osmPowerViaRoute } from "./power";
import { PLACES_PATH, placesFromHttp } from "./placeData";
import { ScreenWorkerCore, type FromWorker, type ToWorker } from "./worker-protocol";

const scope = self as unknown as {
  postMessage(m: FromWorker): void;
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
  location: { origin: string };
};

const http = createHttpClient({ env: "browser" });
const core = new ScreenWorkerCore((m) => scope.postMessage(m), {
  http,
  // The baked places (step 14d), from this deployment's own copy.
  places: placesFromHttp(http, `${scope.location.origin}${PLACES_PATH}`),
  // No Overpass mirror answers a browser, so the OSM roads (VR3a) run on the server (see places.ts).
  osmRoads: osmRoadsViaRoute(`${scope.location.origin}/api/places/overpass`, http),
  // And the OSM power lines (step 14), when HIFLD has none.
  osmPower: osmPowerViaRoute(`${scope.location.origin}/api/places/overpass`, http),
});
scope.onmessage = (e) => void core.handle(e.data);
