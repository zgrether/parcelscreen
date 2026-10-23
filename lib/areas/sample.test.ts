/**
 * Sampling a synthetic area (step 13 plan §3.1, §10): a square with water down its west side, a town in its north-east
 * corner and a national forest in its south-east: no accepted point lands on any of them, the same seed draws the
 * same points, and too few points make the area thin.
 */
import { booleanPointInPolygon, point, polygon } from "@turf/turf";
import { describe, expect, it } from "vitest";
import type { LatLon } from "../geo/types";
import { rejection, rng, sampleArea, seedOf, type SampleDeps } from "./sample";

// [lon, lat] corners: 36.0–36.1 N, 81.1–81.0 W.
const square = polygon([
  [
    [-81.1, 36.0],
    [-81.0, 36.0],
    [-81.0, 36.1],
    [-81.1, 36.1],
    [-81.1, 36.0],
  ],
]);
const forest = polygon([
  [
    [-81.04, 36.0],
    [-81.0, 36.0],
    [-81.0, 36.04],
    [-81.04, 36.04],
    [-81.04, 36.0],
  ],
]);
const water = ([, lon]: LatLon) => lon < -81.08;
const town = ([lat, lon]: LatLon) => lat > 36.08 && lon > -81.02;
const deps: SampleDeps = {
  landCover: (ll) => (water(ll) ? 11 : town(ll) ? 23 : 41),
  onPublicLand: ([lat, lon]) => booleanPointInPolygon(point([lon, lat]), forest),
};

describe("sampling", () => {
  it("never accepts water, developed land or public land", () => {
    const s = sampleArea("synthetic", square, deps, 200);
    expect(s.points).toHaveLength(200);
    for (const ll of s.points) {
      expect(water(ll)).toBe(false);
      expect(town(ll)).toBe(false);
      expect(deps.onPublicLand(ll)).toBe(false);
    }
    expect(s.rejected.water).toBeGreaterThan(0);
    expect(s.rejected.developed).toBeGreaterThan(0);
    expect(s.rejected.public).toBeGreaterThan(0);
    expect(s.thin).toBe(false);
  });

  it("the same id draws the same points; another id doesn't", () => {
    expect(sampleArea("synthetic", square, deps, 50).points).toEqual(
      sampleArea("synthetic", square, deps, 50).points,
    );
    expect(sampleArea("other", square, deps, 50).points).not.toEqual(
      sampleArea("synthetic", square, deps, 50).points,
    );
    expect(seedOf("synthetic")).toBe(seedOf("synthetic"));
    const r = rng(1);
    expect([r(), r()].every((x) => x >= 0 && x < 1)).toBe(true);
  });

  it("an area that's mostly public land is thin", () => {
    const mostlyForest: SampleDeps = { ...deps, onPublicLand: ([lat]) => lat > 36.002 };
    const s = sampleArea("synthetic", square, mostlyForest, 200, 2000);
    expect(s.points.length).toBeLessThan(100);
    expect(s.thin).toBe(true);
  });

  it("no reading, or class 0, is never accepted", () => {
    expect(rejection([36.05, -81.05], square, { ...deps, landCover: () => null })).toBe("noData");
    expect(rejection([36.05, -81.05], square, { ...deps, landCover: () => 0 })).toBe("noData");
    expect(rejection([36.2, -81.05], square, deps)).toBe("outside");
  });
});
