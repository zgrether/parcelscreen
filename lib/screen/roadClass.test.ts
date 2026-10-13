/** The road an entrance is on (follow-up 55): its Census class, and the OpenStreetMap way lying on it. */
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { roadClassAt } from "./driveway";
import type { OsmWay } from "./osmRoads";
import type { LatLon } from "./util";

const AT: LatLon = [36.937, -80.6286];
/** A way running north–south `m` metres east of AT (1° of longitude here is about 89.2 km). */
const way = (m: number, tags: Partial<OsmWay>): OsmWay => {
  const lon = AT[1] + m / 89_200;
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

describe("the road an entrance is on", () => {
  it("the OSM way within 15 m is the same road: its tags; past that, none", () => {
    expect(roadClassAt(AT, "S1400", [way(10, { tracktype: "grade4" })])).toEqual({
      mtfcc: "S1400",
      osm: { highway: "track", tracktype: "grade4", access: null, service: null },
    });
    expect(roadClassAt(AT, "S1400", [way(20, {})])).toEqual({ mtfcc: "S1400", osm: null });
    // The nearer of two.
    expect(
      roadClassAt(AT, null, [
        way(12, { highway: "service" }),
        way(3, { highway: "track", access: "private" }),
      ]).osm,
    ).toMatchObject({ highway: "track", access: "private" });
  });

  it("on the fixtures: Macks's entrance road is a track to OpenStreetMap, a local road to the Census", () => {
    const m = expectedOf("macks-mountain-35-3", "run").driveway!;
    expect(m.entrances[m.routes[0]!.entranceIndex]!.roadClass).toEqual({
      mtfcc: "S1400",
      osm: { highway: "track", tracktype: null, access: null, service: null },
    });
    // Grayson's is Mud Creek Ln, which OpenStreetMap's tracks and service roads don't include.
    const g = expectedOf("grayson-mud-creek-6273", "run").driveway!;
    expect(g.entrances[g.routes[0]!.entranceIndex]!.roadClass).toEqual({ mtfcc: "S1400", osm: null });
  });
});
