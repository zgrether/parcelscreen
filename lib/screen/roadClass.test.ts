/** The road an entrance is on (follow-up 55): its Census class, and the OpenStreetMap way lying on it. */
import { polygon } from "@turf/turf";
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { roadClassAt } from "./driveway";
import type { OsmWay } from "./osmRoads";
import { M2FT, type LatLon } from "./util";

const AT: LatLon = [36.937, -80.6286];
/** A way running north–south `m` metres east of AT, 0.001° (111 m) either side of it. */
const way = (m: number, tags: Partial<OsmWay>): OsmWay => {
  const lon = AT[1] + m / 89_200; // 1° of longitude here is about 89.2 km
  return {
    id: 1,
    highway: "track",
    name: null,
    tracktype: null,
    access: null,
    service: null,
    coords: [
      [lon, AT[0] - 0.001],
      [lon, AT[0] + 0.001],
    ],
    ...tags,
  };
};
/** A parcel holding the ways' northern halves, from AT north: their southern 111 m lie outside it. */
const PARCEL = polygon([
  [
    [AT[1] - 0.002, AT[0]],
    [AT[1] + 0.002, AT[0]],
    [AT[1] + 0.002, AT[0] + 0.002],
    [AT[1] - 0.002, AT[0] + 0.002],
    [AT[1] - 0.002, AT[0]],
  ],
]);

describe("the road an entrance is on", () => {
  it("the OSM way within 15 m is the same road: its tags, and how much of it lies outside the parcel", () => {
    const c = roadClassAt(AT, "S1400", [way(10, { tracktype: "grade4" })], PARCEL);
    expect(c).toMatchObject({
      mtfcc: "S1400",
      osm: { highway: "track", tracktype: "grade4", access: null, service: null },
    });
    expect(c.osm!.outsideFt).toBeCloseTo(111 * M2FT, -1); // its southern half, to the sampling's 5 m
    expect(roadClassAt(AT, "S1400", [way(20, {})], PARCEL)).toEqual({ mtfcc: "S1400", osm: null });
    // The nearer of two.
    expect(
      roadClassAt(
        AT,
        null,
        [way(12, { highway: "service" }), way(3, { highway: "track", access: "private" })],
        PARCEL,
      ).osm,
    ).toMatchObject({ highway: "track", access: "private" });
  });

  it("on the fixtures: Macks's entrance road is a track to OpenStreetMap, a local road to the Census", () => {
    const m = expectedOf("macks-mountain-35-3", "run").driveway!;
    expect(m.entrances[m.routes[0]!.entranceIndex]!.roadClass).toMatchObject({
      mtfcc: "S1400",
      osm: { highway: "track", tracktype: null, access: null, service: null },
    });
    // Grayson's is Mud Creek Ln, which OpenStreetMap's tracks and service roads don't include.
    const g = expectedOf("grayson-mud-creek-6273", "run").driveway!;
    expect(g.entrances[g.routes[0]!.entranceIndex]!.roadClass).toEqual({ mtfcc: "S1400", osm: null });
  });
});
