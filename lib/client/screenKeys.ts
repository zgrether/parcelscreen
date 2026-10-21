/**
 * What a screen was run on, so the panel can tell whether its results still fit the open parcel (owner,
 * step 14d). Four cases, each handled differently:
 *   - boundary: the parcel's pieces or split changed: the results are stale, a re-run is required;
 *   - house: the house was added, moved or removed: re-assessed with the worker's setHouse, no notice;
 *   - settings: Settings changed since the run: a softer note that the results used earlier settings;
 *   - lines: the drawn tracks or easements changed (follow-up 34): the same softer note, for the lines.
 * Pure: the keys are short hashes of the inputs.
 */
import type { Polygon } from "geojson";
import type { LatLon } from "../geo/types";
import type { DrawnInput, UserConfig } from "../screen/types";

export interface RunKeys {
  boundary: string;
  /** "" when no house was marked. */
  house: string;
  settings: string;
  /**
   * Each setting's own key, by its name in the config (polish #10): which ones changed, for "Grade again: road veto
   * changed". Missing on a screen kept before it: the button then says only "settings changed".
   */
  settingsBy?: Record<string, string>;
  /** "" when no line was drawn. A line's note doesn't count: the screen doesn't read it. */
  lines: string;
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
export function runKeys(
  polygon: Polygon,
  house: LatLon | null,
  config: UserConfig,
  lines: readonly DrawnInput[] = [],
): RunKeys {
  const { endpoints: _endpoints, ...settings } = config;
  return {
    boundary: hash(stable(polygon.coordinates)),
    house: house ? `${house[0].toFixed(6)},${house[1].toFixed(6)}` : "",
    settings: hash(stable(settings)),
    settingsBy: Object.fromEntries(Object.entries(settings).map(([k, v]) => [k, hash(stable(v))] as const)),
    lines: lines.length ? hash(stable(lines)) : "",
  };
}

export interface Freshness {
  /** The boundary changed: stale, a re-run is required. */
  boundary: boolean;
  /** The house changed: re-assess it (setHouse). */
  house: boolean;
  /** Settings changed: the results used earlier settings. */
  settings: boolean;
  /** The settings that changed, by their names in the config, in the config's order; empty when the run didn't keep them. */
  settingsChanged?: string[];
  /** The drawn lines changed: the results used earlier lines (follow-up 34). */
  lines: boolean;
}

export const freshness = (run: RunKeys, now: RunKeys): Freshness => ({
  boundary: run.boundary !== now.boundary,
  house: run.house !== now.house,
  settings: run.settings !== now.settings,
  settingsChanged:
    run.settings !== now.settings && run.settingsBy && now.settingsBy
      ? Object.keys(now.settingsBy).filter((k) => run.settingsBy![k] !== now.settingsBy![k])
      : [],
  lines: (run.lines ?? "") !== now.lines,
});
