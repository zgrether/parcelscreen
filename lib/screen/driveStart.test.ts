/**
 * Follow-up 54 (owner, #123): where the drives start, the route out's first miles on tracks, and the trailheads'
 * drives, to their parking where it's tagged.
 */
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import type { HttpClient } from "../http";
import { DEFAULT_ENDPOINTS } from "./config";
import { driveStart, driveTimes, leadingTrackMi, tableUrl, trailCandidates } from "./drive";
import type { DrawnInput, ScreenResult } from "./types";
import type { LatLon } from "./util";

const MI = 1609.34;
/** An OSRM step: `mi` miles at `mph`. */
const step = (mi: number, mph: number, name = "", ref = "") => ({
  name,
  ref,
  distance: mi * MI,
  duration: (mi / mph) * 3600,
});

describe("where the drives start", () => {
  const dw = (e: Partial<NonNullable<ScreenResult["driveway"]>["entrances"][number]>) => {
    const d = structuredClone(expectedOf("grayson-mud-creek-6273", "run").driveway!);
    d.entrances[d.routes[0]!.entranceIndex] = { ...d.entrances[d.routes[0]!.entranceIndex]!, ...e };
    return d;
  };
  const centre: LatLon = [36.5854, -81.5634];

  it("the scored route's road entrance, named for its road", () => {
    expect(driveStart(expectedOf("grayson-mud-creek-6273", "run").driveway, [], centre)).toEqual({
      ll: [36.58540913054699, -81.5639706020979],
      kind: "entrance",
      road: "Mud Creek Ln",
      line: null,
      gapFt: null,
    });
  });

  it("no frontage: the nearest road point, how far off; no driveway: the centre", () => {
    expect(driveStart(dw({ fallback: true, gapFt: 240 }), [], centre)).toMatchObject({
      kind: "nearestRoad",
      road: "Mud Creek Ln",
      gapFt: 240,
    });
    expect(driveStart(undefined, [], centre)).toEqual({
      ll: centre,
      kind: "centre",
      road: null,
      line: null,
      gapFt: null,
    });
  });

  it("a drawn line's entrance: the line's other end, at the road (its entrance is the end away from it)", () => {
    const line: DrawnInput = {
      id: "l1",
      kind: "easement",
      line: [
        [36.586, -81.561],
        [36.5855, -81.5625],
      ],
      widthFt: 30,
    };
    const d = dw({ source: "drawn", line: 0, ll: [36.5855, -81.5625] });
    expect(driveStart(d, [line], centre)).toMatchObject({
      ll: [36.586, -81.561],
      kind: "drawn",
      line: "easement",
    });
  });
});

describe("the route out's first miles on tracks", () => {
  it("Macks: 1.5 mi unnamed and Bullard Knob at 6 mph, then Gator Mountain Road at 15: 2.6 mi", () => {
    expect(
      leadingTrackMi([
        step(1.47, 6.2),
        step(0.03, 6.2),
        step(1.09, 6.1, "Bullard Knob"),
        step(1.41, 15.3, "Gator Mountain Road"),
        step(0.32, 15.5, "Deepwater Road", "SR 611"),
      ]),
    ).toBe(2.6);
  });

  it("stops at a numbered route, however slow; a named road at speed isn't a track", () => {
    expect(leadingTrackMi([step(2, 6), step(3, 9, "Max Creek Road", "SR 655")])).toBe(2);
    expect(leadingTrackMi([step(0.2, 25, "Mud Creek Lane"), step(2, 6)])).toBe(0);
  });

  it("the table service is the route service's URL with /table/", () => {
    expect(tableUrl(DEFAULT_ENDPOINTS.osrm)).toBe("https://router.project-osrm.org/table/v1/driving");
    expect(tableUrl("https://example.test/osrm")).toBeNull(); // not OSRM's form: a route request each
  });
});

describe("the trailheads' drives", () => {
  const from: LatLon = [36.58, -81.56];
  const th = (name: string, lat: number): { name: string; ll: LatLon } => ({ name, ll: [lat, -81.56] });

  it("the nearest five by straight line from the start", () => {
    const list = [0.5, 0.1, 0.3, 0.2, 0.6, 0.4].map((d, i) => th(`T${i}`, 36.58 + d));
    expect(trailCandidates(list, from).map((c) => c.index)).toEqual([1, 3, 2, 5, 0]);
  });

  it("each driven to its parking when it has one, else to the point; the track reading from the route out", async () => {
    const asked: string[] = [];
    const http: HttpClient = {
      fetch: async (url) => {
        asked.push(url);
        if (url.includes("/table/v1/")) {
          const n = url.split("?")[0]!.split(";").length - 1;
          return new Response(
            JSON.stringify({
              code: "Ok",
              durations: [Array.from({ length: n }, (_, i) => (i + 1) * 600)],
              distances: [Array.from({ length: n }, (_, i) => (i + 1) * 8000)],
              sources: [{ distance: 150 }],
            }),
          );
        }
        // The route out, with its steps: 0.8 mi of track, then a numbered road.
        return new Response(
          JSON.stringify({
            routes: [{ legs: [{ steps: [step(0.8, 6), step(5, 40, "Highlands Pkwy", "US 58")] }] }],
            waypoints: [{ distance: 150 }],
          }),
        );
      },
    };
    const parking: LatLon = [36.6801, -81.5603];
    const d = await driveTimes(from, undefined, [], { http, endpoints: DEFAULT_ENDPOINTS }, {}, [
      { index: 4, ll: [36.68, -81.56], parkingLl: parking },
      { index: 7, ll: [36.7, -81.56], parkingLl: null },
    ]);
    expect([...d.trailDrives.entries()].map(([i, t]) => [i, t.min, t.to, t.parkingLl])).toEqual([
      [4, 10, "parking", parking],
      [7, 20, "point", null],
    ]);
    expect(d.trailDrives.get(4)!.km).toBeCloseTo(11.1, 1); // the straight line from the start, to the trailhead
    expect(asked[0]).toContain(`;${parking[1]},${parking[0]};`); // the table goes to the parking, not the point
    expect(d.snapM).toBe(150);
    expect(d.trackMi).toBe(0.8); // over drive.trackMinMi (0.5)
  });
});
