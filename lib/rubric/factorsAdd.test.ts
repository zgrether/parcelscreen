/** Step 11's new factors added once to saved priorities (plan §1, §5): Hospital takes Town's place (§2.1). */
import { describe, expect, it } from "vitest";
import { defaultRubric, rubricFromWeights } from "./default";
import { NEW_FACTORS, withFactor, withNewFactors, withoutFactor } from "./factorsAdd";
import type { Rubric, RowKey } from "./types";
import { weightsOf } from "./weights";
import { SCREEN_CONSTANTS } from "../screen/config";

/** The starting list as saved before step 11: Town at 5, graded on the ER and the groceries; no Hospital. */
const OLD_WEIGHTS = { ...SCREEN_CONSTANTS.card.weights.default, town: 5, hospital: 0 };
const OLD_START: Rubric = (() => {
  const r = rubricFromWeights(OLD_WEIGHTS);
  return { ...r, wonts: r.wonts.filter((k) => !(NEW_FACTORS as readonly string[]).includes(k)) };
})();

/** A rank-sum list saved before step 11, Town in Really want with an ER limit. */
const SAVED: Rubric = {
  ...defaultRubric(),
  weights: { mode: "rankSum" },
  musts: [...defaultRubric().musts, { factor: "town", threshold: 40 }],
  ranked: [
    { factor: "trails", tier: "should" },
    { factor: "town", tier: "should" },
    { factor: "elevation", tier: "should" },
    { factor: "garden", tier: "could" },
  ],
  wonts: ["room", "sky"],
};
const order = (r: Rubric) => r.ranked.map((c) => `${c.factor}:${c.tier}`);

describe("Hospital, split from Town (plan §2.1)", () => {
  it("on rank-sum: just after Town in its tier, Town's ER limit moved to it; nothing else moves", () => {
    const r = withFactor(SAVED, "hospital")!;
    expect(order(r)).toEqual([
      "trails:should",
      "town:should",
      "hospital:should",
      "elevation:should",
      "garden:could",
    ]);
    expect(r.musts.at(-1)).toEqual({ factor: "hospital", threshold: 40 });
    expect(r.musts.slice(0, -1)).toEqual(SAVED.musts.slice(0, -1));
    expect(r.wonts).toEqual(SAVED.wonts);
    expect(r.bands).toEqual(SAVED.bands);
  });

  it("Town in Don't care: Hospital joins it there", () => {
    const off: Rubric = {
      ...SAVED,
      ranked: SAVED.ranked.filter((c) => c.factor !== "town"),
      wonts: ["town"],
    };
    expect(withFactor(off, "hospital")!.wonts).toEqual(["town", "hospital"]);
    expect(order(withFactor(off, "hospital")!)).toEqual(order(off));
  });

  it("the starting list as saved before it becomes today's starting list, and grades the same", () => {
    const r = withNewFactors(OLD_START, {}).rubric;
    expect(r).toEqual(defaultRubric());
    const w = weightsOf(r) as Record<RowKey, number>;
    expect([w.hospital, w.town]).toEqual([5, 0]);
  });

  it("once: a rubric that places it already gets nothing", () => {
    expect(withFactor(defaultRubric(), "hospital")).toBeNull();
    expect(withFactor(withFactor(SAVED, "hospital")!, "hospital")).toBeNull();
    expect(withNewFactors(SAVED, { hospital: "undone" }).added).not.toContain("hospital");
    expect(withNewFactors(SAVED, {}).added).toEqual(NEW_FACTORS);
  });

  it("Undo: Hospital to Don't care; on the starting list, Town's weight and card come back", () => {
    const back = withoutFactor(withFactor(SAVED, "hospital")!, "hospital");
    expect(order(back)).toEqual(order(SAVED));
    expect(back.wonts).toEqual([...SAVED.wonts, "hospital"]);
    // The limit is the person's own: it stays, on Hospital.
    expect(back.musts.at(-1)).toEqual({ factor: "hospital", threshold: 40 });
    const start = withoutFactor(defaultRubric(), "hospital");
    expect(order(start)).toEqual(order(OLD_START));
    expect(weightsOf(start)).toMatchObject({ town: 5, hospital: 0 });
    expect(start.wonts).toEqual(["driveway", "climate", "privacy", "longView", "airport", "hospital"]);
  });
});
