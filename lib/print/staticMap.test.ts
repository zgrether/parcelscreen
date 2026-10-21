import { describe, expect, it } from "vitest";
import {
  boundsOf,
  DENSITY,
  FILL,
  mapView,
  MAX_ZOOM,
  scaleBar,
  TILE,
  tileUrl,
  worldX,
  worldY,
} from "./staticMap";

// Ferney's neighbourhood: a box about 600 m across.
const BOUNDS: [number, number, number, number] = [36.878, -80.459, 36.884, -80.452];

describe("the print map's view (step 9 plan §4)", () => {
  it("Web Mercator: zoom 0's world is one tile; the equator and the prime meridian at its centre", () => {
    expect(worldX(0, 0)).toBeCloseTo(TILE / 2);
    expect(worldY(0, 0)).toBeCloseTo(TILE / 2);
    expect(worldX(180, 1)).toBeCloseTo(TILE * 2);
  });

  it("the deepest zoom at which the bounds fill no more than FILL of the box, centred", () => {
    const v = mapView(BOUNDS, 720, 317);
    expect(v.z).toBeLessThanOrEqual(MAX_ZOOM);
    const [x1, y1] = v.at([BOUNDS[2], BOUNDS[1]]);
    const [x2, y2] = v.at([BOUNDS[0], BOUNDS[3]]);
    expect(x2 - x1).toBeLessThanOrEqual(720 * FILL);
    expect(y2 - y1).toBeLessThanOrEqual(317 * FILL);
    // One zoom deeper wouldn't fit.
    const deeper = (worldX(BOUNDS[3], v.z + 1) - worldX(BOUNDS[1], v.z + 1)) / DENSITY;
    const deeperH = (worldY(BOUNDS[0], v.z + 1) - worldY(BOUNDS[2], v.z + 1)) / DENSITY;
    expect(deeper > 720 * FILL || deeperH > 317 * FILL).toBe(true);
    // Centred.
    expect((x1 + x2) / 2).toBeCloseTo(360, 0);
    expect((y1 + y2) / 2).toBeCloseTo(158.5, 0);
  });

  it("tiles cover the whole box, each 128 CSS px", () => {
    const v = mapView(BOUNDS, 720, 317);
    const left = Math.min(...v.tiles.map((t) => t.left));
    const top = Math.min(...v.tiles.map((t) => t.top));
    const right = Math.max(...v.tiles.map((t) => t.left)) + TILE / DENSITY;
    const bottom = Math.max(...v.tiles.map((t) => t.top)) + TILE / DENSITY;
    expect(left).toBeLessThanOrEqual(0);
    expect(top).toBeLessThanOrEqual(0);
    expect(right).toBeGreaterThanOrEqual(720);
    expect(bottom).toBeGreaterThanOrEqual(317);
    expect(tileUrl("usgs", v.z, v.tiles[0]!.x, v.tiles[0]!.y)).toBe(
      `https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/${v.z}/${v.tiles[0]!.y}/${v.tiles[0]!.x}`,
    );
  });

  it("the bounds of some points, and a scale bar of a round length", () => {
    expect(
      boundsOf([
        [36.88, -80.45],
        [36.87, -80.46],
      ]),
    ).toEqual([36.87, -80.46, 36.88, -80.45]);
    expect(scaleBar(1, 120)).toEqual({ label: "200 ft", px: 200 / 3.28084 });
    expect(scaleBar(20, 120).label).toBe("1 mi");
    expect(scaleBar(1, 120).px).toBeLessThanOrEqual(120);
  });
});
