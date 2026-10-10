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

  it("draws the soil outlines over the parcel lines, then saved parcels, then the selected one and its selected layer, above the outlines; then the soil outlines (15c), and the fan, the driveway and the circles (15b–c); then the split, the combination, the drawing", () => {
    expect(layerIds.slice(layerIds.indexOf(LAYER.parcelLines) + 1)).toEqual([
      LAYER.soilHalo,
      LAYER.soilLine,
      LAYER.savedFill,
      LAYER.savedLine,
      LAYER.parcelHalo,
      LAYER.parcelFill,
      LAYER.parcelLine,
      LAYER.selFill,
      LAYER.selLine,
      LAYER.leftFill,
      LAYER.leftLine,
      LAYER.fanHalo,
      LAYER.fanRay,
      LAYER.driveDirect,
      LAYER.driveHalo,
      LAYER.driveSecond,
      LAYER.driveRoute,
      LAYER.driveOver,
      LAYER.driveOverStretch,
      LAYER.culverts,
      LAYER.trailheads,
      LAYER.evalRing,
      LAYER.trailheadFlags, // map UX: the points as flags when tilted
      LAYER.evalFlag,
      LAYER.splitFill,
      LAYER.splitLine,
      LAYER.splitCut,
      LAYER.combineFill,
      LAYER.combineLine,
      LAYER.combineResult,
      LAYER.draftLine,
      LAYER.draftPoints,
    ]);
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
    expect(src("base-state-nc").maxzoom).toBe(20);
    expect(src("base-state-va").maxzoom).toBe(19);
    // Each box holds its whole state (TIGER extents, 2026-10-10): a box that cuts into the state leaves a strip of it
    // on the USGS fallback, as the prototype's 36.54° split did near Grayson.
    const holds = (b: number[] | undefined, [w, s, e, n]: number[]) =>
      !!b && b[0]! < w! && b[1]! < s! && b[2]! > e! && b[3]! > n!;
    expect(holds(src("base-state-nc").bounds, [-84.3218, 33.7529, -75.4001, 36.5881])).toBe(true);
    expect(holds(src("base-state-va").bounds, [-83.6754, 36.5409, -75.1664, 39.466])).toBe(true);
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
