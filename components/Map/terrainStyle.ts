/**
 * The terrain preview's sources and layers (step 13g plan §1–3): AWS Terrain Tiles (Terrarium) for 3D terrain
 * and a hillshade, and contour lines in feet from the same tiles (maplibre-contour). A preview at about 10 m:
 * the screen itself uses 3 m lidar. Pure style data; terrain.ts wires the tiles up in the browser.
 *
 * Order (plan §3, with step 15's slots): basemap < hillshade < light pollution < scrim < (15: terrain image <
 * soil fills) < contours < parcel lines < … The hillshade goes in just above the basemaps and the contours
 * just under the parcel lines (buildStyle).
 */
import type {
  ExpressionSpecification,
  LayerSpecification,
  RasterDEMSourceSpecification,
  SkySpecification,
  SourceSpecification,
  VectorSourceSpecification,
} from "maplibre-gl";

export const TERRARIUM_TILES = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
/** The deepest zoom the tiles exist at; MapLibre overzooms above it. */
export const TERRARIUM_MAXZOOM = 15;
export const TERRAIN_ATTRIBUTION = "Terrain: AWS Terrain Tiles (USGS 3DEP, SRTM, et al.)";

export const EXAGGERATIONS = [1, 1.5, 2] as const;
export type Exaggeration = (typeof EXAGGERATIONS)[number];

/** How far the camera may tilt (MapLibre 6 allows 85). */
export const MAX_PITCH = 80;

/** Metres to feet, for the contour intervals and labels. */
export const FEET_PER_M = 3.28084;
/**
 * Contour intervals in feet, [minor, major] from each zoom up (owner, 13g): 40/200 ft at zooms 13–14, 20/100
 * ft from 15. Nothing below 13.
 */
export const CONTOUR_THRESHOLDS: Record<number, [number, number]> = { 13: [40, 200], 15: [20, 100] };
export const CONTOURS_MIN_ZOOM = 13;

export const TERRAIN_SOURCE = {
  terrain: "terrain-dem",
  hillshade: "hillshade-dem",
  contours: "contours",
} as const;

export const TERRAIN_LAYER = {
  hillshade: "hillshade",
  contourLines: "contour-lines",
  contourLabels: "contour-labels",
} as const;

/** The tile URLs: the shared Terrarium protocol for the DEM, the contour protocol for the lines. */
export interface TerrainTiles {
  dem: string;
  contours: string;
}

/** Self-hosted label glyphs: Noto Sans Regular, 0–255 only (public/fonts). */
export const GLYPHS = "/fonts/{fontstack}/{range}.pbf";
export const LABEL_FONT = "Noto Sans Regular";

const dem = (tiles: string): RasterDEMSourceSpecification => ({
  type: "raster-dem",
  tiles: [tiles],
  tileSize: 256,
  maxzoom: TERRARIUM_MAXZOOM,
  encoding: "terrarium",
  attribution: TERRAIN_ATTRIBUTION,
});

/**
 * Two raster-dem sources on the same tiles: MapLibre warns when one source feeds both the terrain and a
 * hillshade, and the shared protocol fetches each tile only once anyway.
 */
export function terrainSources(tiles: TerrainTiles): Record<string, SourceSpecification> {
  const contours: VectorSourceSpecification = {
    type: "vector",
    tiles: [tiles.contours],
    maxzoom: TERRARIUM_MAXZOOM,
    attribution: TERRAIN_ATTRIBUTION,
  };
  return {
    [TERRAIN_SOURCE.terrain]: dem(tiles.dem),
    [TERRAIN_SOURCE.hillshade]: dem(tiles.dem),
    [TERRAIN_SOURCE.contours]: contours,
  };
}

/** Soft shading that lets the aerial show through. Starts hidden (prefs decide). */
export function hillshadeLayer(): LayerSpecification {
  return {
    id: TERRAIN_LAYER.hillshade,
    type: "hillshade",
    source: TERRAIN_SOURCE.hillshade,
    layout: { visibility: "none" },
    paint: {
      "hillshade-exaggeration": 0.35,
      "hillshade-shadow-color": "rgba(0,0,0,0.35)",
      "hillshade-highlight-color": "rgba(255,255,255,0.15)",
      "hillshade-accent-color": "rgba(0,0,0,0.2)",
    },
  };
}

/** The contour layer in maplibre-contour's tiles, and its feature properties. */
export const CONTOUR_TILE = { layer: "contours", elevation: "ele", level: "level" } as const;

/** Light lines with labels on the majors ("2,600 ft"). Start hidden (prefs decide). */
export function contourLayers(): LayerSpecification[] {
  const major: ExpressionSpecification = ["==", ["get", CONTOUR_TILE.level], 1];
  return [
    {
      id: TERRAIN_LAYER.contourLines,
      type: "line",
      source: TERRAIN_SOURCE.contours,
      "source-layer": CONTOUR_TILE.layer,
      minzoom: CONTOURS_MIN_ZOOM,
      layout: { visibility: "none", "line-join": "round" },
      paint: {
        "line-color": "#f1f3ee",
        "line-opacity": ["case", major, 0.6, 0.4],
        "line-width": ["case", major, 1.1, 0.6],
      },
    },
    {
      id: TERRAIN_LAYER.contourLabels,
      type: "symbol",
      source: TERRAIN_SOURCE.contours,
      "source-layer": CONTOUR_TILE.layer,
      minzoom: CONTOURS_MIN_ZOOM,
      filter: major,
      layout: {
        visibility: "none",
        "symbol-placement": "line",
        "text-field": [
          "concat",
          ["number-format", ["get", CONTOUR_TILE.elevation], { locale: "en-US" }],
          " ft",
        ],
        "text-font": [LABEL_FONT],
        "text-size": 11,
        "symbol-spacing": 320,
      },
      paint: {
        "text-color": "#f1f3ee",
        "text-halo-color": "rgba(11,20,16,0.85)",
        "text-halo-width": 1.4,
      },
    },
  ];
}

/** Above the ridges when pitched: a pale sky fading into haze at the horizon, so it isn't black. */
export const SKY: SkySpecification = {
  "sky-color": "#a9c4dc",
  "horizon-color": "#dfe7ea",
  "fog-color": "#dfe7ea",
  "sky-horizon-blend": 0.6,
  "horizon-fog-blend": 0.6,
  "fog-ground-blend": 0.85,
  "atmosphere-blend": 0,
};
