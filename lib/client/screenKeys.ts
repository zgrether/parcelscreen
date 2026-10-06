/**
 * What a screen was run on, so the panel can tell whether its results still fit the open parcel (owner,
 * step 14d). Three cases, each handled differently:
 *   - boundary: the parcel's pieces or split changed: the results are stale, a re-run is required;
 *   - house: the house was added, moved or removed: re-assessed with the worker's setHouse, no notice;
 *   - settings: Settings changed since the run: a softer note that the results used earlier settings.
 * Pure: the keys are short hashes of the inputs.
 */
import type { Polygon } from "geojson";
import type { LatLon } from "../geo/types";
import type { UserConfig } from "../screen/types";

export interface RunKeys {
  boundary: string;
  /** "" when no house was marked. */
  house: string;
  settings: string;
}

/** 32-bit FNV-1a, as hex: enough to tell inputs apart, never stored as a secret. */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** JSON with object keys sorted, so the same settings always give the same key. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v);
}

/**
 * The keys of a run's inputs. Settings leave out the service endpoints: where the data comes from doesn't
 * change what a screen means, and the endpoints migrate on their own.
 */
export function runKeys(polygon: Polygon, house: LatLon | null, config: UserConfig): RunKeys {
  const { endpoints: _endpoints, ...settings } = config;
  return {
    boundary: hash(stable(polygon.coordinates)),
    house: house ? `${house[0].toFixed(6)},${house[1].toFixed(6)}` : "",
    settings: hash(stable(settings)),
  };
}

export interface Freshness {
  /** The boundary changed: stale, a re-run is required. */
  boundary: boolean;
  /** The house changed: re-assess it (setHouse). */
  house: boolean;
  /** Settings changed: the results used earlier settings. */
  settings: boolean;
}

export const freshness = (run: RunKeys, now: RunKeys): Freshness => ({
  boundary: run.boundary !== now.boundary,
  house: run.house !== now.house,
  settings: run.settings !== now.settings,
});
