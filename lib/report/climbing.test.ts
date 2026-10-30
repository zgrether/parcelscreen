/**
 * Climbing (step 17 plan §4, §9): the card row's cutoffs on synthetic cases, its line and panel, the interview's
 * question, and the notice's placement on a profile from before it.
 */
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { SCREEN_CONSTANTS } from "../screen/config";
import { CLIMB_DRIVES } from "../screen/climbing";
import type { ScreenResult } from "../screen/types";
import { defaultRubric } from "../rubric/default";
import { bcEdge } from "../rubric/words";
import { withFactor } from "../rubric/factorsAdd";
import { rubricFromAnswers } from "../rubric/interview/generate";
import type { Rubric } from "../rubric/types";
import { cardFacts } from "./card";
import { withinLine } from "./climbing";

type Climbing = NonNullable<ScreenResult["climbing"]>;

const withClimbing = (c: Climbing | undefined, noResponse: string[] = []): ScreenResult => {
  const r = structuredClone(expectedOf("grayson-mud-creek-6273", "run"));
  if (c === undefined) delete r.climbing;
  else r.climbing = c;
  r.noResponse = [...r.noResponse, ...noResponse];
  return r;
};
const rowOf = (r: ScreenResult) => cardFacts(r).rows.find((x) => x.key === "climbing")!;
const rope = (min: number): Climbing["rope"] => ({
  id: "foster-falls",
  name: "Foster Falls",
  types: ["sport", "trad"],
  min,
  mi: min * 0.8,
});
const boulder = (min: number): Climbing["boulder"] => ({
  id: "stone-fort",
  name: "Stone Fort (Little Rock City)",
  min,
  mi: min * 0.8,
});
const climbing = (over: Partial<Climbing> = {}): Climbing => ({
  rope: rope(38),
  boulder: boulder(22),
  ropeWithin: 3,
  timed: [],
  ...over,
});

describe("the Climbing row", () => {
  it("grades the drive to the nearest rope area on climbMin: A ≤ 30, B ≤ 60, C ≤ 90, D ≤ 120, F past", () => {
    expect(SCREEN_CONSTANTS.card.rows.climbMin).toEqual([30, 60, 90, 120]);
    const letters = [30, 31, 60, 61, 90, 120, 121].map(
      (min) => rowOf(withClimbing(climbing({ rope: rope(min) }))).grade,
    );
    expect(letters).toEqual(["A", "B", "B", "C", "C", "D", "F"]);
  });

  it("its line names the area and its types; its panel, bouldering, the count, the access note and what rope means", () => {
    const row = rowOf(withClimbing(climbing()));
    expect(row.detail).toBe("38 min to Foster Falls (sport, trad)");
    expect(row.short).toBe("Foster Falls 38 min");
    expect(row.measure).toEqual({ value: 38, unit: "min" });
    expect(row.panelNote).toMatch(
      /^Bouldering: Stone Fort \(Little Rock City\), 22 min\. 3 rope areas within an hour\. Access: South Cumberland State Park: [^.]+\. Rope area: sport or trad$/,
    );
  });

  it("bouldering and the count never move the grade", () => {
    const a = rowOf(withClimbing(climbing({ boulder: boulder(5), ropeWithin: 9 })));
    const b = rowOf(withClimbing(climbing({ boulder: null, ropeWithin: 0 })));
    expect(a.grade).toBe(b.grade);
    expect(b.panelNote).toMatch(/^No bouldering area within 150 km\. No rope area within an hour\./);
  });

  it("counts in words: none, one, several", () => {
    expect([withinLine(0), withinLine(1), withinLine(4)]).toEqual([
      "No rope area within an hour",
      "1 rope area within an hour",
      "4 rope areas within an hour",
    ]);
  });

  it("no rope area within reach is an F that says so; not measured and not loaded are ungraded", () => {
    const none = rowOf(withClimbing(climbing({ rope: null, ropeWithin: 0 })));
    expect([none.grade, none.detail]).toEqual(["F", "No sport or trad area within 150 km"]);
    expect(rowOf(withClimbing(undefined)).grade).toBeNull();
    expect(rowOf(withClimbing(undefined, [CLIMB_DRIVES])).grade).toBeNull();
  });
});

describe("the interview's question", () => {
  const tierOf = (r: Rubric) =>
    r.ranked.find((c) => c.factor === "climbing")?.tier ?? (r.wonts.includes("climbing") ? "wont" : "none");

  it("rarely: Don't care, whatever the drive; a few times a season: Nice to have; most weekends: Really want", () => {
    expect(tierOf(rubricFromAnswers({ climb: "rarely", climbDrive: "m45" }).rubric)).toBe("wont");
    expect(tierOf(rubricFromAnswers({ climb: "season", climbDrive: "m60" }).rubric)).toBe("could");
    expect(tierOf(rubricFromAnswers({ climb: "weekends", climbDrive: "m60" }).rubric)).toBe("should");
  });

  it("the longest drive sets the B edge, the 30-minute spacing kept; rarely leaves the default's", () => {
    const bands = (d: "m45" | "m60" | "m90" | "m120") =>
      rubricFromAnswers({ climb: "weekends", climbDrive: d }).rubric.bands.climbMin;
    expect(bands("m45")).toEqual([15, 45, 75, 105]);
    expect(bands("m60")).toEqual([30, 60, 90, 120]);
    expect(bands("m90")).toEqual([60, 90, 120, 150]);
    expect(bands("m120")).toEqual([90, 120, 150, 180]);
    expect(bcEdge(rubricFromAnswers({ climb: "rarely", climbDrive: "m120" }).rubric.bands, "climbMin")).toBe(
      60,
    );
  });
});

describe("on a profile from before it (the notice)", () => {
  const before: Rubric = { ...defaultRubric(), weights: { mode: "rankSum" }, wonts: [] };

  it("Don't care until its question is answered, then placed by the answer", () => {
    expect(withFactor(before, "climbing")!.wonts).toContain("climbing");
    const placed = withFactor(before, "climbing", { climb: "weekends", climbDrive: "m90" })!;
    expect(placed.ranked.at(-1)).toEqual({ factor: "climbing", tier: "should" });
    expect(bcEdge(placed.bands, "climbMin")).toBe(90);
  });
});
