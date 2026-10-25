/**
 * Lidar terrain (roadmap step 14c, `docs/plans/step-14c-lidar-terrain.md`): USGS 3DEP's elevation image service, drawn
 * server-side by its own exportImage, one tile's box at a time. Two styles: Shaded relief (the service's
 * multidirectional hillshade) and Slope (its slope in degrees, classed and coloured by the app's own slope bands, so
 * the map, the surface image and the legend agree). Pure style data; LidarLayer.tsx shows and hides it.
 */
import type { LayerSpecification, RasterSourceSpecification } from "maplibre-gl";
import { SLOPE_BANDS } from "@/lib/render/surface";

export const LIDAR_SERVICE =
  "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage";
export const LIDAR_ATTRIBUTION = "Terrain: USGS 3D Elevation Program (lidar)";
/** The layer's line in Map layers: what it is, then whose. */
export const LIDAR_INFO = `1 m lidar where available. ${LIDAR_ATTRIBUTION}`;
export const LIDAR_HINT = "Zoom in to see lidar terrain";
export const LIDAR_FAILED = "Lidar terrain tiles didn't load";

/** Shown from this zoom up: a coarser tile is a blur of the 10 m preview's hillshade. */
export const LIDAR_MIN_ZOOM = 13;
/** The deepest zoom asked for; MapLibre overzooms past it (a z18 tile is already finer than 1 m). */
export const LIDAR_MAX_ZOOM = 18;
export const LIDAR_TILE_PX = 256;

export type LidarStyle = "relief" | "slope";
export const LIDAR_STYLES: readonly { id: LidarStyle; label: string }[] = [
  { id: "relief", label: "Shaded relief" },
  { id: "slope", label: "Slope" },
];
/** The opacity slider's range and start, as fractions. */
export const LIDAR_OPACITY = { min: 0.2, max: 1, start: 0.6 } as const;

export const LIDAR_SOURCE: Record<LidarStyle, string> = { relief: "lidar-relief", slope: "lidar-slope" };
export const LIDAR_LAYER = LIDAR_SOURCE;

/** A grade (rise over run) as degrees, to two places: the slope function's unit. */
export const gradeDegrees = (g: number): number => Math.round(((Math.atan(g) * 180) / Math.PI) * 100) / 100;

/** The slope bands' upper edges in degrees, gentle to steep (8.53, 14.04, 21.8). */
export const slopeBreaks = (): number[] =>
  SLOPE_BANDS.filter((b) => Number.isFinite(b.upTo)).map((b) => gradeDegrees(b.upTo));

/** ArcGIS raster functions: the service's own, then classed and coloured by the app's bands for Slope. */
export function renderingRule(style: LidarStyle): object {
  if (style === "relief") return { rasterFunction: "Hillshade Multidirectional" };
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

/** The tile URL template: MapLibre fills in each tile's box in Web Mercator. */
export function lidarTiles(style: LidarStyle): string {
  const q = new URLSearchParams({
    bbox: "BBOX",
    bboxSR: "3857",
    imageSR: "3857",
    size: `${LIDAR_TILE_PX},${LIDAR_TILE_PX}`,
    format: "png",
    transparent: "true",
    renderingRule: JSON.stringify(renderingRule(style)),
    f: "image",
  });
  // The placeholder stays literal: URLSearchParams would escape MapLibre's braces.
  return `${LIDAR_SERVICE}?${q.toString().replace("bbox=BBOX", "bbox={bbox-epsg-3857}")}`;
}

/** One source per style: MapLibre loads only the visible one's tiles. */
export function lidarSources(): Record<string, RasterSourceSpecification> {
  return Object.fromEntries(
    LIDAR_STYLES.map(({ id }) => [
      LIDAR_SOURCE[id],
      {
        type: "raster",
        tiles: [lidarTiles(id)],
        tileSize: LIDAR_TILE_PX,
        minzoom: LIDAR_MIN_ZOOM,
        maxzoom: LIDAR_MAX_ZOOM,
        attribution: LIDAR_ATTRIBUTION,
      } satisfies RasterSourceSpecification,
    ]),
  );
}

/** The two layers, hidden until Map layers shows one. */
export function lidarLayers(): LayerSpecification[] {
  return LIDAR_STYLES.map(({ id }) => ({
    id: LIDAR_LAYER[id],
    type: "raster",
    source: LIDAR_SOURCE[id],
    minzoom: LIDAR_MIN_ZOOM,
    layout: { visibility: "none" },
    paint: { "raster-opacity": LIDAR_OPACITY.start, "raster-fade-duration": 150 },
  }));
}
