/**
 * Boulder potential (docs/plans/boulders.md): the soil names that mean boulders or rock, and the lidar texture on
 * synthetic 3 m surfaces: a smooth slope reads nothing, a boulder field on the same slope reads a patch, a cliff and a
 * drainage read nothing.
 */
import { describe, expect, it } from "vitest";
import { boulderSoils, boulderTerms, measureBoulders, roughness, roughPatches } from "./boulders";
import { llToRC } from "./dem";
import { slopeAspect } from "./terrain";
import type { Dem, SoilRow } from "./types";

describe("boulderTerms", () => {
  it("finds the words for boulders and rock, in a map unit's or a component's name", () => {
    expect(boulderTerms("Ashe-Chestnut complex, 25 to 45 percent slopes, very stony")).toEqual([
      "very stony",
    ]);
    expect(boulderTerms("Unicoi-Marbleyard complex, 35 to 55 percent slopes, extremely stony")).toEqual([
      "extremely stony",
    ]);
    expect(boulderTerms("Porters-Unaka complex, 30 to 50 percent slopes, extremely bouldery")).toEqual([
      "bouldery",
    ]);
    expect(boulderTerms("Cleveland-Rock outcrop complex, 30 to 95 percent slopes")).toEqual(["rock outcrop"]);
    expect(boulderTerms("Rubble land")).toEqual(["rubble land"]);
    expect(boulderTerms("Rubbly land-Rock outcrop complex")).toEqual(["rubbly", "rock outcrop"]);
    expect(boulderTerms("ROCK OUTCROP")).toEqual(["rock outcrop"]);
  });

  it("leaves plain stony, gravelly and ordinary soils alone", () => {
    expect(boulderTerms("Edneyville loam, 25 to 45 percent slopes, stony")).toEqual([]);
    expect(boulderTerms("Pigeonroost gravelly loam, 15 to 35 percent slopes")).toEqual([]);
    expect(boulderTerms("Tate loam, 7 to 15 percent slopes")).toEqual([]);
    expect(boulderTerms("Rockbridge silt loam")).toEqual([]);
    expect(boulderTerms(null)).toEqual([]);
  });
});

describe("boulderSoils", () => {
  const row = (mukey: string, compname: string) => ({ mukey, compname }) as unknown as SoilRow;
  const units = [
    { mukey: "1", muname: "Tate loam, 7 to 15 percent slopes", acres: 4 },
    { mukey: "2", muname: "Chandler-Ashe complex, 25 to 45 percent slopes", acres: 2 },
    { mukey: "3", muname: "Ashe-Chestnut complex, 25 to 45 percent slopes, very stony", acres: 6 },
  ];
  it("flags a unit by its name, or by a major component's (Rock outcrop in a complex), largest first", () => {
    const got = boulderSoils(units, [
      row("1", "Tate"),
      row("2", "Chandler"),
      row("2", "Rock outcrop"),
      row("3", "Ashe"),
    ]);
    expect(got.map((s) => [s.mukey, s.acres, s.terms])).toEqual([
      ["3", 6, ["very stony"]],
      ["2", 2, ["rock outcrop"]],
    ]);
  });
  it("is empty without map units", () => {
    expect(boulderSoils(null, [row("3", "Rock outcrop")])).toEqual([]);
  });
});

/** A 3 m grid, 60 × 60 cells (180 m), from a height function of column and row. */
function grid(f: (c: number, r: number) => number): Dem {
  const w = 60,
    h = 60;
  const d: Dem = {
    z: new Float32Array(w * h),
    w,
    h,
    x0: 500000,
    y0: 4060000,
    res: 3,
    resY: 3,
    source: "USGS 3DEP",
  };
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) d.z[r * w + c] = f(c, r);
  return d;
}
/** A steady 20° slope, rising eastward. */
const slopeZ = (c: number) => c * 3 * Math.tan((20 * Math.PI) / 180);
/** Deterministic boulders: heights 0–2 m, constant over 2 × 2 cells (a 6 m boulder), from a hash of the block. */
const boulder = (c: number, r: number) => {
  const k = Math.sin((c >> 1) * 12.9898 + (r >> 1) * 78.233) * 43758.5453;
  return 2 * (k - Math.floor(k));
};
const all = (d: Dem) => new Uint8Array(d.w * d.h).fill(1);
const read = (d: Dem) => roughPatches(d, slopeAspect(d).slope, all(d));

describe("the lidar texture", () => {
  it("reads a smooth slope as smooth, however steep", () => {
    const d = grid((c) => slopeZ(c));
    const r = roughness(d);
    const readable = [...r].filter((v) => !Number.isNaN(v));
    expect(readable.length).toBeGreaterThan(2000);
    expect(Math.max(...readable)).toBeLessThan(0.01);
    expect(read(d).patches).toEqual([]);
  });

  it("finds a boulder field on the same slope: one patch over the boulders, about their acres", () => {
    // Boulders over columns and rows 15–44 (90 m square, 2.0 ac).
    const d = grid((c, r) => slopeZ(c) + (c >= 15 && c < 45 && r >= 15 && r < 45 ? boulder(c, r) : 0));
    const { patches, acres } = read(d);
    expect(patches).toHaveLength(1);
    expect(acres).toBeGreaterThan(1.5);
    expect(acres).toBeLessThan(2.6);
    expect(patches[0]!.outline.geometry.type).toBe("Polygon");
    // The patch's centre is the field's.
    const [r, c] = llToRC(d, ...patches[0]!.ll);
    expect(Math.abs(r - 29.5)).toBeLessThan(3);
    expect(Math.abs(c - 29.5)).toBeLessThan(3);
  });

  it("leaves a cliff alone: a 10 m rock step is not a boulder field", () => {
    const d = grid((c) => slopeZ(c) + (c >= 30 ? 10 : 0));
    expect(read(d).patches).toEqual([]);
  });

  it("leaves a drainage alone: a rough channel bed below the slopes around it", () => {
    // A 4 m deep, 15 m wide channel down the middle, its bed bouldery.
    const d = grid((c, r) => {
      const fromAxis = Math.abs(c - 30);
      const channel =
        fromAxis < 3 ? -4 + boulder(c, r) * 0.6 : fromAxis < 6 ? -4 + (fromAxis - 3) * (4 / 3) : 0;
      return r * 0.5 + channel;
    });
    expect(read(d).patches).toEqual([]);
  });
});

describe("measureBoulders", () => {
  it("counts a cell once whether it's in a flagged soil, a rough patch or both; the soils alone without a grid", () => {
    const soilsOnly = measureBoulders(
      [{ mukey: "3", muname: "Ashe-Chestnut complex, very stony", acres: 6, geos: [] }],
      [],
      null,
    );
    expect(soilsOnly).toMatchObject({ acres: 6, soilAcres: 6, rough: null });
    const d = grid((c, r) => slopeZ(c) + (c >= 15 && c < 45 && r >= 15 && r < 45 ? boulder(c, r) : 0));
    const both = measureBoulders(null, [], { d, slope: slopeAspect(d).slope, inside: all(d) });
    expect(both.acres).toBeCloseTo(both.rough!.acres, 6);
    expect(both.soils).toEqual([]);
  });
});
