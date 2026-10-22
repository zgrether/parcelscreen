/**
 * Climate at a spot (step 11, plan §2.2), on a synthetic 2×2 grid: a hollow and a ridge in one cell (the lapse rate),
 * a spot off the grid, and the station picked by distance and elevation together. Then the committed snapshot.
 */
import { describe, expect, it } from "vitest";
import {
  climateAt,
  loadClimate,
  stationFor,
  withClimate,
  type ClimateData,
  type ClimateStation,
} from "./climate";
import { SCREEN_CONSTANTS } from "./config";

const station = (id: string, lat: number, lon: number, elevFt: number): ClimateStation => ({
  id,
  name: `${id}, VA`,
  lat,
  lon,
  elevFt,
  snowIn: 20,
  lastFreeze: "04-25",
  firstFreeze: "10-15",
  frostFreeDays: 173,
});

/** Four 1/120° cells from 36.7 N, 81.0 W; each cell a 20 °F January low, an 82 °F July high, at 3,000 ft. */
const DATA: ClimateData = {
  grid: { west: -81, north: 36.7, cellDeg: 1 / 120, cols: 2, rows: 2 },
  janLowF10: Int16Array.from([200, 200, 200, -32768]),
  julHighF10: Int16Array.from([820, 820, 820, 820]),
  elevFt: Int16Array.from([3000, 3000, 3000, 3000]),
  stations: [
    // In the valley, 2 km off; and on a ridge 9 km off at the spot's height.
    station("VALLEY", 36.68, -80.98, 2000),
    station("RIDGE", 36.62, -80.99, 3500),
  ],
};
const IN = [36.698, -80.998] as const;

describe("climate at a spot", () => {
  it("a hollow is warmer and a ridge colder than the cell, at the lapse rate", () => {
    const lapse = SCREEN_CONSTANTS.climate.lapseFPer1000Ft;
    const hollow = climateAt(DATA, [...IN], 2500)!;
    const ridge = climateAt(DATA, [...IN], 3500)!;
    expect(hollow.janLowF).toBeCloseTo(20 + lapse / 2, 1);
    expect(ridge.janLowF).toBeCloseTo(20 - lapse / 2, 1);
    expect(ridge.julHighF).toBeCloseTo(82 - lapse / 2, 1);
    expect(climateAt(DATA, [...IN], 3000)).toMatchObject({ janLowF: 20, julHighF: 82 });
  });

  it("off the grid, or on an empty cell, there's no reading", () => {
    expect(climateAt(DATA, [36.8, -80.998], 3000)).toBeNull();
    expect(climateAt(DATA, [36.698, -81.01], 3000)).toBeNull();
    expect(climateAt(DATA, [36.69, -80.99], 3000)).toBeNull(); // the empty fourth cell
  });

  it("the station most like the spot: distance plus elevation difference, within reach", () => {
    // At 3,500 ft the ridge station's height outweighs the valley's nearness; at 2,000 ft the valley's.
    expect(stationFor(DATA.stations, [...IN], 3500)!.station.id).toBe("RIDGE");
    expect(stationFor(DATA.stations, [...IN], 2000)!.station.id).toBe("VALLEY");
    expect(stationFor(DATA.stations, [38, -80], 3000)).toBeNull();
    expect(climateAt(DATA, [...IN], 3500)).toMatchObject({ station: "RIDGE", stationMi: expect.any(Number) });
  });

  it("every spot read, the stations they name kept once, and outside when none is on the grid", () => {
    const site = (ll: [number, number], elevFt: number) => ({ ll, elevFt }) as never;
    const r = withClimate(DATA, { sites: [site([...IN], 3500), site([...IN], 3400)], house: null })!;
    expect(r.climate.outside).toBe(false);
    expect(r.climate.stations.map((x) => x.id)).toEqual(["RIDGE"]);
    expect(r.sites!.every((x) => x.climate)).toBe(true);
    const away = withClimate(DATA, { sites: [site([38, -80], 3000)] })!;
    expect(away.climate).toEqual({ outside: true, stations: [] });
    expect(withClimate(null, { sites: [] })).toBeNull();
  });

  it("the committed snapshot loads, and reads Mud Creek's site #1", async () => {
    const data = (await loadClimate())!;
    expect(data.stations.length).toBeGreaterThan(50);
    const c = climateAt(data, [36.5863, -81.5604], 3543)!;
    expect(c.janLowF).toBeGreaterThan(15);
    expect(c.janLowF).toBeLessThan(30);
    expect(c.julHighF).toBeGreaterThan(70);
    expect(c.julHighF).toBeLessThan(85);
    expect(c.station).not.toBeNull();
  });
});
