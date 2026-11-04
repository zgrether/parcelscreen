/** Uses' Boulders line (docs/plans/boulders.md §2): the readings it names, its detail, and nothing for an older grade. */
import { describe, expect, it } from "vitest";
import { expectedOf } from "../../test/support/expected";
import type { ScreenResult } from "../screen/types";
import { bouldersView } from "./boulders";

type B = NonNullable<ScreenResult["boulders"]>;
const patch = { ll: [36.6, -81.5] as [number, number], acres: 0.3, outline: null as never };

describe("bouldersView", () => {
  it("names only the readings that found something", () => {
    const both: B = {
      acres: 3.24,
      soilAcres: 3,
      soils: [{ mukey: "1", name: "Ashe-Chestnut complex, very stony", acres: 3, terms: ["very stony"] }],
      rough: { acres: 0.6, patches: [patch, patch] },
    };
    expect(bouldersView(both)).toEqual({
      line: "Possible boulder ground: 3.2 ac (bouldery soils, rough lidar texture)",
      found: true,
      lines: [
        "Ashe-Chestnut complex, very stony: 3.0 ac (very stony)",
        "Rough lidar texture: 0.6 ac in 2 patches",
      ],
    });
    expect(bouldersView({ ...both, soils: [], soilAcres: 0, acres: 0.6 })!.line).toBe(
      "Possible boulder ground: 0.6 ac (rough lidar texture)",
    );
  });

  it("says when neither found anything, or when there was no lidar to read", () => {
    expect(bouldersView({ acres: 0, soilAcres: 0, soils: [], rough: { acres: 0, patches: [] } })).toEqual({
      line: "No sign of boulder ground",
      found: false,
      lines: ["Rough lidar texture: none found"],
    });
    expect(bouldersView({ acres: 0, soilAcres: 0, soils: [], rough: null })!.lines).toEqual([
      "No 3 m lidar here: only the soil maps were read.",
    ]);
  });

  it("shows nothing for a grade from before the measurement", () => {
    expect(bouldersView(undefined)).toBeNull();
  });

  it("Macks Mountain: its stony soils and its two rough patches", () => {
    const v = bouldersView(expectedOf("macks-mountain-35-3", "run").boulders)!;
    expect(v.line).toBe("Possible boulder ground: 237 ac (bouldery soils, rough lidar texture)");
    expect(v.lines.at(-1)).toBe("Rough lidar texture: 0.6 ac in 2 patches");
  });
});
