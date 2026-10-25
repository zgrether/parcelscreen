/**
 * The places half of the near step from the baked OSM cells (step 14d plan §3): groceries within 40 km and trailheads
 * within 36 km, nearest first; the hospitals from the ER list (§9.69), never OSM's; no request to anything else.
 */
import { describe, expect, it } from "vitest";
import { CancelledError, type HttpClient } from "../http";
import { DEFAULT_ENDPOINTS } from "./config";
import { cellsWithin, type Place, type PlacesSource } from "./placeData";
import { findPlaces, PlacesError } from "./places";

const MUD: [number, number] = [36.5856, -81.5631];
/** A point `km` kilometres north of Mud Creek. */
const north = (km: number): [number, number] => [MUD[0] + km / 111.2, MUD[1]];
const noHttp: HttpClient = {
  fetch: async () => {
    throw new Error("no request expected");
  },
};

const PLACES: Place[] = [
  { kind: "grocer", id: "osm:node/1", name: "Food Lion", ll: north(20), src: "osm", big: true },
  { kind: "grocer", id: "osm:node/2", name: "Corner Market", ll: north(5), src: "osm", big: false },
  { kind: "grocer", id: "osm:node/3", name: "Far Market", ll: north(41), src: "osm", big: false },
  { kind: "trailhead", id: "osm:node/4", name: "Trailhead", ll: north(30), src: "osm" },
  { kind: "trailhead", id: "osm:node/5", name: "Too Far", ll: north(37), src: "osm" },
  { kind: "parking", id: "osm:way/6", ll: north(30), src: "osm" },
];

function baked(places: Place[] = PLACES) {
  const asked: { folder: string; cells: readonly string[] }[] = [];
  const source: PlacesSource = async (folder, cells) => {
    asked.push({ folder, cells });
    return places;
  };
  return { source, asked };
}

describe("findPlaces, from the baked cells", () => {
  it("reads the OSM cells the larger radius touches, once", async () => {
    const b = baked();
    await findPlaces(MUD, { http: noHttp, endpoints: DEFAULT_ENDPOINTS, places: b.source });
    expect(b.asked).toEqual([{ folder: "osm", cells: cellsWithin(MUD, 40) }]);
  });

  it("groceries within 40 km and trailheads within 36 km, nearest first; non-chains kept for the closer grocery", async () => {
    const r = await findPlaces(MUD, { http: noHttp, endpoints: DEFAULT_ENDPOINTS, places: baked().source });
    expect(r.near.grocers.map((g) => [g.name, g.big])).toEqual([
      ["Corner Market", false],
      ["Food Lion", true],
    ]);
    expect(r.otherGrocers.map((g) => g.name)).toEqual(["Corner Market"]);
    expect(r.osmTrailheads.map((t) => [t.name, t.source])).toEqual([["Trailhead", "osm"]]);
    expect(r.near.trailheadCount).toBe(1);
  });

  it("the hospitals are the ER list's (§9.69); without the list, none", async () => {
    const r = await findPlaces(MUD, { http: noHttp, endpoints: DEFAULT_ENDPOINTS, places: baked().source });
    expect(r.near.hospitals.length).toBeGreaterThan(0);
    expect(r.hospitalPool.every((h) => h.er === true)).toBe(true);
    const none = await findPlaces(MUD, {
      http: noHttp,
      endpoints: DEFAULT_ENDPOINTS,
      places: baked().source,
      hospitals: async () => null,
    });
    expect(none.hospitalPool).toEqual([]);
  });

  it("cells that don't load are a PlacesError; a cancel still cancels", async () => {
    const down: PlacesSource = async () => Promise.reject(new Error("places osm/36_-82: 503"));
    await expect(
      findPlaces(MUD, { http: noHttp, endpoints: DEFAULT_ENDPOINTS, places: down }),
    ).rejects.toBeInstanceOf(PlacesError);
    const cancel: PlacesSource = async () => Promise.reject(new CancelledError());
    await expect(
      findPlaces(MUD, { http: noHttp, endpoints: DEFAULT_ENDPOINTS, places: cancel }),
    ).rejects.toBeInstanceOf(CancelledError);
  });
});
