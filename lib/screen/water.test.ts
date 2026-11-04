/** Water on the land (docs/plans/water.md §1c): each map unit's soil water, from the rows and the soil-water query. */
import { describe, expect, it } from "vitest";
import type { SoilUnit } from "./soils";
import type { SoilRow } from "./types";
import { erode, soilWater } from "./water";

const unit = (mukey: string, muname: string, acres: number) =>
  ({ mukey, muname, acres, geos: [], color: "#000" }) as SoilUnit;
const row = (mukey: string, comppct_r: string, o: Record<string, string | null>) =>
  ({ mukey, comppct_r, ...o }) as unknown as SoilRow;

describe("soilWater", () => {
  it("the dominant component's drainage, water table and group; the query's water and organic matter", () => {
    const got = soilWater(
      [unit("1", "Codorus loam, 0 to 3 percent slopes", 4), unit("2", "Tate loam", 2)],
      [
        row("1", "85", { drclassdcd: "Somewhat poorly drained", wtdepannmin: "46", hydgrpdcd: "B/D" }),
        row("1", "10", { drclassdcd: "Somewhat poorly drained", wtdepannmin: "46", hydgrpdcd: "B/D" }),
        row("2", "90", { drclassdcd: "Well drained", wtdepannmin: null, hydgrpdcd: "B" }),
      ],
      new Map([
        ["1", { awsCm: 20.32, omPct: 3.04 }],
        ["2", { awsCm: null, omPct: null }],
      ]),
    );
    expect(got).toEqual([
      {
        mukey: "1",
        name: "Codorus loam, 0 to 3 percent slopes",
        acres: 4,
        awcIn: 8,
        drainage: "Somewhat poorly drained",
        waterTableIn: 18,
        hydGroup: "B/D",
        omPct: 3,
      },
      {
        mukey: "2",
        name: "Tate loam",
        acres: 2,
        awcIn: null,
        drainage: "Well drained",
        waterTableIn: null,
        hydGroup: "B",
        omPct: null,
      },
    ]);
  });
  it("is empty without map units, and the query's values are null when it didn't answer", () => {
    expect(soilWater(null, [], null)).toEqual([]);
    expect(soilWater([unit("1", "Tate loam", 2)], [], null)[0]).toMatchObject({ awcIn: null, omPct: null });
  });
});

describe("erode", () => {
  const grid = (rows: string[]) => Uint8Array.from(rows.join("").split(""), (ch) => (ch === "#" ? 1 : 0));
  it("shrinks a block by a cell per step, so a path that only clips the edge misses the core", () => {
    const m = grid(["......", ".####.", ".####.", ".####.", ".####.", "......"]);
    expect(Array.from(erode(m, 6, 6, 1))).toEqual(
      Array.from(grid(["......", "......", "..##..", "..##..", "......", "......"])),
    );
  });
  it("keeps the mask when shrinking would leave nothing", () => {
    const m = grid(["....", ".##.", ".##.", "...."]);
    expect(Array.from(erode(m, 4, 4, 2))).toEqual(Array.from(erode(m, 4, 4, 1)));
  });
});
