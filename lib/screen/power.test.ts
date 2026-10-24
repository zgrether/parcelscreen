/** Power lines (step 14 plan §2.1): the distance, a crossing and its length inside, the voltage, OSM as the fallback. */
import { polygon } from "@turf/turf";
import { describe, expect, it } from "vitest";
import { CancelledError } from "../http";
import {
  feetToNearestLine,
  findPower,
  hifldLines,
  measurePower,
  parseOsmPower,
  type PowerFound,
} from "./power";
import { M2FT } from "./util";

// A square about 222 m north-south at 36.6 N.
const S = 0.002;
const parcel = polygon([
  [
    [-81.5, 36.6],
    [-81.5 + S, 36.6],
    [-81.5 + S, 36.6 + S],
    [-81.5, 36.6 + S],
    [-81.5, 36.6],
  ],
]);
const mPerDegLon = 111_320 * Math.cos((36.601 * Math.PI) / 180);
const found = (lines: PowerFound["lines"], source: PowerFound["source"] = "hifld"): PowerFound => ({
  source,
  date: "2023-01-01",
  lines,
});
// A north-south line 0.001 degrees east of the east edge (about 89 m).
const east = {
  kV: 138,
  owner: "AEP",
  coords: [
    [-81.5 + S + 0.001, 36.59],
    [-81.5 + S + 0.001, 36.61],
  ] as [number, number][],
};
// One straight through the middle, north to south.
const through = {
  kV: null,
  owner: null,
  coords: [
    [-81.499, 36.59],
    [-81.499, 36.61],
  ] as [number, number][],
};

describe("power lines near a parcel", () => {
  it("a line beside it: its distance from the boundary and its voltage; it doesn't cross", () => {
    const m = measurePower(found([east]), parcel);
    expect(m.crosses).toBe(false);
    expect(m.insideFt).toBe(0);
    expect(Math.abs(m.nearestFt! - 0.001 * mPerDegLon * M2FT)).toBeLessThan(5);
    expect(m.nearestKV).toBe(138);
    expect(m.lines).toHaveLength(1); // within keepKm
  });

  it("a line through it: crosses, about the parcel's depth inside, the nearest at 0 ft", () => {
    const m = measurePower(found([east, through]), parcel);
    expect(m.crosses).toBe(true);
    expect(m.nearestFt).toBe(0);
    expect(m.nearestKV).toBeNull(); // the crossing line's voltage isn't known
    const depthFt = S * 111_200 * M2FT;
    expect(m.insideFt).toBeGreaterThan(depthFt * 0.95);
    expect(m.insideFt).toBeLessThan(depthFt * 1.05);
  });

  it("none at all: nothing near, nothing kept", () => {
    expect(measurePower(found([]), parcel)).toMatchObject({ nearestFt: null, crosses: false, lines: [] });
  });

  it("a line beyond keepKm counts for the nearest distance but isn't kept", () => {
    const far = {
      kV: 69,
      owner: null,
      coords: [
        [-81.47, 36.59],
        [-81.47, 36.61],
      ] as [number, number][],
    };
    const m = measurePower(found([far]), parcel);
    expect(m.lines).toEqual([]);
    expect(m.nearestFt).toBeGreaterThan(1000 * M2FT);
  });

  it("a house site's distance to the nearest kept line", () => {
    const d = feetToNearestLine([36.601, -81.499], [east])!;
    expect(d.kV).toBe(138);
    expect(Math.abs(d.ft - (S + 0.001 - 0.001) * mPerDegLon * M2FT)).toBeLessThan(5);
  });
});

describe("OSM's power lines", () => {
  it("voltage in volts, several values: the highest, in kV; the operator as the owner", () => {
    const f = parseOsmPower([
      {
        type: "way",
        tags: { power: "line", voltage: "138000;69000", operator: "Appalachian Power" },
        geometry: [
          { lat: 36.6, lon: -81.5 },
          { lat: 36.61, lon: -81.5 },
        ],
      },
      {
        type: "way",
        tags: { power: "line" },
        geometry: [
          { lat: 36.6, lon: -81.49 },
          { lat: 36.61, lon: -81.49 },
        ],
      },
      { type: "node", id: 1 },
    ]);
    expect(f.source).toBe("osm");
    expect(f.lines.map((l) => [l.kV, l.owner])).toEqual([
      [138, "Appalachian Power"],
      [null, null],
    ]);
  });
});

describe("HIFLD first, OSM when it has none or fails", () => {
  const osm = found([through], "osm");
  const failing = (msg: string) => async (): Promise<PowerFound> => {
    throw new Error(msg);
  };

  it("HIFLD with lines: HIFLD's", async () => {
    const f = await findPower(
      parcel,
      [36.6, -81.5],
      async () => found([east]),
      async () => osm,
    );
    expect(f.source).toBe("hifld");
  });

  it("HIFLD empty, or failing: OSM's", async () => {
    expect(
      (
        await findPower(
          parcel,
          [36.6, -81.5],
          async () => found([]),
          async () => osm,
        )
      ).source,
    ).toBe("osm");
    expect((await findPower(parcel, [36.6, -81.5], failing("HIFLD 503"), async () => osm)).source).toBe(
      "osm",
    );
  });

  it("both failing: HIFLD's error; a cancel is a cancel", async () => {
    await expect(findPower(parcel, [36.6, -81.5], failing("HIFLD 503"), failing("down"))).rejects.toThrow(
      "HIFLD 503",
    );
    const cancelled = async (): Promise<PowerFound> => {
      throw new CancelledError();
    };
    await expect(findPower(parcel, [36.6, -81.5], cancelled, async () => osm)).rejects.toBeInstanceOf(
      CancelledError,
    );
  });
});

describe("HIFLD's answer", () => {
  it("lines with their voltage, no owner (not asked for); out-of-service lines left out", async () => {
    const answer = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
            VOLTAGE: 765,
            OWNER: "[redacted]",
            STATUS: "IN SERVICE",
            SOURCEDATE: Date.UTC(2014, 5, 17),
          },
          geometry: {
            type: "LineString",
            coordinates: [
              [-81.5, 36.59],
              [-81.5, 36.61],
            ],
          },
        },
        {
          type: "Feature",
          properties: {
            VOLTAGE: -999999,
            OWNER: "APPALACHIAN POWER CO",
            STATUS: "IN SERVICE",
            SOURCEDATE: null,
          },
          geometry: {
            type: "MultiLineString",
            coordinates: [
              [
                [-81.49, 36.59],
                [-81.49, 36.61],
              ],
            ],
          },
        },
        {
          type: "Feature",
          properties: { VOLTAGE: 138, OWNER: "X", STATUS: "NOT IN SERVICE" },
          geometry: {
            type: "LineString",
            coordinates: [
              [-81.48, 36.59],
              [-81.48, 36.61],
            ],
          },
        },
      ],
    };
    const http = { fetch: async () => Response.json(answer) };
    const f = await hifldLines("https://example.org/FeatureServer/0", parcel, { http });
    expect(f.source).toBe("hifld");
    expect(f.date).toBe("2014-06-17");
    expect(f.lines.map((l) => [l.kV, l.owner])).toEqual([
      [765, null],
      [null, null],
    ]);
  });
});
