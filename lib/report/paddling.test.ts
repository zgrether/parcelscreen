/**
 * Paddling (step 14d plan §4, §10): the card row's cutoffs, its line and panel, the interview's question, and the
 * notice's placement on a profile from before it.
 */
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { SCREEN_CONSTANTS } from "../screen/config";
import { PADDLE_DRIVES, pondToPaddle } from "../screen/paddling";
import { flatLine, riversLine } from "./paddling";
import type { ScreenResult } from "../screen/types";
import { defaultRubric } from "../rubric/default";
import { bcEdge } from "../rubric/words";
import { withFactor } from "../rubric/factorsAdd";
import { rubricFromAnswers } from "../rubric/interview/generate";
import type { Rubric } from "../rubric/types";
import { cardFacts } from "./card";

type Paddling = NonNullable<ScreenResult["paddling"]>;

const withPaddling = (p: Paddling | undefined, noResponse: string[] = []): ScreenResult => {
  const r = structuredClone(expectedOf("grayson-mud-creek-6273", "run"));
  if (p === undefined) delete r.paddling;
  else r.paddling = p;
  r.noResponse = [...r.noResponse, ...noResponse];
  return r;
};
/** The card's facts hold every row, whatever the rubric weighs (the default's Paddling is Don't care). */
const rowOf = (r: ScreenResult) => cardFacts(r).rows.find((x) => x.key === "paddling")!;
const flat = (min: number): Paddling["flat"] => ({
  name: "Rat Branch",
  water: "Watauga Lake",
  min,
  mi: min * 0.7,
});

describe("the Paddling row", () => {
  it("grades the drive to the nearest lake launch on paddleMin: A ≤ 15, B ≤ 30, C ≤ 45, D ≤ 60, F past", () => {
    expect(SCREEN_CONSTANTS.card.rows.paddleMin).toEqual([15, 30, 45, 60]);
    const letters = [15, 16, 30, 31, 45, 60, 61].map(
      (min) => rowOf(withPaddling({ flat: flat(min), rivers: [], pond: null })).grade,
    );
    expect(letters).toEqual(["A", "B", "B", "C", "C", "D", "F"]);
  });

  it("its line names the water and the launch; its short form, the water and minutes", () => {
    const row = rowOf(withPaddling({ flat: flat(18), rivers: [], pond: null }));
    expect(row.detail).toBe("18 min to Watauga Lake, Rat Branch");
    // An unnamed launch is "<water> access": the water once.
    expect(
      flatLine({ name: "South Holston Lake access", water: "South Holston Lake", min: 60, mi: 31 }),
    ).toBe("60 min to South Holston Lake access");
    expect(row.short).toBe("Watauga Lake 18 min");
    expect(row.measure).toEqual({ value: 18, unit: "min" });
  });

  it("river put-ins and a pond go in the panel and never move the grade", () => {
    const rivers = [{ name: "Guy Ford access", river: "Watauga River", km: 9.7 }];
    const pond = { acres: 1.2, name: "Mill Pond" };
    const bare = rowOf(withPaddling({ flat: flat(40), rivers: [], pond: null }));
    const more = rowOf(withPaddling({ flat: flat(40), rivers, pond }));
    expect(more.grade).toBe(bare.grade);
    expect(more.panelNote).toBe(
      "river put-ins, not graded: Watauga River: Guy Ford access, 6.0 mi straight — check the river's class (how hard its rapids are) before paddling. And a pond on the land you could paddle (1.2 ac)",
    );
    expect(bare.panelNote).toBeUndefined();
  });

  it("a river's put-ins together, each name once, the caution once", () => {
    const rivers = [
      { name: "South Fork New River access", river: "South Fork New River", km: 24.5 },
      { name: "South Fork New River access", river: "South Fork New River", km: 24.5 },
      { name: "Mouth of Wilson access", river: "New River", km: 26 },
      { name: "Elk Creek access", river: "South Fork New River", km: 24.7 },
    ];
    expect(riversLine(rivers)).toBe(
      "South Fork New River: South Fork New River access, 15.2 mi straight; Elk Creek access, 15.3 mi straight; New River: Mouth of Wilson access, 16.2 mi straight — check the river's class (how hard its rapids are) before paddling",
    );
  });

  it("no lake launch within reach is an F that says so; not measured and not loaded are ungraded", () => {
    const none = rowOf(withPaddling({ flat: null, rivers: [], pond: null }));
    expect([none.grade, none.detail]).toEqual(["F", "No lake or reservoir launch within 100 km"]);
    expect(rowOf(withPaddling(undefined)).grade).toBeNull();
    expect(rowOf(withPaddling(undefined, [PADDLE_DRIVES])).grade).toBeNull();
  });
});

describe("a pond to paddle", () => {
  it("at least 1 ac on the parcel (Ferney's 0.94 ac isn't)", () => {
    expect(pondToPaddle({ count: 1, acres: 0.94, names: [] })).toBeNull();
    expect(pondToPaddle({ count: 1, acres: 1, names: ["Mill Pond"] })).toEqual({
      acres: 1,
      name: "Mill Pond",
    });
    expect(pondToPaddle(undefined)).toBeNull();
  });
});

describe("the interview's question", () => {
  const tierOf = (r: Rubric) =>
    r.ranked.find((c) => c.factor === "paddling")?.tier ?? (r.wonts.includes("paddling") ? "wont" : "none");

  it("rarely: Don't care, whatever the drive; some weekends: Nice to have; a big part of the fun: Really want", () => {
    expect(tierOf(rubricFromAnswers({ paddle: "rarely", paddleDrive: "m15" }).rubric)).toBe("wont");
    expect(tierOf(rubricFromAnswers({ paddle: "some", paddleDrive: "m30" }).rubric)).toBe("could");
    expect(tierOf(rubricFromAnswers({ paddle: "big", paddleDrive: "m30" }).rubric)).toBe("should");
  });

  it("the longest drive sets the B/C edge; rarely leaves the default's", () => {
    const edge = (d: "m15" | "m30" | "m45" | "m60") =>
      bcEdge(rubricFromAnswers({ paddle: "some", paddleDrive: d }).rubric.bands, "paddleMin");
    expect([edge("m15"), edge("m30"), edge("m45"), edge("m60")]).toEqual([15, 30, 45, 60]);
    expect(
      bcEdge(rubricFromAnswers({ paddle: "rarely", paddleDrive: "m60" }).rubric.bands, "paddleMin"),
    ).toBe(30);
  });
});

describe("on a profile from before it (the notice)", () => {
  const before: Rubric = { ...defaultRubric(), weights: { mode: "rankSum" }, wonts: [] };

  it("Don't care until its question is answered, then placed by the answer", () => {
    expect(withFactor(before, "paddling")!.wonts).toContain("paddling");
    const placed = withFactor(before, "paddling", { paddle: "big", paddleDrive: "m45" })!;
    expect(placed.ranked.at(-1)).toEqual({ factor: "paddling", tier: "should" });
    expect(bcEdge(placed.bands, "paddleMin")).toBe(45);
  });
});
