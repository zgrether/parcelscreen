/**
 * Lidar terrain (roadmap step 14c, `docs/plans/step-14c-lidar-terrain.md`). Two styles:
 * - Shaded relief: Mapterhorn's elevation tiles (USGS 3DEP's 1 m lidar where it exists, Terrarium-encoded), shaded by
 *   MapLibre's own multidirectional hillshade (owner, 2026-10-25: a screen in 1–3 s, against 22–37 s for USGS's
 *   exportImage, with no key, and its tiles may be cached).
 * - Slope: USGS 3DEP's exportImage, its slope in degrees classed and coloured by the app's own slope bands, so the map,
 *   the surface image and the legend agree. MapLibre has no slope layer to draw it from the same tiles.
 * Pure style data; LidarLayer.tsx shows and hides it.
 */
import type {
  LayerSpecification,
  RasterDEMSourceSpecification,
  RasterSourceSpecification,
} from "maplibre-gl";
import { SLOPE_BANDS } from "@/lib/render/surface";

export const RELIEF_TILES = "https://tiles.mapterhorn.com/{z}/{x}/{y}.webp";
export const RELIEF_TILE_PX = 512;
/** Mapterhorn's deepest zoom over lidar: a 512 px tile at 16 is about 1 m a pixel here, so MapLibre overzooms past it. */
export const RELIEF_MAX_ZOOM = 16;
export const RELIEF_ATTRIBUTION = '<a href="https://mapterhorn.com/attribution">© Mapterhorn</a>';

export const LIDAR_SERVICE =
  "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage";
export const LIDAR_ATTRIBUTION = "Terrain: USGS 3D Elevation Program (lidar)";
/** The deepest zoom Slope asks for; MapLibre overzooms past it (a z18 tile is already finer than 1 m). */
export const LIDAR_MAX_ZOOM = 18;
export const LIDAR_TILE_PX = 256;

export const LIDAR_HINT = "Zoom in to see lidar terrain";
export const LIDAR_FAILED = "Lidar terrain tiles didn't load";

/** Shown from this zoom up: a coarser tile is a blur of the 10 m preview's hillshade. */
export const LIDAR_MIN_ZOOM = 13;

export type LidarStyle = "relief" | "slope";
export const LIDAR_STYLES: readonly { id: LidarStyle; label: string }[] = [
  { id: "relief", label: "Shaded relief" },
  { id: "slope", label: "Slope" },
];
/** The style's line in Map layers: what it is, then whose. */
export const LIDAR_INFO: Record<LidarStyle, string> = {
  relief: "1 m lidar where available. Elevation: © Mapterhorn, from USGS 3DEP lidar",
  slope: `1 m lidar where available. ${LIDAR_ATTRIBUTION}`,
};
/** The opacity slider's range and start, as fractions. */
export const LIDAR_OPACITY = { min: 0.2, max: 1, start: 0.6 } as const;

export const LIDAR_SOURCE: Record<LidarStyle, string> = { relief: "lidar-relief", slope: "lidar-slope" };
export const LIDAR_LAYER = LIDAR_SOURCE;

/** A grade (rise over run) as degrees, to two places: the slope function's unit. */
export const gradeDegrees = (g: number): number => Math.round(((Math.atan(g) * 180) / Math.PI) * 100) / 100;

/** The slope bands' upper edges in degrees, gentle to steep (8.53, 14.04, 21.8). */
export const slopeBreaks = (): number[] =>
  SLOPE_BANDS.filter((b) => Number.isFinite(b.upTo)).map((b) => gradeDegrees(b.upTo));

/** Slope's ArcGIS raster functions: the service's slope in degrees, classed and coloured by the app's bands. */
export function slopeRule(): object {
  const edges = [0, ...slopeBreaks(), 90];
  return {
    rasterFunction: "Colormap",
    rasterFunctionArguments: {
      Colormap: SLOPE_BANDS.map((b, i) => [i + 1, b.rgba[0], b.rgba[1], b.rgba[2]]),
      Raster: {
        rasterFunction: "Remap",
        rasterFunctionArguments: {
          InputRanges: edges.slice(0, -1).flatMap((low, i) => [low, edges[i + 1]!]),
          OutputValues: SLOPE_BANDS.map((_, i) => i + 1),
          Raster: { rasterFunction: "Slope Degrees" },
        },
        outputPixelType: "U8",
      },
    },
  };
}

/** Slope's tile URL template: MapLibre fills in each tile's box in Web Mercator. */
export function slopeTiles(): string {
  const q = new URLSearchParams({
    bbox: "BBOX",
    bboxSR: "3857",
    imageSR: "3857",
    size: `${LIDAR_TILE_PX},${LIDAR_TILE_PX}`,
    format: "png",
    transparent: "true",
    renderingRule: JSON.stringify(slopeRule()),
    f: "image",
  });
  // The placeholder stays literal: URLSearchParams would escape MapLibre's braces.
  return `${LIDAR_SERVICE}?${q.toString().replace("bbox=BBOX", "bbox={bbox-epsg-3857}")}`;
}

/** One source per style: MapLibre loads only the visible one's tiles. */
export function lidarSources(): Record<string, RasterDEMSourceSpecification | RasterSourceSpecification> {
  return {
    [LIDAR_SOURCE.relief]: {
      type: "raster-dem",
      tiles: [RELIEF_TILES],
      tileSize: RELIEF_TILE_PX,
      encoding: "terrarium",
      minzoom: LIDAR_MIN_ZOOM,
      maxzoom: RELIEF_MAX_ZOOM,
      attribution: RELIEF_ATTRIBUTION,
    },
    [LIDAR_SOURCE.slope]: {
      type: "raster",
      tiles: [slopeTiles()],
      tileSize: LIDAR_TILE_PX,
      minzoom: LIDAR_MIN_ZOOM,
      maxzoom: LIDAR_MAX_ZOOM,
      attribution: LIDAR_ATTRIBUTION,
    },
  };
}

/**
 * The paint that sets a style's opacity. A hillshade layer has no opacity of its own, so Shaded relief's shadow and
 * highlight carry it as their alpha.
 */
export function lidarOpacityPaint(style: LidarStyle, opacity: number): Record<string, string | number> {
  if (style === "slope") return { "raster-opacity": opacity };
  return {
    "hillshade-shadow-color": `rgba(0,0,0,${opacity})`,
    "hillshade-highlight-color": `rgba(255,255,255,${opacity})`,
  };
}

/** The two layers, hidden until Map layers shows one. */
export function lidarLayers(): LayerSpecification[] {
  return [
    {
      id: LIDAR_LAYER.relief,
      type: "hillshade",
      source: LIDAR_SOURCE.relief,
      minzoom: LIDAR_MIN_ZOOM,
      layout: { visibility: "none" },
      paint: {
        "hillshade-method": "multidirectional",
        "hillshade-exaggeration": 1,
        ...lidarOpacityPaint("relief", LIDAR_OPACITY.start),
      },
    },
    {
      id: LIDAR_LAYER.slope,
      type: "raster",
      source: LIDAR_SOURCE.slope,
      minzoom: LIDAR_MIN_ZOOM,
      layout: { visibility: "none" },
      paint: { "raster-fade-duration": 150, ...lidarOpacityPaint("slope", LIDAR_OPACITY.start) },
    },
  ];
}
