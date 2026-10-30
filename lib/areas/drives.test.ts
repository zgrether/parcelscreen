/**
 * An area's drives (step 13 plan §3.2): tables never pass the coordinate limit, the grocery drive follows the Town
 * row's closer-grocery rule, and each point gets the quickest of its nearest destinations of each kind.
 */
import { describe, expect, it } from "vitest";
import { SCREEN_CONSTANTS } from "../screen/config";
import type { LatLon } from "../geo/types";
import { batches, groceryDrive, nearest, pointDrives, type Destinations, type Matrix } from "./drives";

describe("batching", () => {
  it("every table holds at most areas.tableMaxCoords coordinates", () => {
    const pts: LatLon[] = Array.from({ length: 200 }, (_, i) => [36 + i * 0.001, -81]);
    const want = pts.map((_, i) => new Set(Array.from({ length: 12 }, (_, j) => `d${(i + j) % 60}`)));
    const bs = batches(pts, want);
    expect(bs.flat()).toEqual(pts.map((_, i) => i));
    for (const b of bs) {
      const dest = new Set(b.flatMap((i) => [...want[i]!]));
      expect(b.length + dest.size).toBeLessThanOrEqual(SCREEN_CONSTANTS.areas.tableMaxCoords);
    }
  });
});

describe("the grocery drive (card.ts town)", () => {
  it("the chain's, unless a store is 10 minutes nearer", () => {
    expect(groceryDrive(30, 25)).toBe(30);
    expect(groceryDrive(30, 20)).toBe(20);
    expect(groceryDrive(null, 20)).toBe(20);
    expect(groceryDrive(30, null)).toBe(30);
  });
});

describe("each point's drives", () => {
  const dest: Destinations = {
    ers: [[36.1, -81]],
    chains: [[36.2, -81]],
    otherGroceries: [[36.05, -81]],
    airports: [[36.5, -81]],
    trailheads: [[36.01, -81]],
    trailPoints: [[36.3, -81]],
    launches: [[36.25, -81]],
    ropeAreas: [[36.4, -81]],
  };
  // Minutes: 100 per degree of latitude apart.
  const matrix: Matrix = async (s, d) => s.map((a) => d.map((b) => Math.round(Math.abs(b[0] - a[0]) * 100)));

  it("the quickest of each kind, from the table", async () => {
    const [p] = await pointDrives([[36, -81]], dest, matrix);
    expect(p).toEqual({
      erMin: 10,
      groceryMin: 5,
      airportMin: 50,
      trailheadMin: 1,
      longTrailMin: 30,
      paddleMin: 25,
      climbMin: 40,
    });
  });

  it("a table that fails leaves its points' drives unknown", async () => {
    const [p] = await pointDrives([[36, -81]], dest, async () => null);
    expect(p).toEqual({
      erMin: null,
      groceryMin: null,
      airportMin: null,
      trailheadMin: null,
      longTrailMin: null,
      paddleMin: null,
      climbMin: null,
    });
  });

  it("nearest by straight line", () => {
    expect(
      nearest(
        [36, -81],
        [
          [37, -81],
          [36.1, -81],
          [36.5, -81],
        ],
        2,
      ),
    ).toEqual([
      [36.1, -81],
      [36.5, -81],
    ]);
  });
});
