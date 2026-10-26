/** A trailhead's parking (follow-up 54, by follow-up 39's rule): within 300 m and tagged for it, else the point. */
import { describe, expect, it } from "vitest";
import { cellsWithin, type PlacesSource } from "./placeData";
import { parkingFor, parkingFromPlaces, parkingQuery, type ParkingLot } from "./trailheadParking";
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
});

describe("the baked lots (step 14d)", () => {
  it("are read from the OSM cells within a kilometre of each point, with what parkingFor reads", async () => {
    const asked: string[][] = [];
    const places: PlacesSource = async (_folder, cells) => {
      asked.push([...cells]);
      return [
        {
          kind: "parking",
          id: "osm:way/1",
          ll: north(12),
          src: "osm",
          name: "Buffalo Mountain Trailhead Parking",
        },
        { kind: "parking", id: "osm:node/2", ll: north(100), src: "osm", hiking: true },
        { kind: "grocer", id: "osm:node/3", name: "Food Lion", ll: north(5), src: "osm", big: true },
      ];
    };
    const lots = await parkingFromPlaces(places)([TH.ll]);
    expect(asked).toEqual([cellsWithin(TH.ll, 1)]);
    expect(lots).toEqual([
      { ll: north(12), tags: { name: "Buffalo Mountain Trailhead Parking" } },
      { ll: north(100), tags: { hiking: "yes" } },
    ]);
    expect(parkingFor(TH, lots)).toEqual(north(12));
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
