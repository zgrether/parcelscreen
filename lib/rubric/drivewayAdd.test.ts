/** The Driveway row added once to priorities saved before step 7 (owner, #216): add-only, in question 10's tier. */
import { describe, expect, it } from "vitest";
import { defaultRubric } from "./default";
import { drivewayTier, withDriveway, withoutDriveway } from "./drivewayAdd";
import type { Rubric } from "./types";
import { weightsOf } from "./weights";

/** A rank-sum rubric as saved before step 7: Driveway in no list, three Really want and two Nice to have. */
const SAVED: Rubric = {
  ...defaultRubric(),
  weights: { mode: "rankSum" },
  ranked: [
    { factor: "trails", tier: "should" },
    { factor: "sky", tier: "should" },
    { factor: "elevation", tier: "should" },
    { factor: "homesite", tier: "could" },
    { factor: "garden", tier: "could" },
  ],
  wonts: ["room", "town"],
};

describe("adding the Driveway row to saved priorities", () => {
  it("Long and gentle: the bottom of Really want, at 15%", () => {
    expect(drivewayTier("gentle")).toBe("should");
    const r = withDriveway(SAVED, "gentle")!;
    expect(r.ranked.map((c) => `${c.factor}:${c.tier}`)).toEqual([
      "trails:should",
      "sky:should",
      "elevation:should",
      "driveway:should",
      "homesite:could",
      "garden:could",
    ]);
    expect(r.bands.drivewayPct).toEqual([10, 15, 20, 25]);
  });

  it("Short and steep, and We'll build it: the bottom of Nice to have, at their edges", () => {
    expect(withDriveway(SAVED, "steep")!.ranked.at(-1)).toEqual({ factor: "driveway", tier: "could" });
    expect(withDriveway(SAVED, "steep")!.bands.drivewayPct).toEqual([15, 20, 25, 30]);
    expect(withDriveway(SAVED, "build")!.bands.drivewayPct).toEqual([7, 12, 17, 22]);
  });

  it("unanswered: the bottom of Nice to have, at the starting list's 15%", () => {
    const r = withDriveway(SAVED, undefined)!;
    expect(r.ranked.at(-1)).toEqual({ factor: "driveway", tier: "could" });
    expect(r.bands.drivewayPct).toEqual([10, 15, 20, 25]);
  });

  it("nothing else moves: every other card, limit, band and Don't care stays", () => {
    const r = withDriveway(
      { ...SAVED, musts: [...SAVED.musts, { factor: "elevation", threshold: 2500 }] },
      "steep",
    )!;
    expect(r.ranked.filter((c) => c.factor !== "driveway")).toEqual(SAVED.ranked);
    expect(r.wonts).toEqual(SAVED.wonts);
    expect(r.musts.at(-1)).toEqual({ factor: "elevation", threshold: 2500 });
    expect({ ...r.bands, drivewayPct: SAVED.bands.drivewayPct }).toEqual(SAVED.bands);
    expect(weightsOf(r).driveway).toBeGreaterThan(0);
  });

  it("nothing to add: it's already ranked, or it's the starting list's explicit weights", () => {
    expect(withDriveway(withDriveway(SAVED, "gentle")!, "gentle")).toBeNull();
    expect(withDriveway(defaultRubric(), "gentle")).toBeNull();
  });

  it("the note's Undo puts it back in Don't care, the rest as it was", () => {
    const back = withoutDriveway(withDriveway(SAVED, "gentle")!);
    expect(back.ranked).toEqual(SAVED.ranked);
    expect(back.wonts).toEqual([...SAVED.wonts, "driveway"]);
  });
});
