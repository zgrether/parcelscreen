/**
 * Roads and labels over the aerials (step 17d; plan phase-0-17d-roads.md): OpenFreeMap's vector tiles
 * (OpenMapTiles schema), drawn as road lines by class with a light casing so they read over dark ortho,
 * tracks dashed, road names along the lines, and place names at low zoom. No background, water, landuse,
 * building or POI layers. Display only: nothing here reaches a screen or its settings.
 *
 * Stacking (plan §3): the lines go above the imagery, hillshade, dim scrim and the step-15a surface image,
 * under the soil fills and contours; the labels go at the top of the map's own layers, under the DOM markers.
 */
import type {
  ExpressionSpecification,
  FilterSpecification,
  LayerSpecification,
  VectorSourceSpecification,
} from "maplibre-gl";
import { LABEL_FONT } from "./terrainStyle";

/** The TileJSON, which names the current planet build (so a new build needs no change here). */
export const ROADS_TILEJSON = "https://tiles.openfreemap.org/planet";

/** The attribution (owner, 17d plan §7): all three credited. */
export const ROADS_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank">© OpenFreeMap</a> ' +
  '<a href="https://www.openmaptiles.org/" target="_blank">© OpenMapTiles</a> ' +
  '<a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap contributors</a>';

export const ROADS_SOURCE = "roads";

export const ROADS_LAYER = {
  casing: "roads-casing",
  track: "roads-track",
  line: "roads-line",
  names: "roads-names",
  places: "places",
} as const;

/** The road lines, under the soil fills (§3). */
export const ROAD_LINE_LAYERS = [ROADS_LAYER.casing, ROADS_LAYER.track, ROADS_LAYER.line] as const;
/** The labels, at the top of the map's own layers (§3). */
export const ROAD_LABEL_LAYERS = [ROADS_LAYER.names, ROADS_LAYER.places] as const;
export const ROAD_LAYERS = [...ROAD_LINE_LAYERS, ...ROAD_LABEL_LAYERS] as const;

/** OpenMapTiles `transportation` classes drawn (the owner's "highway" is motorway and trunk). */
export const ROAD_CLASSES = [
  "motorway",
  "trunk",
  "primary",
  "secondary",
  "tertiary",
  "minor",
  "service",
] as const;
export const TRACK_CLASS = "track";
/** Place classes named, each from its own zoom (owner, after the 17d plan): larger places sooner. */
export const PLACE_CLASSES = ["city", "town", "village", "hamlet"] as const;
export const PLACE_MIN_ZOOM: Record<(typeof PLACE_CLASSES)[number], number> = {
  city: 7,
  town: 9,
  village: 11,
  hamlet: 12,
};

/** Road names from z13; place names from z7 (cities) and all hidden from z15 (owner, §7). */
export const ROAD_NAMES_MIN_ZOOM = 13;
export const PLACES_MIN_ZOOM = 7;
export const PLACES_MAX_ZOOM = 15;

/** The basemaps the roads are drawn over: the aerials. Topo and Streets already draw roads (owner, §7). */
export const ROAD_BASEMAPS = ["state", "imagery", "esri"] as const;

export const roadsSource = (): VectorSourceSpecification => ({
  type: "vector",
  url: ROADS_TILEJSON,
  attribution: ROADS_ATTRIBUTION,
});

const cls: ExpressionSpecification = ["get", "class"];
const isLine: ExpressionSpecification = [
  "in",
  ["geometry-type"],
  ["literal", ["LineString", "MultiLineString"]],
];
const roadsFilter: FilterSpecification = ["all", isLine, ["in", cls, ["literal", [...ROAD_CLASSES]]]];
const trackFilter: FilterSpecification = ["all", isLine, ["==", cls, TRACK_CLASS]];
// A tunnel is drawn faint.
const tunnelFaded = (opacity: number): ExpressionSpecification => [
  "case",
  ["==", ["get", "brunnel"], "tunnel"],
  opacity * 0.4,
  opacity,
];

/** Line width by class, growing with zoom: [width at z10, width at z18]. */
const WIDTH: Record<(typeof ROAD_CLASSES)[number], [number, number]> = {
  motorway: [1.6, 9],
  trunk: [1.6, 9],
  primary: [1.4, 8],
  secondary: [1.2, 7],
  tertiary: [1, 6],
  minor: [0.6, 5],
  service: [0.4, 3],
};

const widthBy = (scale: number, add: number): ExpressionSpecification => {
  const at = (i: 0 | 1): ExpressionSpecification =>
    [
      "match",
      cls,
      ...ROAD_CLASSES.flatMap((c) => [c, WIDTH[c][i] * scale + add]),
      0,
    ] as unknown as ExpressionSpecification;
  return ["interpolate", ["exponential", 1.5], ["zoom"], 10, at(0), 18, at(1)];
};

/** Warm for the big roads, pale grey for the rest; the light casing carries them over dark imagery. */
const ROAD_COLOR: ExpressionSpecification = [
  "match",
  cls,
  ["motorway", "trunk"],
  "#f0b44c",
  "primary",
  "#f3c766",
  "secondary",
  "#f1dc9a",
  "#8c877b",
];

/** The road lines (casing, tracks, roads): placed under the soil fills. */
export function roadLineLayers(visible: boolean): LayerSpecification[] {
  const layout = { visibility: visible ? ("visible" as const) : ("none" as const) };
  return [
    {
      id: ROADS_LAYER.casing,
      type: "line",
      source: ROADS_SOURCE,
      "source-layer": "transportation",
      filter: roadsFilter,
      layout: { ...layout, "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#f4f2ec",
        "line-opacity": tunnelFaded(0.55),
        "line-width": widthBy(1, 2),
      },
    },
    {
      id: ROADS_LAYER.track,
      type: "line",
      source: ROADS_SOURCE,
      "source-layer": "transportation",
      filter: trackFilter,
      layout: { ...layout, "line-join": "round" },
      paint: {
        "line-color": "#f1e3c0",
        "line-opacity": tunnelFaded(0.9),
        "line-width": ["interpolate", ["linear"], ["zoom"], 12, 1, 18, 2.5],
        "line-dasharray": [2, 1.5],
      },
    },
    {
      id: ROADS_LAYER.line,
      type: "line",
      source: ROADS_SOURCE,
      "source-layer": "transportation",
      filter: roadsFilter,
      layout: { ...layout, "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ROAD_COLOR,
        "line-opacity": tunnelFaded(1),
        "line-width": widthBy(1, 0),
      },
    },
  ];
}

const halo = {
  "text-color": "#ffffff",
  "text-halo-color": "rgba(16, 22, 18, 0.92)",
  "text-halo-width": 1.5,
  "text-halo-blur": 0.3,
};

/** Road names and place names: at the top of the map's own layers. */
export function roadLabelLayers(visible: boolean): LayerSpecification[] {
  const visibility = visible ? ("visible" as const) : ("none" as const);
  return [
    {
      id: ROADS_LAYER.names,
      type: "symbol",
      source: ROADS_SOURCE,
      "source-layer": "transportation_name",
      minzoom: ROAD_NAMES_MIN_ZOOM,
      filter: ["in", cls, ["literal", [...ROAD_CLASSES, TRACK_CLASS]]],
      layout: {
        visibility,
        "symbol-placement": "line",
        "text-field": ["coalesce", ["get", "name:latin"], ["get", "name"], ["get", "ref"]],
        "text-font": [LABEL_FONT],
        "text-size": ["interpolate", ["linear"], ["zoom"], 13, 11, 17, 14],
        "text-letter-spacing": 0.02,
        "text-max-angle": 30,
      },
      paint: halo,
    },
    {
      id: ROADS_LAYER.places,
      type: "symbol",
      source: ROADS_SOURCE,
      "source-layer": "place",
      minzoom: PLACES_MIN_ZOOM,
      maxzoom: PLACES_MAX_ZOOM,
      // Each class from its own zoom: the filter sees the tile's zoom, so a class appears at its whole zoom.
      filter: [
        "any",
        ...PLACE_CLASSES.map((c): ExpressionSpecification => [
          "all",
          ["==", cls, c],
          [">=", ["zoom"], PLACE_MIN_ZOOM[c]],
        ]),
      ],
      layout: {
        visibility,
        "text-field": ["coalesce", ["get", "name:latin"], ["get", "name"]],
        "text-font": [LABEL_FONT],
        "text-size": ["match", cls, "city", 16, "town", 14, "village", 12.5, 11.5],
        // Bigger places win collisions.
        "symbol-sort-key": ["coalesce", ["get", "rank"], 99],
        "text-max-width": 8,
      },
      paint: halo,
    },
  ];
}
