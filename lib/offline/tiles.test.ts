import { describe, expect, it } from "vitest";
import { bbox3857, growBox, tileOfBbox, tilesInBox, tileUrl } from "./tiles";

/** MapLibre's own `{bbox-epsg-3857}` (src/tile/tile_id.ts getTileBBox), copied to test against its exact numbers. */
function maplibreBbox(x: number, y: number, z: number): string {
  const half = Math.PI * 6378137;
  const coords = (px: number, py: number): [number, number] => {
    const res = (2 * half) / 256 / 2 ** z;
    return [px * res - half, py * res - half];
  };
  const yy = 2 ** z - y - 1;
  const min = coords(x * 256, yy * 256);
  const max = coords((x + 1) * 256, (yy + 1) * 256);
  return `${min[0]},${min[1]},${max[0]},${max[1]}`;
}

describe("offline tiles", () => {
  it("works a MapLibre box back to its tile, at every zoom the box layers use", () => {
    for (const [z, x, y] of [
      [12, 1130, 1597],
      [16, 18093, 25553],
      [18, 72374, 102213],
      [19, 144748, 204426],
    ] as const) {
      expect(tileOfBbox(maplibreBbox(x, y, z))).toEqual({ z, x, y });
      expect(tileOfBbox(bbox3857({ z, x, y }))).toEqual({ z, x, y });
    }
  });

  it("refuses a box that isn't one tile of the grid", () => {
    expect(tileOfBbox("0,0,100,50")).toBeNull();
    expect(tileOfBbox("0,0,1000,1000")).toBeNull();
    expect(tileOfBbox("a,b,c,d")).toBeNull();
  });

  it("lists the tiles a box touches, growing with the zoom", () => {
    // Mud Creek's neighbourhood, about 1.5 km across.
    const box = growBox({ west: -81.83, south: 36.6, east: -81.82, north: 36.61 }, 402);
    const counts = [12, 14, 16, 18].map((z) => tilesInBox(box, z).length);
    expect(counts[0]).toBeGreaterThanOrEqual(1);
    expect(counts[3]!).toBeGreaterThan(counts[2]!);
    expect(counts[3]!).toBeLessThan(400);
    const t = tilesInBox(box, 16)[0]!;
    expect(t.z).toBe(16);
  });

  it("fills a template for one tile", () => {
    expect(tileUrl("https://h/tile/{z}/{y}/{x}", { z: 3, x: 1, y: 2 })).toBe("https://h/tile/3/2/1");
    expect(tileUrl("https://h/export?bbox={bbox-epsg-3857}&f=image", { z: 1, x: 0, y: 0 })).toBe(
      `https://h/export?bbox=${bbox3857({ z: 1, x: 0, y: 0 })}&f=image`,
    );
  });
});
