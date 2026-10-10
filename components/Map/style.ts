/**
 * The map's style: every basemap, the light-pollution overlay, the dim scrim and the parcel lines, as
 * MapLibre sources and layers, in the prototype's stacking order (proto L500–560: basemap < light pollution
 * < scrim < parcel lines < result overlays). Basemaps are all present and toggled by visibility. Step 13g adds
 * the terrain preview: a hillshade over the basemaps and contours under the parcel lines (terrainStyle.ts).
 *
 * The prototype's "state ortho" basemap picked VA, NC or USGS imagery per tile from the tile's centre and
 * drew the parent tile, unscaled, past each service's native zoom (plan B2). Here it is three stacked sources
 * with `bounds` and `maxzoom`, so MapLibre overzooms each one correctly.
 */
import type {
  ExpressionSpecification,
  FilterSpecification,
  LayerSpecification,
  RasterSourceSpecification,
  SourceSpecification,
  StyleSpecification,
} from "maplibre-gl";
import { ROADS_SOURCE, roadLabelLayers, roadLineLayers, roadsSource } from "./roadsStyle";
import { contourLayers, GLYPHS, hillshadeLayer, terrainSources, type TerrainTiles } from "./terrainStyle";

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
    // The prototype's state boxes (orthoFor, proto L511) split at 36.54°, but the VA–NC line runs as far north as
    // ~36.59° (at Grayson County), so NC land in that strip got the USGS fallback: VBMP is transparent outside
    // Virginia. NC now runs to 36.6° under VA; VA's opaque tiles cover it wherever Virginia has imagery.
    ["base-state-nc", raster(NC_ORTHO, 20, "NC OneMap", { bounds: [-84.4, 33.8, -75.4, 36.6] })],
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
  savedFill: "saved-fill",
  savedLine: "saved-line",
  parcelHalo: "parcel-halo",
  parcelFill: "parcel-fill",
  parcelLine: "parcel-line",
  selFill: "sel-fill",
  selLine: "sel-line",
  leftFill: "left-fill",
  leftLine: "left-line",
  // Step 15b–c: the soil units (fills under the contours, outlines over the parcel lines), the horizon fan,
  // the driveway, then the circles (culverts, trailheads, the evaluation ring).
  soilFill: "soil-fill",
  soilHalo: "soil-halo",
  soilLine: "soil-line",
  fanHalo: "fan-halo",
  fanRay: "fan-ray",
  driveDirect: "drive-direct",
  driveHalo: "drive-halo",
  driveSecond: "drive-second",
  driveRoute: "drive-route",
  driveOver: "drive-over",
  driveOverStretch: "drive-over-stretch",
  culverts: "culverts",
  trailheads: "trailheads",
  evalRing: "eval-ring",
  // Tilted, the points stand up as flags on poles (map UX, 2026-10-10; flags.ts switches them with the pitch).
  trailheadFlags: "trailhead-flags",
  evalFlag: "eval-flag",
  splitFill: "split-fill",
  splitLine: "split-line",
  splitCut: "split-cut",
  combineFill: "combine-fill",
  combineLine: "combine-line",
  combineResult: "combine-result",
  draftLine: "draft-line",
  draftPoints: "draft-points",
} as const;

export const SOURCE = {
  parcelLines: "parcel-lines",
  saved: "saved",
  parcel: "parcel",
  sel: "sel",
  fan: "fan",
  evalRing: "eval-ring",
  soils: "soils",
  driveway: "driveway",
  trailheads: "trailheads",
  split: "split",
  combine: "combine",
  draft: "draft",
} as const;

const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };

/** The picked parcels while combining. */
export const COMBINE_COLOR = "#f0a030";
/** The selected parcel's soft amber fill (cleared while a step 15 surface shows over it). */
export const PARCEL_FILL_OPACITY = 0.16;
/** The selected parcel, and saved parcels (thinner, unfilled). */
export const SELECTED_COLOR = "#f0a030";

/** The whole style. Basemaps other than `base` start hidden; overlays start hidden. */
export function buildStyle(opts: {
  base: BasemapId;
  lpAtlasTiles: string;
  lpYear: number;
  /** The terrain preview's tiles (13g); without them the style has no terrain, hillshade or contours. */
  terrain?: TerrainTiles;
  /** Roads and labels over the aerials (17d), with their starting visibility; without it, none. */
  roads?: { visible: boolean };
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
  if (opts.terrain) {
    Object.assign(sources, terrainSources(opts.terrain));
    layers.push(hillshadeLayer());
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
  // The terrain image (15a, added at run time), then the road lines (17d) over it, then the soil fills (15c),
  // all under the contours: the soil fill is the proto's fill at 0.14 in the unit's colour (L1206).
  if (opts.roads) {
    sources[ROADS_SOURCE] = roadsSource();
    layers.push(...roadLineLayers(opts.roads.visible));
  }
  sources[SOURCE.soils] = { type: "geojson", data: EMPTY_FC };
  layers.push({
    id: LAYER.soilFill,
    type: "fill",
    source: SOURCE.soils,
    paint: { "fill-color": ["get", "color"], "fill-opacity": 0.14 },
  });
  if (opts.terrain) layers.push(...contourLayers());
  sources[SOURCE.parcelLines] = { type: "geojson", data: EMPTY_FC };
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
  // The soil units' outlines (15c; proto L1205–1206): a white halo under the unit's colour, dashed ("6 4" at
  // weight 2.5, in line widths). Over the parcel lines, under the parcel outline.
  layers.push(
    {
      id: LAYER.soilHalo,
      type: "line",
      source: SOURCE.soils,
      paint: { "line-color": "#ffffff", "line-width": 4, "line-opacity": 0.9 },
    },
    {
      id: LAYER.soilLine,
      type: "line",
      source: SOURCE.soils,
      paint: { "line-color": ["get", "color"], "line-width": 2.5, "line-dasharray": [2.4, 1.6] },
    },
  );
  // Saved (built) parcels that aren't open: a thin amber outline, no fill (13e). The nearly transparent fill
  // only catches taps; each feature carries its History key.
  sources[SOURCE.saved] = { type: "geojson", data: EMPTY_FC };
  layers.push(
    {
      id: LAYER.savedFill,
      type: "fill",
      source: SOURCE.saved,
      paint: { "fill-color": SELECTED_COLOR, "fill-opacity": 0.001 },
    },
    {
      id: LAYER.savedLine,
      type: "line",
      source: SOURCE.saved,
      paint: { "line-color": SELECTED_COLOR, "line-width": 1.5 },
    },
  );
  // The selected parcel, the strongest thing on the map (13e): bold amber over a dark halo, soft amber fill.
  // (The prototype drew it white over the halo, proto L690.)
  sources[SOURCE.parcel] = { type: "geojson", data: EMPTY_FC };
  layers.push(
    {
      id: LAYER.parcelHalo,
      type: "line",
      source: SOURCE.parcel,
      paint: { "line-color": "#0b1410", "line-width": 6, "line-opacity": 0.6 },
    },
    {
      id: LAYER.parcelFill,
      type: "fill",
      source: SOURCE.parcel,
      paint: { "fill-color": SELECTED_COLOR, "fill-opacity": PARCEL_FILL_OPACITY },
    },
    {
      id: LAYER.parcelLine,
      type: "line",
      source: SOURCE.parcel,
      paint: { "line-color": SELECTED_COLOR, "line-width": 3 },
    },
  );
  // The layer selected in the Info panel (13e-4): white over the amber parcel; the piece a split leaves out,
  // faint and dashed (plan 13e §4, "How parcels look on the map").
  sources[SOURCE.sel] = { type: "geojson", data: EMPTY_FC };
  const selKind = (k: string): FilterSpecification => ["==", ["get", "kind"], k];
  layers.push(
    {
      id: LAYER.selFill,
      type: "fill",
      source: SOURCE.sel,
      filter: selKind("sel"),
      paint: { "fill-color": "#ffffff", "fill-opacity": 0.16 },
    },
    {
      id: LAYER.selLine,
      type: "line",
      source: SOURCE.sel,
      filter: selKind("sel"),
      paint: { "line-color": "#ffffff", "line-width": 2.5 },
    },
    {
      id: LAYER.leftFill,
      type: "fill",
      source: SOURCE.sel,
      filter: selKind("left"),
      paint: { "fill-color": "#ffffff", "fill-opacity": 0.05 },
    },
    {
      id: LAYER.leftLine,
      type: "line",
      source: SOURCE.sel,
      filter: selKind("left"),
      paint: { "line-color": "#ffffff", "line-width": 1.5, "line-dasharray": [3, 2] },
    },
  );
  // Step 15b: the horizon fan over the parcel outline (proto drawHorizon, L1236–1242): a dark halo under
  // each ray, red where the ridge blocks the December sun, white where it clears. Then the evaluation ring
  // (L1240), lying flat on the ground when the map is tilted. Empty until a result is shown.
  sources[SOURCE.fan] = { type: "geojson", data: EMPTY_FC };
  sources[SOURCE.driveway] = { type: "geojson", data: EMPTY_FC };
  sources[SOURCE.trailheads] = { type: "geojson", data: EMPTY_FC };
  sources[SOURCE.evalRing] = { type: "geojson", data: EMPTY_FC };
  const blocks: ExpressionSpecification = ["get", "blocks"];
  layers.push(
    {
      id: LAYER.fanHalo,
      type: "line",
      source: SOURCE.fan,
      paint: { "line-color": "#0b1410", "line-width": ["case", blocks, 4, 2.5], "line-opacity": 0.5 },
    },
    {
      id: LAYER.fanRay,
      type: "line",
      source: SOURCE.fan,
      paint: {
        "line-color": ["case", blocks, "#e0553f", "#f2efe6"],
        "line-width": ["case", blocks, 2.5, 1],
        "line-opacity": ["case", blocks, 0.95, 0.7],
      },
    },
    // The driveway (15c; proto drawDriveway, L1405–1407): the direct 4×4 track (red, dotted) under the
    // routes; the routes over a dark halo, the recommended one (i = 0) yellow on top of the second (grey,
    // dashed). Dashes are in line widths: "2 5" at weight 2, "6 4" at weight 1.5.
    {
      id: LAYER.driveDirect,
      type: "line",
      source: SOURCE.driveway,
      filter: ["==", ["get", "kind"], "direct"],
      paint: { "line-color": "#b04a4a", "line-width": 2, "line-opacity": 0.9, "line-dasharray": [1, 2.5] },
    },
    {
      id: LAYER.driveHalo,
      type: "line",
      source: SOURCE.driveway,
      filter: ["in", ["get", "kind"], ["literal", ["route", "over"]]],
      layout: { "line-sort-key": ["-", 0, ["get", "i"]] },
      paint: {
        "line-color": "#0b1410",
        "line-width": ["case", ["==", ["get", "i"], 0], 5, 3],
        "line-opacity": 0.6,
      },
    },
    {
      id: LAYER.driveSecond,
      type: "line",
      source: SOURCE.driveway,
      filter: ["all", ["==", ["get", "kind"], "route"], [">", ["get", "i"], 0]],
      paint: { "line-color": "#9aa59d", "line-width": 1.5, "line-dasharray": [4, 8 / 3] },
    },
    {
      id: LAYER.driveRoute,
      type: "line",
      source: SOURCE.driveway,
      filter: ["all", ["==", ["get", "kind"], "route"], ["==", ["get", "i"], 0]],
      paint: { "line-color": "#e0c43c", "line-width": 3 },
    },
    // No route fits the grade limit: the least-steep one, suspect (owner, after 15c): orange, dashed, over a
    // dark halo, with its stretches over the limit in red on top.
    {
      id: LAYER.driveOver,
      type: "line",
      source: SOURCE.driveway,
      filter: ["==", ["get", "kind"], "over"],
      paint: { "line-color": "#f0a030", "line-width": 3, "line-dasharray": [2, 1.2] },
    },
    {
      id: LAYER.driveOverStretch,
      type: "line",
      source: SOURCE.driveway,
      filter: ["==", ["get", "kind"], "overStretch"],
      paint: { "line-color": "#e0553f", "line-width": 4 },
    },
    // The circles: culverts (L1407) and trailheads (L1129), lying flat when the map is tilted.
    {
      id: LAYER.culverts,
      type: "circle",
      source: SOURCE.driveway,
      filter: ["==", ["get", "kind"], "culvert"],
      paint: {
        "circle-radius": 4,
        "circle-color": "#2b6f8f",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1,
        "circle-pitch-alignment": "map",
      },
    },
    {
      id: LAYER.trailheads,
      type: "circle",
      source: SOURCE.trailheads,
      paint: {
        "circle-radius": 5,
        "circle-color": "#2f7a46",
        "circle-opacity": 0.9,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1,
        "circle-pitch-alignment": "map",
      },
    },
    {
      id: LAYER.evalRing,
      type: "circle",
      source: SOURCE.evalRing,
      paint: {
        "circle-radius": 9,
        "circle-color": "#0b1410",
        "circle-opacity": 0.35,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
        "circle-pitch-alignment": "map",
      },
    },
    // The same points as flags on poles when the map is tilted: anchored at the foot of the pole, facing the viewer,
    // never hidden by labels. Off until flags.ts sees the pitch pass FLAG_PITCH.
    flagLayer(LAYER.trailheadFlags, SOURCE.trailheads, "flag-trailhead"),
    flagLayer(LAYER.evalFlag, SOURCE.evalRing, "flag-eval"),
  );
  // The split pieces, coloured per piece, and the dashed cut line (proto L612–615).
  sources[SOURCE.split] = { type: "geojson", data: EMPTY_FC };
  const isPolygon: FilterSpecification = ["==", ["geometry-type"], "Polygon"];
  const isLine: FilterSpecification = ["==", ["geometry-type"], "LineString"];
  layers.push(
    {
      id: LAYER.splitFill,
      type: "fill",
      source: SOURCE.split,
      filter: isPolygon,
      paint: { "fill-color": ["get", "color"], "fill-opacity": 0.12 },
    },
    {
      id: LAYER.splitLine,
      type: "line",
      source: SOURCE.split,
      filter: isPolygon,
      paint: { "line-color": ["get", "color"], "line-width": 2 },
    },
    {
      id: LAYER.splitCut,
      type: "line",
      source: SOURCE.split,
      filter: isLine,
      // Dashes are in line widths: Leaflet's "6 4" at weight 3.
      paint: { "line-color": "#ffffff", "line-width": 3, "line-dasharray": [2, 4 / 3] },
    },
  );
  // Combining (step 13b): the picked parcels in amber, and the combined outline dashed white.
  sources[SOURCE.combine] = { type: "geojson", data: EMPTY_FC };
  const kind = (k: string): FilterSpecification => ["==", ["get", "kind"], k];
  layers.push(
    {
      id: LAYER.combineFill,
      type: "fill",
      source: SOURCE.combine,
      filter: kind("member"),
      paint: { "fill-color": COMBINE_COLOR, "fill-opacity": 0.2 },
    },
    {
      id: LAYER.combineLine,
      type: "line",
      source: SOURCE.combine,
      filter: kind("member"),
      paint: { "line-color": COMBINE_COLOR, "line-width": 2 },
    },
    {
      id: LAYER.combineResult,
      type: "line",
      source: SOURCE.combine,
      filter: kind("result"),
      paint: { "line-color": "#ffffff", "line-width": 2, "line-dasharray": [2, 2] },
    },
  );
  // The boundary being drawn (proto L582–587).
  sources[SOURCE.draft] = { type: "geojson", data: EMPTY_FC };
  layers.push(
    {
      id: LAYER.draftLine,
      type: "line",
      source: SOURCE.draft,
      filter: isLine,
      paint: { "line-color": "#ffffff", "line-width": 2, "line-dasharray": [2, 2] },
    },
    {
      id: LAYER.draftPoints,
      type: "circle",
      source: SOURCE.draft,
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": ["get", "r"],
        "circle-color": ["get", "fill"],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    },
  );
  // The road and place names go at the top of the map's own layers, under the DOM markers (17d §3).
  if (opts.roads) layers.push(...roadLabelLayers(opts.roads.visible));
  return { version: 8, ...(opts.terrain || opts.roads ? { glyphs: GLYPHS } : {}), sources, layers };
}

/** A point source drawn as flags on poles (map UX, 2026-10-10): hidden until the map is tilted (flags.ts). */
function flagLayer(id: string, source: string, image: string): LayerSpecification {
  return {
    id,
    type: "symbol",
    source,
    layout: {
      visibility: "none",
      "icon-image": image,
      "icon-anchor": "bottom",
      "icon-pitch-alignment": "viewport",
      "icon-rotation-alignment": "viewport",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  };
}
