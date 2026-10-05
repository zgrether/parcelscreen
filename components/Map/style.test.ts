import { describe, expect, it } from "vitest";
import { BASEMAPS, basemapLayerIds, buildStyle, LAYER, lightPollutionTiles } from "./style";

describe("map style", () => {
  const style = buildStyle({
    base: "state",
    lpAtlasTiles: "https://djlorenz.github.io/astronomy/image_tiles",
    lpYear: 2025,
  });
  const layerIds = style.layers.map((l) => l.id);

  it("stacks basemaps < light pollution < dim scrim < parcel lines, as the prototype's panes did", () => {
    const at = (id: string) => layerIds.indexOf(id);
    const lastBase = Math.max(...BASEMAPS.flatMap((b) => basemapLayerIds(b.id)).map(at));
    expect(lastBase).toBeLessThan(at(LAYER.lightPollution));
    expect(at(LAYER.lightPollution)).toBeLessThan(at(LAYER.scrim));
    expect(at(LAYER.scrim)).toBeLessThan(at(LAYER.parcelLines));
  });

  it("shows only the chosen basemap", () => {
    const visible = style.layers
      .filter((l) => l.id.startsWith("base-") && l.layout?.visibility === "visible")
      .map((l) => l.id);
    expect(visible).toEqual(basemapLayerIds("state"));
  });

  it("builds the state ortho from USGS, then NC, then VA, each bounded and capped at its native zoom", () => {
    expect(basemapLayerIds("state")).toEqual(["base-state-usgs", "base-state-nc", "base-state-va"]);
    const src = (id: string) => style.sources[id] as { maxzoom?: number; bounds?: number[]; tiles: string[] };
    expect(src("base-state-usgs").maxzoom).toBe(16);
    expect(src("base-state-nc")).toMatchObject({ maxzoom: 20, bounds: [-84.4, 33.8, -75.4, 36.54] });
    expect(src("base-state-va")).toMatchObject({ maxzoom: 19, bounds: [-83.7, 36.54, -75.2, 39.5] });
    expect(src("base-state-va").tiles[0]).toContain("bbox={bbox-epsg-3857}");
    expect(src("base-state-va").tiles[0]).toContain("transparent=true");
  });

  it("asks for the atlas image tiles of the configured year at 1024 px", () => {
    expect(lightPollutionTiles("https://x/image_tiles", 2025)).toBe(
      "https://x/image_tiles/tiles2025/tile_{z}_{x}_{y}.png",
    );
    expect(style.sources[LAYER.lightPollution]).toMatchObject({ tileSize: 1024, maxzoom: 8 });
  });

  it("keeps every overlay hidden until switched on", () => {
    for (const id of [LAYER.lightPollution, LAYER.scrim])
      expect(style.layers.find((l) => l.id === id)!.layout?.visibility).toBe("none");
  });
});
