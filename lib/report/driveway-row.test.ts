/** The Driveway row (step 7 plan §3): graded on the steepest grade of the build site's chosen driveway. */
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { rubricFromAnswers } from "../rubric/interview/generate";
import type { ScoredDriveway, ScreenResult } from "../screen/types";
import { cardFacts, drivewayGradePct, reportCard } from "./card";

const MUD = expectedOf("grayson-mud-creek-6273", "run");

/** Mud Creek with site #1's driveway changed. */
function withDriveway(dw: Partial<ScoredDriveway> | null | undefined): ScreenResult {
  const r = structuredClone(MUD);
  const s = r.sites![0]!;
  if (dw === undefined) delete s.driveway;
  else s.driveway = dw === null ? null : { ...s.driveway!, ...dw };
  return r;
}
const rowOf = (r: ScreenResult) => cardFacts(r).rows.find((x) => x.key === "driveway")!;

describe("the Driveway row", () => {
  it("grades the steepest grade on the starting list's band: A ≤ 10%, B ≤ 15%, C ≤ 20%, D ≤ 25%, F beyond", () => {
    const at = (pct: number) => rowOf(withDriveway({ maxGradePct: pct })).grade;
    expect([at(9.9), at(10), at(14), at(15.4), at(20), at(24), at(26)]).toEqual([
      "A",
      "A",
      "B",
      "C",
      "C",
      "D",
      "F",
    ]);
    const row = rowOf(MUD);
    expect(row.detail).toBe("2,888 ft, 18% at its steepest");
    expect(row.short).toBe("18% steepest");
    expect(row.measure!.unit).toBe("%");
  });

  it("reads the design grade where the router designed an alternative, and an existing drive when it's steeper", () => {
    const designed = { legal: false, limitPct: 15, maxGradePct: 30, designPct: 14 };
    expect(drivewayGradePct({ ...MUD.sites![0]!.driveway!, ...designed })).toBe(14);
    expect(rowOf(withDriveway(designed)).grade).toBe("B");
    const existing = withDriveway({ maxGradePct: 8, existing: { maxGradePct: 22, limitPct: 15 } });
    expect(rowOf(existing).grade).toBe("D");
  });

  it("is an F with no route or no practical drive; ungraded until the driveway is routed", () => {
    expect(rowOf(withDriveway(null))).toMatchObject({
      grade: "F",
      detail: "no driveway route reaches site #1",
    });
    expect(rowOf(withDriveway({ noPractical: true }))).toMatchObject({
      grade: "F",
      detail: "no practical driveway to site #1",
    });
    expect(rowOf(withDriveway(undefined))).toMatchObject({
      grade: null,
      detail: "the driveway wasn't routed",
      missing: "the roads",
    });
    const noRoads = structuredClone(MUD);
    delete noRoads.driveway;
    expect(rowOf(noRoads).missing).toBe("the roads");
  });

  it("says when the driveway needs an easement", () => {
    expect(rowOf(withDriveway({ needsEasement: true })).detail).toBe(
      "2,888 ft, 18% at its steepest; needs an easement across neighbouring land",
    );
  });

  it("question 10 moves its edge: 18% is a B for Short and steep, a C for Long and gentle, a D for We'll build it", () => {
    const grade = (driveway: "steep" | "gentle" | "build") => {
      const { rubric } = rubricFromAnswers({ driveway });
      return reportCard(MUD, { id: "x", name: "x", rubric }).rows.find((x) => x.key === "driveway")?.grade;
    };
    expect([grade("steep"), grade("gentle"), grade("build")]).toEqual(["B", "C", "D"]);
  });

  it("isn't on the starting list's card (Don't care), so the starting list grades as before", () => {
    expect(
      reportCard(MUD, { id: "mine", name: "Mine", rubric: rubricFromAnswers({}).rubric }).rows.map(
        (x) => x.key,
      ),
    ).not.toContain("driveway");
  });
});
