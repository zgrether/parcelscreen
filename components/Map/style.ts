/**
 * The map's style: every basemap, the light-pollution overlay, the dim scrim and the parcel lines, as
 * MapLibre sources and layers, in the prototype's stacking order (proto L500–560: basemap < light pollution
 * < scrim < parcel lines < result overlays). Basemaps are all present and toggled by visibility.
 *
 * The prototype's "state ortho" basemap picked VA, NC or USGS imagery per tile from the tile's centre and
 * drew the parent tile, unscaled, past each service's native zoom (plan B2). Here it is three stacked sources
 * with `bounds` and `maxzoom`, so MapLibre overzooms each one correctly.
 */
import type {
  LayerSpecification,
  RasterSourceSpecification,
  SourceSpecification,
  StyleSpecification,
} from "maplibre-gl";

export type BasemapId = "state" | "imagery" | "esri" | "topo" | "streets";

/** The basemap menu, labels verbatim from the prototype. */
export const BASEMAPS: { id: BasemapId; label: string }[] = [
  { id: "state", label: "Aerial (state ortho: VA 1 ft / NC 6 in)" },
  { id: "imagery", label: "Aerial (USGS)" },
  { id: "esri", label: "Aerial (Esri)" },
  { id: "topo", label: "Topo (USGS)" },
  { id: "streets", label: "Streets (Esri)" },
];

export const isBasemapId = (v: string): v is BasemapId => BASEMAPS.some((b) => b.id === v);

const USGS_IMAGERY =
  "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}";
const USGS_TOPO = "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}";
const ESRI_IMAGERY =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_STREETS =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";
/** Virginia's statewide orthophoto, an export-by-bbox service. The prototype's host (gismaps.vdem…) no longer
 * resolves; the same service is on vginmaps.vdem…, which also serves the parcels. PNG with transparency, so
 * NC shows through where a border tile has no VA imagery (the prototype asked for JPEG, one service per tile). */
const VA_ORTHO =
  "https://vginmaps.vdem.virginia.gov/arcgis/rest/services/VBMP_Imagery/MostRecentImagery_WGS/MapServer/export" +
  "?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=png32&transparent=true&f=image";
const NC_ORTHO =
  "https://services.nconemap.gov/secure/rest/services/Imagery/Orthoimagery_Latest_cached/ImageServer/tile/{z}/{y}/{x}";

const raster = (
  tiles: string,
  maxzoom: number,
  attribution: string,
  extra: Partial<RasterSourceSpecification> = {},
): RasterSourceSpecification => ({
  type: "raster",
  tiles: [tiles],
  tileSize: 256,
  maxzoom,
  attribution,
  ...extra,
});

/** Each basemap is one or more raster sources, drawn bottom to top. */
const BASEMAP_SOURCES: Record<BasemapId, [string, RasterSourceSpecification][]> = {
  state: [
    ["base-state-usgs", raster(USGS_IMAGERY, 16, "USGS")],
    // The prototype's state boxes (orthoFor, proto L511): NC south of 36.54°, VA from there north.
    ["base-state-nc", raster(NC_ORTHO, 20, "NC OneMap", { bounds: [-84.4, 33.8, -75.4, 36.54] })],
    ["base-state-va", raster(VA_ORTHO, 19, "VGIN VBMP", { bounds: [-83.7, 36.54, -75.2, 39.5] })],
  ],
  imagery: [["base-imagery", raster(USGS_IMAGERY, 16, "USGS")]],
  esri: [["base-esri", raster(ESRI_IMAGERY, 19, "Esri, Maxar, Earthstar Geographics")]],
  topo: [["base-topo", raster(USGS_TOPO, 16, "USGS")]],
  streets: [["base-streets", raster(ESRI_STREETS, 19, "Esri, © OpenStreetMap contributors")]],
};

/** Layer ids belonging to a basemap (to toggle their visibility). */
export const basemapLayerIds = (id: BasemapId): string[] => BASEMAP_SOURCES[id].map(([sourceId]) => sourceId);

/** The Lorenz atlas image tiles: 1024 px, so MapLibre asks for zoom − 2 (the prototype's zoomOffset −2). */
export const lightPollutionTiles = (lpAtlasTiles: string, year: number): string =>
  `${lpAtlasTiles}/tiles${year}/tile_{z}_{x}_{y}.png`;

export const LAYER = {
  lightPollution: "light-pollution",
  scrim: "scrim",
  parcelLinesFill: "parcel-lines-fill",
  parcelLines: "parcel-lines",
} as const;

export const SOURCE = { parcelLines: "parcel-lines" } as const;

/** The whole style. Basemaps other than `base` start hidden; overlays start hidden. */
export function buildStyle(opts: {
  base: BasemapId;
  lpAtlasTiles: string;
  lpYear: number;
}): StyleSpecification {
  const sources: Record<string, SourceSpecification> = {};
  const layers: LayerSpecification[] = [];
  for (const id of Object.keys(BASEMAP_SOURCES) as BasemapId[])
    for (const [sourceId, source] of BASEMAP_SOURCES[id]) {
      sources[sourceId] = source;
      layers.push({
        id: sourceId,
        type: "raster",
        source: sourceId,
        layout: { visibility: id === opts.base ? "visible" : "none" },
      });
    }
  sources[LAYER.lightPollution] = {
    type: "raster",
    tiles: [lightPollutionTiles(opts.lpAtlasTiles, opts.lpYear)],
    tileSize: 1024,
    minzoom: 0,
    maxzoom: 8,
    attribution: "Light Pollution Atlas (D. Lorenz)",
  };
  layers.push({
    id: LAYER.lightPollution,
    type: "raster",
    source: LAYER.lightPollution,
    layout: { visibility: "none" },
    paint: { "raster-opacity": 0.55 },
  });
  sources[LAYER.scrim] = {
    type: "geojson",
    data: {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-179, -85],
            [179, -85],
            [179, 85],
            [-179, 85],
            [-179, -85],
          ],
        ],
      },
    },
  };
  layers.push({
    id: LAYER.scrim,
    type: "fill",
    source: LAYER.scrim,
    layout: { visibility: "none" },
    paint: { "fill-color": "#0b1410", "fill-opacity": 0.38 },
  });
  sources[SOURCE.parcelLines] = { type: "geojson", data: { type: "FeatureCollection", features: [] } };
  layers.push(
    // Nearly transparent fill so a tap anywhere inside an outline hits it (step 13 selects on tap).
    {
      id: LAYER.parcelLinesFill,
      type: "fill",
      source: SOURCE.parcelLines,
      paint: { "fill-color": "#f6e7a1", "fill-opacity": 0.001 },
    },
    {
      id: LAYER.parcelLines,
      type: "line",
      source: SOURCE.parcelLines,
      paint: { "line-color": "#f6e7a1", "line-width": 1.2, "line-opacity": 0.85 },
    },
  );
  return { version: 8, sources, layers };
}
