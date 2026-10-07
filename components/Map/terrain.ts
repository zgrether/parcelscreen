/**
 * The terrain preview's tile plumbing (step 13g plan §2), browser-only: one maplibre-contour DemSource fetches
 * each Terrarium tile once, in a worker, and serves both the raster-dem sources (terrain and hillshade,
 * through its shared protocol) and the contour lines (through its contour protocol). Set up once per page.
 */
import mlcontour from "maplibre-contour";
import { addProtocol } from "maplibre-gl";
import {
  CONTOUR_THRESHOLDS,
  CONTOUR_TILE,
  FEET_PER_M,
  TERRARIUM_MAXZOOM,
  TERRARIUM_TILES,
  type TerrainTiles,
} from "./terrainStyle";

let tiles: TerrainTiles | null = null;

/** The tile URLs for buildStyle, registering the protocols with MapLibre the first time. */
export function terrainTiles(): TerrainTiles {
  if (tiles) return tiles;
  const source = new mlcontour.DemSource({
    url: TERRARIUM_TILES,
    encoding: "terrarium",
    maxzoom: TERRARIUM_MAXZOOM,
    worker: true,
    cacheSize: 100,
    timeoutMs: 10_000,
  });
  // MapLibre 4+ protocol handlers: (request, abortController) => Promise. The plugin's types also allow the
  // older callback form, which MapLibre 6's addProtocol doesn't take.
  source.setupMaplibre({ addProtocol: addProtocol as never });
  tiles = {
    dem: source.sharedDemProtocolUrl,
    contours: source.contourProtocolUrl({
      multiplier: FEET_PER_M,
      thresholds: CONTOUR_THRESHOLDS,
      contourLayer: CONTOUR_TILE.layer,
      elevationKey: CONTOUR_TILE.elevation,
      levelKey: CONTOUR_TILE.level,
      extent: 4096,
      buffer: 1,
    }),
  };
  return tiles;
}
