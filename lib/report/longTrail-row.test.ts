/**
 * The Bike to a long trail row (step 11, plan §2.6): the drive to the nearest access point; none within reach; not
 * measured; the drives unknown; question 4 in saved priorities.
 */
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { defaultRubric } from "../rubric/default";
import { withFactor } from "../rubric/factorsAdd";
import type { Rubric } from "../rubric/types";
import { LONG_TRAIL_DRIVES } from "../screen/longTrail";
import type { ScreenResult } from "../screen/types";
import { cardFacts } from "./card";
import { NOT_MEASURED } from "./climate";

const MUD = expectedOf("grayson-mud-creek-6273", "run");
const rowOf = (r: ScreenResult) => cardFacts(r).rows.find((x) => x.key === "longTrail")!;
const at = (min: number): ScreenResult => ({
  ...structuredClone(MUD),
  longTrail: { trail: "New River Trail", point: "Fries", min, mi: min / 2 },
});

describe("the Bike to a long trail row", () => {
  it("grades the drive: A within 10 min, B 20, C 35, D 50", () => {
    expect([8, 20, 30, 45, 60].map((m) => rowOf(at(m)).grade)).toEqual(["A", "B", "C", "D", "F"]);
    expect(rowOf(at(24))).toMatchObject({
      detail: "a 24-minute drive to the New River Trail at Fries",
      short: "New River 24 min",
      measure: { value: 24, unit: "min" },
    });
  });

  it("none within reach is an F; a screen made before it is not measured; the drives unknown say so", () => {
    expect(rowOf({ ...structuredClone(MUD), longTrail: null })).toMatchObject({
      grade: "F",
      detail: "no long trail within reach",
    });
    const old = structuredClone(MUD);
    delete old.longTrail;
    expect(rowOf(old)).toMatchObject({ grade: null, detail: NOT_MEASURED });
    expect(rowOf(old).missing).toBeUndefined();
    const down = { ...structuredClone(old), noResponse: [LONG_TRAIL_DRIVES] };
    expect(rowOf(down)).toMatchObject({ grade: null, missing: "the drive times" });
  });
});

describe("Bike to a long trail in saved priorities (plan §5)", () => {
  const SAVED: Rubric = {
    ...defaultRubric(),
    weights: { mode: "rankSum" },
    ranked: [
      { factor: "elevation", tier: "should" },
      { factor: "garden", tier: "could" },
    ],
    wonts: [],
  };

  it("bike from home: the bottom of Really want at 10 min; any other answer, or none: Don't care", () => {
    const bike = withFactor(SAVED, "longTrail", { trails: "bike" })!;
    expect(bike.ranked.map((c) => `${c.factor}:${c.tier}`)).toEqual([
      "elevation:should",
      "longTrail:should",
      "garden:could",
    ]);
    expect(bike.bands.longTrailMin[1]).toBe(10);
    for (const trails of ["door", "drive", "none", undefined] as const)
      expect(withFactor(SAVED, "longTrail", trails ? { trails } : {})!.wonts).toEqual(["longTrail"]);
  });
});
