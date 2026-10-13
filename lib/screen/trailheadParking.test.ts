/** A trailhead's parking (follow-up 54, by follow-up 39's rule): within 300 m and tagged for it, else the point. */
import { describe, expect, it } from "vitest";
import { parkingFor, parkingQuery, parseParking, type ParkingLot } from "./trailheadParking";
import type { LatLon } from "./util";

const TH = { name: "Buffalo Mountain Trailhead", ll: [36.7941894, -80.4665278] as LatLon };
/** A point `m` metres north of the trailhead (1° of latitude is about 111.2 km). */
const north = (m: number): LatLon => [TH.ll[0] + m / 111_200, TH.ll[1]];
const lot = (m: number, tags: Record<string, string>): ParkingLot => ({ ll: north(m), tags });

describe("the parking query", () => {
  it("asks for every amenity=parking within 300 m of each point, nodes and ways at their centres", () => {
    expect(parkingQuery([TH.ll, [36.6, -81.5]])).toBe(
      '[out:json][timeout:25];(nwr["amenity"="parking"](around:300,36.794189,-80.466528);nwr["amenity"="parking"](around:300,36.600000,-81.500000););out center tags;',
    );
  });

  it("reads nodes and ways' centres; anything without a position is dropped", () => {
    expect(
      parseParking({
        elements: [
          { type: "node", lat: 1, lon: 2, tags: { amenity: "parking" } },
          { type: "way", center: { lat: 3, lon: 4 }, tags: { amenity: "parking", name: "Lot" } },
          { type: "relation", tags: { amenity: "parking" } },
        ],
      }),
    ).toEqual([
      { ll: [1, 2], tags: { amenity: "parking" } },
      { ll: [3, 4], tags: { amenity: "parking", name: "Lot" } },
    ]);
  });
});

describe("a trailhead's parking", () => {
  it("a lot named for the trailhead, after follow-up 24's normalisation (Buffalo Mountain's, 12 m away)", () => {
    expect(
      parkingFor(TH, [lot(12, { amenity: "parking", name: "Buffalo Mountain Trailhead Parking" })]),
    ).toEqual(north(12));
    // One name holding the other, as whole words; a lot named for something else isn't it.
    expect(
      parkingFor(TH, [lot(50, { amenity: "parking", name: "Buffalo Mountain Natural Area Parking" })]),
    ).toEqual(north(50));
    expect(parkingFor(TH, [lot(50, { amenity: "parking", name: "Mountain View Church" })])).toBeNull();
    expect(parkingFor(TH, [lot(50, { amenity: "parking", name: "Buffalo Mountaineers Club" })])).toBeNull();
  });

  it("a lot tagged trailhead or hiking, whatever its name", () => {
    expect(parkingFor(TH, [lot(100, { amenity: "parking", highway: "trailhead" })])).toEqual(north(100));
    expect(parkingFor(TH, [lot(100, { amenity: "parking", hiking: "yes", name: "Upper lot" })])).toEqual(
      north(100),
    );
  });

  it("not an untagged lot, nor one past 300 m; the nearest tagged one wins", () => {
    expect(parkingFor(TH, [lot(20, { amenity: "parking" })])).toBeNull(); // a state park's untagged lots
    expect(parkingFor(TH, [lot(320, { amenity: "parking", highway: "trailhead" })])).toBeNull();
    expect(
      parkingFor(TH, [lot(250, { highway: "trailhead" }), lot(90, { name: "Buffalo Mountain Trailhead" })]),
    ).toEqual(north(90));
  });
});
