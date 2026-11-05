/** Uses' Boulders line (docs/plans/boulders.md §2): the readings it names, its detail, and nothing for an older grade. */
import { describe, expect, it } from "vitest";
import { expectedOf } from "../../test/support/expected";
import type { ScreenResult } from "../screen/types";
import { bouldersView } from "./boulders";

type B = NonNullable<ScreenResult["boulders"]>;
const patch = { ll: [36.6, -81.5] as [number, number], acres: 0.3, outline: null as never };

describe("bouldersView", () => {
  const soil = { mukey: "1", name: "Porters loam, very bouldery", acres: 3, terms: ["very bouldery"] };
  it("leads with the likely acres, where both readings agree, then the possible ones", () => {
    const both: B = {
      acres: 3.24,
      likelyAcres: 0.42,
      soilAcres: 3,
      soils: [soil],
      stony: [],
      rough: { acres: 0.6, patches: [patch, patch] },
    };
    expect(bouldersView(both)).toEqual({
      line: "Likely boulders (for bouldering): 0.4 ac; possible boulder ground: 2.8 ac more (bouldery soils, rough lidar texture)",
      found: true,
      lines: [
        "Likely boulders: 0.4 ac, where a bouldery soil and rough lidar texture overlap",
        "Porters loam, very bouldery: 3.0 ac (very bouldery)",
        "Rough lidar texture: 0.6 ac in 2 patches",
      ],
    });
    expect(bouldersView({ ...both, acres: 0.42 })!.line).toBe(
      "Likely boulders (for bouldering): 0.4 ac (bouldery soils, rough lidar texture)",
    );
  });

  it("says possible when only one reading found something, naming only it", () => {
    const one: B = {
      acres: 0.6,
      likelyAcres: 0,
      soilAcres: 0,
      soils: [],
      stony: [],
      rough: { acres: 0.6, patches: [patch, patch] },
    };
    expect(bouldersView(one)!.line).toBe(
      "Possible boulder ground (for bouldering): 0.6 ac (rough lidar texture)",
    );
    expect(
      bouldersView({ ...one, acres: 3, soilAcres: 3, soils: [soil], rough: { acres: 0, patches: [] } })!.line,
    ).toBe("Possible boulder ground (for bouldering): 3.0 ac (bouldery soils)");
  });

  it("lists stony units apart, as rocks, not climbing boulders, and never counts them", () => {
    const v = bouldersView({
      acres: 0,
      likelyAcres: 0,
      soilAcres: 0,
      soils: [],
      stony: [
        { mukey: "3", name: "Ashe-Chestnut complex, very stony", acres: 6, terms: ["very stony"] },
        { mukey: "5", name: "Edneyville loam, stony", acres: 1.25, terms: ["stony"] },
      ],
      rough: { acres: 0, patches: [] },
    })!;
    expect(v.line).toBe("No sign of boulder ground");
    expect(v.lines.at(-1)).toBe(
      "Stony ground: rocks, not climbing boulders (Ashe-Chestnut complex, very stony, 6.0 ac; Edneyville loam, stony, 1.3 ac)",
    );
  });

  it("says when neither found anything, or when there was no lidar to read", () => {
    const none: B = {
      acres: 0,
      likelyAcres: 0,
      soilAcres: 0,
      soils: [],
      stony: [],
      rough: { acres: 0, patches: [] },
    };
    expect(bouldersView(none)).toEqual({
      line: "No sign of boulder ground",
      found: false,
      lines: ["Rough lidar texture: none found"],
    });
    expect(bouldersView({ ...none, rough: null })!.lines).toEqual([
      "No 3 m lidar here: only the soil maps were read.",
    ]);
  });

  it("shows nothing for a grade from before the measurement", () => {
    expect(bouldersView(undefined)).toBeNull();
  });

  it("Macks Mountain: its two rough patches; its extremely stony soils apart", () => {
    const v = bouldersView(expectedOf("macks-mountain-35-3", "run").boulders)!;
    expect(v.line).toBe("Possible boulder ground (for bouldering): 0.6 ac (rough lidar texture)");
    expect(v.lines[0]).toBe("Rough lidar texture: 0.6 ac in 2 patches");
    expect(v.lines.at(-1)).toMatch(/^Stony ground: rocks, not climbing boulders \(Unicoi-Marbleyard complex/);
  });
});
