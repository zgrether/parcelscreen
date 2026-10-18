/**
 * The map behind the other tabs (step 4b; owner, 10/18): the explorer stays mounted while Your list or What matters is
 * showing, so coming back is instant and the parcels screened this session keep their overlays. While it's hidden the
 * map must cost nothing: no render loop, no terrain or animation work, no tile fetches.
 *
 * MapLibre draws, and asks for tiles, only inside a frame that `triggerRepaint` requests (its camera animations, tile
 * arrivals and source updates all go through it). Pausing stops the camera, drops a frame already asked for, swaps the
 * instance's `triggerRepaint` for one that only notes the request, and stops it following its container's size (a
 * hidden container measures 0 × 0; the map keeps the size it had). Resuming puts both back, re-measures and draws once.
 * If the browser drops the page anyway (a phone short of memory), the next load restores the view and the open parcel
 * from storage, and Run again restores the overlays: the fallback, as before this step.
 */
import type { Map as MlMap } from "maplibre-gl";

/** The private fields this touches (MapLibre 6). */
interface Internals {
  _frameRequest: AbortController | null;
  _trackResize: boolean;
}

const paused = new WeakMap<MlMap, { trackResize: boolean }>();

export function pauseMap(map: MlMap): void {
  if (paused.has(map)) return;
  const m = map as unknown as Internals;
  paused.set(map, { trackResize: m._trackResize });
  map.stop();
  m._frameRequest?.abort();
  m._frameRequest = null;
  m._trackResize = false;
  // An own property shadows the prototype's method until resume deletes it.
  map.triggerRepaint = () => {};
}

export function resumeMap(map: MlMap): void {
  const was = paused.get(map);
  if (!was) return;
  paused.delete(map);
  delete (map as unknown as { triggerRepaint?: unknown }).triggerRepaint;
  (map as unknown as Internals)._trackResize = was.trackResize;
  map.resize();
  map.triggerRepaint();
}

export const isPaused = (map: MlMap): boolean => paused.has(map);
