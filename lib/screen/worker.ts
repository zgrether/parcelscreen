/**
 * Web Worker entry: runs the screen off the main thread and posts typed progress (docs/plans/phase-0.md §3b).
 * All logic is in worker-protocol.ts; this file only connects it to the worker scope.
 */
import { createHttpClient } from "../http";
import { overpassViaRoute } from "./places";
import { ScreenWorkerCore, type FromWorker, type ToWorker } from "./worker-protocol";

const scope = self as unknown as {
  postMessage(m: FromWorker): void;
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
  location: { origin: string };
};

const http = createHttpClient({ env: "browser" });
const core = new ScreenWorkerCore((m) => scope.postMessage(m), {
  http,
  // No Overpass mirror answers a browser, so the fallback runs on the server (see places.ts).
  overpass: overpassViaRoute(`${scope.location.origin}/api/places/overpass`, http),
});
scope.onmessage = (e) => void core.handle(e.data);
