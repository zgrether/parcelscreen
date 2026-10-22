/**
 * The Internet row (step 11, plan §2.7): the dish spot's clear share and its distance from the card's site; "not
 * measured" on a screen made before it; question 7 in saved priorities.
 */
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { defaultRubric } from "../rubric/default";
import { withFactor } from "../rubric/factorsAdd";
import type { Rubric } from "../rubric/types";
import type { ScreenResult } from "../screen/types";
import { cardFacts } from "./card";
import { NOT_MEASURED } from "./climate";

const MUD = expectedOf("grayson-mud-creek-6273", "run");
const rowOf = (r: ScreenResult) => cardFacts(r).rows.find((x) => x.key === "internet")!;
const at = (clearShare: number): ScreenResult => ({
  ...structuredClone(MUD),
  dish: { ll: MUD.sites![0]!.ll, clearShare },
});

describe("the Internet row", () => {
  it("grades the clear share: A from 95%, B 85, C 70, D 50", () => {
    expect([0.97, 0.9, 0.75, 0.6, 0.4].map((x) => rowOf(at(x)).grade)).toEqual(["A", "B", "C", "D", "F"]);
    expect(rowOf(at(0.9))).toMatchObject({
      detail: "the best spot for a satellite dish is 90% clear, 0 ft from site #1 (trees not counted)",
      short: "dish 90% clear",
      measure: { value: 90, unit: "%" },
    });
    expect(rowOf(MUD).detail).toMatch(
      /^the best spot for a satellite dish is 100% clear, \d+ ft from site #1/,
    );
  });

  it("a screen made before it: not measured; no spot read: ungraded", () => {
    const old = structuredClone(MUD);
    delete old.dish;
    expect(rowOf(old)).toMatchObject({ grade: null, detail: NOT_MEASURED });
    expect(rowOf(old).missing).toBeUndefined();
    expect(rowOf({ ...structuredClone(MUD), dish: null }).grade).toBeNull();
  });
});

describe("Internet in saved priorities (plan §5)", () => {
  const SAVED: Rubric = {
    ...defaultRubric(),
    weights: { mode: "rankSum" },
    ranked: [
      { factor: "elevation", tier: "should" },
      { factor: "garden", tier: "could" },
    ],
    wonts: [],
  };
  const order = (r: Rubric) => r.ranked.map((c) => `${c.factor}:${c.tier}`);

  it("Nice to have by default; video calls from home: Really want; the starting list's weights: Don't care", () => {
    expect(order(withFactor(SAVED, "internet", {})!)).toEqual([
      "elevation:should",
      "garden:could",
      "internet:could",
    ]);
    expect(order(withFactor(SAVED, "internet", { calls: "yes" })!)).toEqual([
      "elevation:should",
      "internet:should",
      "garden:could",
    ]);
    const start = { ...defaultRubric(), wonts: defaultRubric().wonts.filter((k) => k !== "internet") };
    expect(withFactor(start, "internet", { calls: "yes" })!.wonts.at(-1)).toBe("internet");
  });
});
