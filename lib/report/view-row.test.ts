/**
 * The Long view row (step 11, plan §2.4): the share of the horizon open past 3 mi at the card's site; its line;
 * "not measured" on a screen made before it; question 3 in saved priorities.
 */
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { defaultRubric } from "../rubric/default";
import { withFactor } from "../rubric/factorsAdd";
import type { Rubric } from "../rubric/types";
import type { ScreenResult } from "../screen/types";
import { cardFacts } from "./card";
import { NOT_MEASURED } from "./climate";
import { viewLine } from "./view";

const MUD = expectedOf("grayson-mud-creek-6273", "run");

function withSites(openShare: number, longestKm = 6, past = true, dirDeg: number | null = 315): ScreenResult {
  const r = structuredClone(MUD);
  for (const s of r.sites!) s.view = { longestKm, past, openShare, dirDeg };
  return r;
}
const rowOf = (r: ScreenResult) => cardFacts(r).rows.find((x) => x.key === "longView")!;

describe("the Long view row", () => {
  it("grades the open share on the starting list's band: A from 25%, B 15, C 8, D 3", () => {
    const at = (share: number) => rowOf(withSites(share)).grade;
    expect([at(0.3), at(0.15), at(0.1), at(0.05), at(0)]).toEqual(["A", "B", "C", "D", "F"]);
    expect(rowOf(withSites(0.22)).measure).toEqual({ value: 22, unit: "%" });
  });

  it("says the share, its direction, and the longest", () => {
    expect(rowOf(withSites(0.22)).detail).toBe(
      "the view opens past 3 mi over 22% of the horizon, toward the NW; the longest reaches farther than 3.7 mi (as far as the app measures)",
    );
    expect(viewLine({ longestKm: 3.31, past: false, openShare: 0, dirDeg: null })).toBe(
      "no view past 3 mi; the longest 2.1 mi",
    );
    expect(viewLine({ longestKm: 6, past: true, openShare: 1, dirDeg: null })).toBe(
      "the view opens past 3 mi over 100% of the horizon, all around; the longest reaches farther than 3.7 mi (as far as the app measures)",
    );
    expect(rowOf(withSites(0.22)).short).toBe("22% open, farther than 3.7 mi");
  });

  it("a screen made before it: not measured, never incomplete", () => {
    const old = structuredClone(MUD);
    for (const s of old.sites!) delete s.view;
    expect(rowOf(old)).toMatchObject({ grade: null, detail: NOT_MEASURED });
    expect(rowOf(old).missing).toBeUndefined();
  });
});

describe("Long view in saved priorities (plan §5)", () => {
  const SAVED: Rubric = {
    ...defaultRubric(),
    weights: { mode: "rankSum" },
    ranked: [
      { factor: "elevation", tier: "should" },
      { factor: "garden", tier: "could" },
    ],
    wonts: ["room"],
  };
  const order = (r: Rubric) => r.ranked.map((c) => `${c.factor}:${c.tier}`);

  it("view: the bottom of Really want; both: the bottom of Nice to have; sun, neither or none: Don't care", () => {
    expect(order(withFactor(SAVED, "longView", { sunView: "view" })!)).toEqual([
      "elevation:should",
      "longView:should",
      "garden:could",
    ]);
    expect(order(withFactor(SAVED, "longView", { sunView: "both" })!).at(-1)).toBe("longView:could");
    for (const sunView of ["sun", "neither", undefined] as const)
      expect(withFactor(SAVED, "longView", sunView ? { sunView } : {})!.wonts).toEqual(["room", "longView"]);
  });
});
