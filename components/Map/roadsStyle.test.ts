import { describe, expect, it } from "vitest";
import type { LayerSpecification, LineLayerSpecification, SymbolLayerSpecification } from "maplibre-gl";
import {
  PLACES_MAX_ZOOM,
  PLACE_MIN_ZOOM,
  PLACES_MIN_ZOOM,
  ROAD_CLASSES,
  ROAD_LABEL_LAYERS,
  ROAD_LINE_LAYERS,
  ROAD_NAMES_MIN_ZOOM,
  ROADS_ATTRIBUTION,
  ROADS_LAYER,
  ROADS_SOURCE,
  ROADS_TILEJSON,
  roadLabelLayers,
  roadLineLayers,
} from "./roadsStyle";
import { buildStyle, LAYER } from "./style";
import { GLYPHS } from "./terrainStyle";
import { roadsAvailable } from "./useMapLayerPrefs";

const STYLE = { base: "state" as const, lpAtlasTiles: "https://lp.example", lpYear: 2025 };
const byId = (layers: LayerSpecification[], id: string) => layers.find((l) => l.id === id)!;

describe("roads and labels (17d)", () => {
  it("draws the owner's road classes, highway as motorway and trunk, and tracks on their own dashed layer", () => {
    expect([...ROAD_CLASSES]).toEqual([
      "motorway",
      "trunk",
      "primary",
      "secondary",
      "tertiary",
      "minor",
      "service",
    ]);
    const layers = roadLineLayers(true);
    const line = byId(layers, ROADS_LAYER.line) as LineLayerSpecification;
    const track = byId(layers, ROADS_LAYER.track) as LineLayerSpecification;
    expect(JSON.stringify(line.filter)).toContain('"motorway"');
    expect(JSON.stringify(line.filter)).not.toContain('"track"');
    expect(JSON.stringify(line.filter)).not.toMatch(/"path"|"rail"|"ferry"/);
    expect(JSON.stringify(track.filter)).toContain('"track"');
    expect(track.paint?.["line-dasharray"]).toBeDefined();
    expect(line.paint?.["line-dasharray"]).toBeUndefined();
    // Only line, casing and symbol layers: no background, water, landuse or building fills.
    expect([...roadLineLayers(true), ...roadLabelLayers(true)].map((l) => l.type).sort()).toEqual([
      "line",
      "line",
      "line",
      "symbol",
      "symbol",
    ]);
  });

  it("names roads from z13, and places staggered by class from z7, all hidden from z15", () => {
    const [names, places] = roadLabelLayers(true) as SymbolLayerSpecification[];
    expect(names!.minzoom).toBe(ROAD_NAMES_MIN_ZOOM);
    expect(ROAD_NAMES_MIN_ZOOM).toBe(13);
    expect([places!.minzoom, places!.maxzoom]).toEqual([PLACES_MIN_ZOOM, PLACES_MAX_ZOOM]);
    expect([PLACES_MIN_ZOOM, PLACES_MAX_ZOOM]).toEqual([7, 15]);
    expect(PLACE_MIN_ZOOM).toEqual({ city: 7, town: 9, village: 11, hamlet: 12 });
    const filter = JSON.stringify(places!.filter);
    for (const [c, z] of Object.entries(PLACE_MIN_ZOOM))
      expect(filter).toContain(`["==",["get","class"],"${c}"],[">=",["zoom"],${z}]`);
    // Larger classes get larger text.
    const size = places!.layout?.["text-size"] as unknown[];
    expect([size[3], size[5], size[7], size[8]]).toEqual([16, 14, 12.5, 11.5]);
    for (const l of [names!, places!]) {
      expect(l.layout?.["text-font"]).toEqual(["Noto Sans Regular"]);
      expect(l.paint?.["text-halo-width"]).toBeGreaterThan(0);
    }
  });

  it("stacks the lines above the dim scrim (and the 15a image's slot) under the soil fills, and the labels last", () => {
    const style = buildStyle({ ...STYLE, roads: { visible: true } });
    const ids = style.layers.map((l) => l.id);
    expect(ids.slice(ids.indexOf(LAYER.scrim) + 1, ids.indexOf(LAYER.soilFill))).toEqual([
      ...ROAD_LINE_LAYERS,
    ]);
    expect(ids.slice(-ROAD_LABEL_LAYERS.length)).toEqual([...ROAD_LABEL_LAYERS]);
    expect(ids.indexOf(ROADS_LAYER.names)).toBeGreaterThan(ids.indexOf(LAYER.parcelLines));
    expect(style.sources[ROADS_SOURCE]).toEqual({
      type: "vector",
      url: ROADS_TILEJSON,
      attribution: ROADS_ATTRIBUTION,
    });
    expect(style.glyphs).toBe(GLYPHS);
  });

  it("credits OpenFreeMap, OpenMapTiles and OpenStreetMap", () => {
    expect(ROADS_ATTRIBUTION.replace(/<[^>]+>/g, "")).toBe(
      "© OpenFreeMap © OpenMapTiles © OpenStreetMap contributors",
    );
  });

  it("starts hidden when switched off, and is absent without the option", () => {
    const off = buildStyle({ ...STYLE, roads: { visible: false } });
    for (const l of off.layers.filter((l) => l.id.startsWith("roads") || l.id === ROADS_LAYER.places))
      expect(l.layout?.visibility).toBe("none");
    const none = buildStyle(STYLE);
    expect(none.sources[ROADS_SOURCE]).toBeUndefined();
    expect(none.glyphs).toBeUndefined();
  });

  it("is for the aerials only: Topo and Streets draw their own roads", () => {
    expect(["state", "imagery", "esri", "topo", "streets"].map((b) => roadsAvailable(b as never))).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
  });
});
