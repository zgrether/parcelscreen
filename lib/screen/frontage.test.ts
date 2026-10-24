/**
 * Road frontage (step 14 plan §2.3): only a public road's counts as public, and OSM's copy of a TIGER road isn't
 * counted twice.
 */
import { lineString, polygon } from "@turf/turf";
import { describe, expect, it } from "vitest";
import { measureFrontage } from "./frontage";
import type { OsmWay } from "./osmRoads";
import type { RoadFeature } from "./roads";
import { M2FT } from "./util";

const S = 0.002; // about 222 m north-south, 179 m east-west at 36.6 N
const parcel = polygon([
  [
    [-81.5, 36.6],
    [-81.5 + S, 36.6],
    [-81.5 + S, 36.6 + S],
    [-81.5, 36.6 + S],
    [-81.5, 36.6],
  ],
]);
const road = (coords: [number, number][], name: string, mtfcc: string): RoadFeature =>
  lineString(coords, { NAME: name, MTFCC: mtfcc }) as RoadFeature;
// A local road 20 m south of the south edge, running past both corners.
const south = road(
  [
    [-81.502, 36.59982],
    [-81.496, 36.59982],
  ],
  "Mud Creek Rd",
  "S1400",
);
// A private road 20 m east of the east edge.
const eastPrivate = road(
  [
    [-81.4978, 36.598],
    [-81.4978, 36.604],
  ],
  "Hidden Lane",
  "S1740",
);
const sideFt = S * 111_320 * Math.cos((36.6 * Math.PI) / 180) * M2FT;
const way = (id: number, highway: string, name: string | null, coords: [number, number][]): OsmWay => ({
  id,
  highway,
  name,
  tracktype: null,
  access: null,
  service: null,
  coords,
});

describe("road frontage", () => {
  it("a local road along one side: about that side's length, public", () => {
    const f = measureFrontage([south], [], parcel);
    expect(f.roads).toHaveLength(1);
    expect(f.roads[0]!.public).toBe(true);
    // The road's stretch within 40 m of the boundary: the side, plus the reach past each corner.
    expect(f.publicFt).toBeGreaterThan(sideFt * 0.95);
    expect(f.publicFt).toBeLessThan(sideFt * 1.6);
  });

  it("a private road is frontage, but not public", () => {
    const f = measureFrontage([south, eastPrivate], [], parcel);
    const hidden = f.roads.find((r) => r.name === "Hidden Lane")!;
    expect(hidden.public).toBe(false);
    expect(hidden.ft).toBeGreaterThan(0);
    expect(f.publicFt).toBe(f.roads.find((r) => r.name === "Mud Creek Rd")!.ft);
  });

  it("no road near: none", () => {
    const far = road(
      [
        [-81.52, 36.58],
        [-81.51, 36.58],
      ],
      "Far Rd",
      "S1400",
    );
    expect(measureFrontage([far], [], parcel)).toEqual({ publicFt: 0, roads: [] });
  });

  it("an OSM way on the TIGER road isn't counted again; an OSM track elsewhere counts, not public", () => {
    const copy = way(1, "unclassified", "Mud Creek Rd", [
      [-81.502, 36.59983],
      [-81.496, 36.59983],
    ]);
    const track = way(2, "track", null, [
      [-81.5002, 36.598],
      [-81.5002, 36.604],
    ]);
    const f = measureFrontage([south], [copy, track], parcel);
    expect(f.roads.filter((r) => r.name === "Mud Creek Rd")).toHaveLength(1);
    expect(f.roads.find((r) => r.name === "unmapped track")!.public).toBe(false);
    expect(f.publicFt).toBe(measureFrontage([south], [], parcel).publicFt);
  });
  it("TIGER's same road twice (a layer each, two names): counted once, as public", () => {
    const again = road(
      [
        [-81.502, 36.59982],
        [-81.496, 36.59982],
      ],
      "State Rte 600",
      "S1400",
    );
    const once = measureFrontage([south], [], parcel).publicFt;
    const f = measureFrontage([south, again], [], parcel);
    expect(f.publicFt).toBe(once);
    expect(f.roads).toHaveLength(1);
  });
});
