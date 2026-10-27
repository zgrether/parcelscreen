/**
 * The Privacy row (step 11, plan §2.3): the worse of the nearest house and the houses in sight at the card's site;
 * "not measured" on a screen made before it; question 8 and question 14's chip in saved priorities; the bake's floor.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { defaultRubric } from "../rubric/default";
import { setBandEdge } from "../rubric/edit";
import { withFactor } from "../rubric/factorsAdd";
import { thresholdStatus } from "../rubric/musts";
import type { Rubric } from "../rubric/types";
import { SCREEN_CONSTANTS } from "../screen/config";
import type { ScreenResult } from "../screen/types";
import { cardFacts, reportCard } from "./card";
import { NOT_MEASURED } from "./climate";

const MUD = expectedOf("grayson-mud-creek-6273", "run");

/** Mud Creek with every site's privacy set. */
function withSites(nearestFt: number | null, inSight: number, near = 0): ScreenResult {
  const r = structuredClone(MUD);
  for (const s of r.sites!) s.privacy = { near, inSight, nearestFt };
  return r;
}
const rowOf = (r: ScreenResult) => cardFacts(r).rows.find((x) => x.key === "privacy")!;
/** Privacy ranked alone, at these bands. */
const graded = (r: ScreenResult, rubric: Rubric = defaultRubric()) =>
  reportCard(r, {
    id: "x",
    name: "x",
    rubric: {
      ...rubric,
      weights: { mode: "rankSum" },
      ranked: [{ factor: "privacy", tier: "should" }],
      wonts: [],
    },
  }).rows.find((x) => x.key === "privacy")!;

describe("the Privacy row", () => {
  it("grades the nearest house on the starting list's 660 ft, and no house within a mile is an A", () => {
    const at = (ft: number | null) => rowOf(withSites(ft, 0)).grade;
    expect([at(1400), at(660), at(400), at(200), at(100), at(null)]).toEqual(["A", "B", "C", "D", "F", "A"]);
  });

  it("says the nearest, the houses near, and those in sight, in winter", () => {
    const row = rowOf(withSites(1100, 1, 2));
    expect(row.detail).toBe(
      "the nearest house 1,100 ft away; 2 within a quarter mile (shown, not graded); 1 in sight within a mile (in winter, with leaves down)",
    );
    expect(row.short).toBe("nearest 1,100 ft, 1 in sight");
    expect(row.measure).toEqual({ value: 1, unit: "houses" });
    expect(rowOf(withSites(null, 0)).detail).toBe("no house within a mile");
  });

  it("never know they're there: one house in sight is a C at best", () => {
    const never = setBandEdge(setBandEdge(defaultRubric(), "privacyFt", 1320), "privacySight", 0);
    expect(graded(withSites(2000, 0), never).grade).toBe("A");
    expect(graded(withSites(2000, 1), never).grade).toBe("C");
    // The starting list doesn't mind a few in sight.
    expect(graded(withSites(2000, 3)).grade).toBe("A");
  });

  it("a limit of none in sight reads the houses in sight", () => {
    const must = { factor: "privacy" as const, threshold: 0 };
    expect(thresholdStatus(must, rowOf(withSites(900, 0)).measure)).toBe("pass");
    expect(thresholdStatus(must, rowOf(withSites(900, 2)).measure)).toBe("fail");
  });

  it("a screen made before it: not measured, never incomplete", () => {
    const old = structuredClone(MUD);
    delete old.privacy;
    for (const s of old.sites!) delete s.privacy;
    expect(rowOf(old)).toMatchObject({ grade: null, detail: NOT_MEASURED });
    expect(rowOf(old).missing).toBeUndefined();
  });
});

describe("Privacy in saved priorities (plan §5)", () => {
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

  it("never: the bottom of Really want, at 1,320 ft and none in sight; lights: the bottom of Nice to have", () => {
    const never = withFactor(SAVED, "privacy", { neighbors: "never" })!;
    expect(order(never)).toEqual(["elevation:should", "privacy:should", "garden:could"]);
    expect([never.bands.privacyFt[1], never.bands.privacySight[1]]).toEqual([1320, 0]);
    const lights = withFactor(SAVED, "privacy", { neighbors: "lights" })!;
    expect(order(lights)).toEqual(["elevation:should", "garden:could", "privacy:could"]);
  });

  it("wave, or no answer: Don't care; the walk-away chip is its limit and lifts it to Nice to have", () => {
    expect(withFactor(SAVED, "privacy", { neighbors: "wave" })!.wonts).toEqual(["room", "privacy"]);
    expect(withFactor(SAVED, "privacy", {})!.wonts).toEqual(["room", "privacy"]);
    const chip = withFactor(SAVED, "privacy", { walkAway: { chips: ["neighborInView"] } })!;
    expect(chip.musts.at(-1)).toEqual({ factor: "privacy", threshold: 0 });
    expect(order(chip).at(-1)).toBe("privacy:could");
  });
});

describe("the footprint bake", () => {
  it("keeps the same smallest house as config", () => {
    const script = readFileSync(join(process.cwd(), "scripts", "data-buildings.mts"), "utf8");
    expect(Number(/MIN_HOUSE_M2 = (\d+)/.exec(script)![1])).toBe(SCREEN_CONSTANTS.privacy.minHouseM2);
  });
});
