/**
 * The elevation the result was graded on (docs/plans/existing-house.md §3): USGS 3DEP lidar, or, when 3DEP didn't
 * answer, AWS Terrain Tiles (NED/SRTM, 8 m or coarser, not lidar). Every label downstream of the elevation names the one
 * actually used: with 3DEP each string is exactly as it was; with the fallback, "lidar" becomes the tiles' name. Pure.
 */
import { fmt } from "../format";

/** The engine's two sources (lib/screen/dem.ts). */
export const DEM_3DEP = "USGS 3DEP";
export const DEM_TILES = "AWS Terrain Tiles (NED/SRTM)";

export interface Elevation {
  /** 3DEP answered (or the result is older than the field: it was 3DEP then). */
  lidar: boolean;
  /** "USGS 3DEP lidar", or "AWS Terrain Tiles (NED/SRTM), not lidar". */
  name: string;
  /** What the text calls it: "lidar", or "Terrain Tiles elevation". */
  noun: string;
  /** Its cell size, metres, when the result says. */
  resM: number | null;
}

export function elevationOf(r: { demSource?: string; demResM?: number }): Elevation {
  const lidar = !r.demSource || r.demSource === DEM_3DEP;
  return {
    lidar,
    name: lidar ? "USGS 3DEP lidar" : `${DEM_TILES}, not lidar`,
    noun: lidar ? "lidar" : "Terrain Tiles elevation",
    resM: r.demResM ?? null,
  };
}

/**
 * A label written for the lidar, for the elevation actually used: unchanged with 3DEP; with the fallback, "3 m lidar"
 * becomes its own cell size and "lidar" its name ("the 8 m Terrain Tiles elevation"), and "USGS 3DEP lidar" the tiles.
 */
export function relabel(text: string, e: Elevation): string {
  if (e.lidar) return text;
  const grid = e.resM != null ? `${fmt(e.resM)} m ${e.noun}` : e.noun;
  // One pass, so the tiles' own name ("…, not lidar") isn't rewritten again.
  return text.replace(/USGS 3DEP lidar|\b\d+ m lidar\b|\blidar\b/g, (m) =>
    m === "USGS 3DEP lidar" ? e.name : m === "lidar" ? e.noun : grid,
  );
}

/** The Terrain section's note when the fallback was used (§3: a retry is a re-grade). */
export const fallbackNote = (source: string): string =>
  `from ${source} — USGS 3DEP was unavailable; grade again to try 3DEP again`;
