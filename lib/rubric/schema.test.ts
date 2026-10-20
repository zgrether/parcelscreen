import { describe, expect, it } from "vitest";
import { reportCard } from "@/lib/report/card";
import { expectedOf } from "@/test/support/expected";
import { SCREEN_CONSTANTS } from "../screen/config";
import { defaultRubric } from "./default";
import { RubricSchema } from "./schema";
import { tierOf } from "./words";

/** A rubric as a profile saved it before step 7: no Driveway band, and explicit weights without it. */
function savedBeforeStep7(): unknown {
  const r = structuredClone(defaultRubric()) as unknown as {
    bands: Record<string, unknown>;
    weights: { mode: string; of: Record<string, number> };
    wonts: string[];
  };
  delete r.bands.drivewayPct;
  delete r.weights.of.driveway;
  r.wonts = [];
  return r;
}

describe("a rubric saved before the Driveway row (step 7: an added optional field, no rewrite)", () => {
  it("parses, with the starting list's band and a weight of 0", () => {
    const r = RubricSchema.parse(savedBeforeStep7());
    expect(r.bands.drivewayPct).toEqual(SCREEN_CONSTANTS.card.rows.drivewayPct);
    expect(r.weights.mode === "explicit" && r.weights.of.driveway).toBe(0);
  });

  it("has Driveway in Don't care, and grades as before: the row isn't on its card", () => {
    const r = RubricSchema.parse(savedBeforeStep7());
    expect(tierOf(r, "driveway")).toBe("wont");
    const result = expectedOf("grayson-mud-creek-6273", "run");
    const saved = reportCard(result, { id: "mine", name: "Mine", rubric: r });
    const now = reportCard(result, { id: "mine", name: "Mine", rubric: defaultRubric() });
    expect(saved.rows.map((x) => x.key)).not.toContain("driveway");
    expect([saved.points, saved.grade, saved.verdict]).toEqual([now.points, now.grade, now.verdict]);
  });

  it("a rank-sum rubric that doesn't rank Driveway leaves it off the card and out of the grade", () => {
    const D = defaultRubric();
    const rs = RubricSchema.parse({ ...D, wonts: [], weights: { mode: "rankSum" } });
    const card = reportCard(expectedOf("grayson-mud-creek-6273", "run"), { id: "x", name: "x", rubric: rs });
    expect(card.rows.map((x) => x.key)).not.toContain("driveway");
  });
});
