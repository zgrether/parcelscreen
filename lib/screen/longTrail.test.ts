/**
 * Bike to a long trail (step 11, plan §2.6): the access points within reach, nearest first; the nearest by road from
 * one OSRM table request; a table that doesn't answer is unknown, not "none".
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_ENDPOINTS, SCREEN_CONSTANTS } from "./config";
import { LONG_TRAILS } from "./data/longTrails";
import { accessPointsNear, longTrailDrive } from "./longTrail";
import type { LatLon } from "./util";

/** Mud Creek's drive start, about. */
const MUD: LatLon = [36.583, -81.563];

/** A fake OSRM table: minutes (null: unroutable) for each destination, in order; or a failure. */
function osrm(min: (number | null)[] | "down") {
  const urls: string[] = [];
  return {
    urls,
    deps: {
      endpoints: DEFAULT_ENDPOINTS,
      http: {
        async fetch(url: string) {
          urls.push(url);
          if (min === "down") return new Response("down", { status: 503 });
          return new Response(
            JSON.stringify({
              code: "Ok",
              durations: [min.map((m) => (m === null ? null : m * 60))],
              distances: [min.map((m) => (m === null ? null : m * 1000))],
              sources: [{ distance: 3 }],
            }),
          );
        },
      },
    },
  };
}

describe("the long trails", () => {
  it("the list: the six trails, the Parkway not among them, every point in the region", () => {
    expect(LONG_TRAILS.map((t) => t.name)).toEqual([
      "New River Trail",
      "Virginia Creeper Trail",
      "Tweetsie Trail",
      "Huckleberry Trail",
      "Mendota Trail",
      "Roanoke River Greenway",
    ]);
    for (const p of LONG_TRAILS.flatMap((t) => t.points)) {
      expect(p.lat).toBeGreaterThan(36);
      expect(p.lat).toBeLessThan(37.5);
      expect(p.lon).toBeGreaterThan(-82.5);
      expect(p.lon).toBeLessThan(-80);
    }
  });

  it("the access points within reach, nearest first, at most longTrail.points", () => {
    const near = accessPointsNear(MUD);
    expect(near.length).toBe(SCREEN_CONSTANTS.longTrail.points);
    expect(near[0]).toMatchObject({ trail: "Virginia Creeper Trail", point: "Damascus" });
    expect(accessPointsNear([40, -75])).toEqual([]);
  });

  it("the nearest by road, from one table request", async () => {
    const near = accessPointsNear(MUD);
    // The second-nearest in a straight line is the quickest by road.
    const { deps, urls } = osrm(near.map((_, i) => (i === 1 ? 30 : 45)));
    expect(await longTrailDrive(MUD, deps)).toEqual({
      trail: near[1]!.trail,
      point: near[1]!.point,
      min: 30,
      mi: 18.6,
    });
    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatch(/\/table\/v1\/driving\//);
  });

  it("none routable or in reach: null; OSRM down: unknown (undefined)", async () => {
    const near = accessPointsNear(MUD);
    expect(await longTrailDrive(MUD, osrm(near.map(() => null)).deps)).toBeNull();
    expect(await longTrailDrive([40, -75], osrm([]).deps)).toBeNull();
    expect(await longTrailDrive(MUD, osrm("down").deps)).toBeUndefined();
  });
});
