import { describe, expect, it } from "vitest";
import type { LayerSpecification } from "maplibre-gl";
import { BASEMAPS, basemapLayerIds, buildStyle, LAYER } from "./style";
import {
  CONTOUR_THRESHOLDS,
  CONTOURS_MIN_ZOOM,
  FEET_PER_M,
  GLYPHS,
  TERRAIN_LAYER,
  TERRAIN_SOURCE,
  TERRARIUM_MAXZOOM,
} from "./terrainStyle";

const opts = { base: "state" as const, lpAtlasTiles: "https://x/atlas", lpYear: 2025 };
const tiles = { dem: "dem://{z}/{x}/{y}", contours: "contours://{z}/{x}/{y}?multiplier=3.28084" };

describe("terrain preview style (13g)", () => {
  const style = buildStyle({ ...opts, terrain: tiles });
  const ids = style.layers.map((l) => l.id);
  const at = (id: string) => ids.indexOf(id);
  const layer = (id: string) => style.layers.find((l) => l.id === id)!;

  it("puts the hillshade over the basemaps and under the light pollution", () => {
    const lastBase = Math.max(...BASEMAPS.flatMap((b) => basemapLayerIds(b.id)).map(at));
    expect(at(TERRAIN_LAYER.hillshade)).toBe(lastBase + 1);
    expect(at(TERRAIN_LAYER.hillshade)).toBeLessThan(at(LAYER.lightPollution));
  });

  it("puts the contours over the scrim and under the parcel lines (step 15's image and soil fills go between)", () => {
    expect(at(LAYER.scrim)).toBeLessThan(at(TERRAIN_LAYER.contourLines));
    expect(at(TERRAIN_LAYER.contourLines)).toBeLessThan(at(TERRAIN_LAYER.contourLabels));
    expect(at(TERRAIN_LAYER.contourLabels)).toBeLessThan(at(LAYER.parcelLinesFill));
  });

  it("draws contours from zoom 13 only, at 40/200 ft to zoom 14 and 20/100 ft from 15, in feet", () => {
    expect(CONTOURS_MIN_ZOOM).toBe(13);
    expect(CONTOUR_THRESHOLDS).toEqual({ 13: [40, 200], 15: [20, 100] });
    expect(FEET_PER_M).toBeCloseTo(3.28084, 5);
    for (const id of [TERRAIN_LAYER.contourLines, TERRAIN_LAYER.contourLabels])
      expect((layer(id) as LayerSpecification & { minzoom: number }).minzoom).toBe(13);
  });

  it("labels only the major lines, as '2,600 ft', with the self-hosted glyphs", () => {
    const labels = layer(TERRAIN_LAYER.contourLabels) as Extract<LayerSpecification, { type: "symbol" }>;
    expect(labels.filter).toEqual(["==", ["get", "level"], 1]);
    expect(JSON.stringify(labels.layout?.["text-field"])).toContain('" ft"');
    expect(style.glyphs).toBe(GLYPHS);
  });

  it("feeds terrain and hillshade from two raster-dem sources on the same Terrarium tiles", () => {
    for (const id of [TERRAIN_SOURCE.terrain, TERRAIN_SOURCE.hillshade])
      expect(style.sources[id]).toMatchObject({
        type: "raster-dem",
        encoding: "terrarium",
        tiles: [tiles.dem],
        maxzoom: TERRARIUM_MAXZOOM,
      });
    expect(style.sources[TERRAIN_SOURCE.contours]).toMatchObject({ type: "vector", tiles: [tiles.contours] });
  });

  it("starts with the hillshade and contours hidden: the prefs turn them on", () => {
    for (const id of Object.values(TERRAIN_LAYER))
      expect((layer(id) as { layout?: { visibility?: string } }).layout?.visibility).toBe("none");
  });

  it("leaves terrain out of the style when no tiles are given", () => {
    const plain = buildStyle(opts);
    expect(plain.glyphs).toBeUndefined();
    expect(plain.layers.some((l) => l.id === TERRAIN_LAYER.hillshade)).toBe(false);
    expect(Object.keys(plain.sources)).not.toContain(TERRAIN_SOURCE.terrain);
  });
});
