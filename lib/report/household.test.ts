/**
 * How another member would rate it (step 6 §3.2): the rows that differ most, by each row's share of the grade, a
 * failing Must first, at most three, none when the rubrics agree; with their why lines.
 */
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { JULIE, ZACH } from "@/test/support/rubrics";
import type { NamedRubric } from "../rubric/types";
import { WHY_MOVED, WHY_STARTING } from "../rubric/words";
import { reportCard } from "./card";
import { differences } from "./household";

const slugs = ["ferney-creek-52-47A", "macks-mountain-35-3", "grayson-mud-creek-6273"] as const;

describe("the rows that differ most", () => {
  it("none when both grade with the same rubric", () => {
    for (const slug of slugs) {
      const r = expectedOf(slug, "run");
      expect(differences(reportCard(r, ZACH), reportCard(r, { ...ZACH, id: "other" }), null)).toEqual([]);
    }
  });

  it("at most three, the largest gap in share first, each with their letter, mine and their why line", () => {
    for (const slug of slugs) {
      const r = expectedOf(slug, "run");
      const d = differences(reportCard(r, ZACH), reportCard(r, JULIE), null);
      expect(d.length).toBeLessThanOrEqual(3);
      for (const x of d) {
        expect(x.label).not.toBe("");
        expect([WHY_STARTING, WHY_MOVED]).toContain(x.why);
      }
    }
  });

  it("a Won't row reads 'not counted', and a Must that fails for them alone comes first", () => {
    const r = expectedOf("macks-mountain-35-3", "run");
    const mine = reportCard(r, ZACH);
    // Theirs: the sky not counted, and every gate a Must (a fail among them comes first, if any fails for them alone).
    const theirs: NamedRubric = {
      id: "j",
      name: "J",
      rubric: {
        ...ZACH.rubric,
        wonts: [...ZACH.rubric.wonts, "sky"],
        ranked: ZACH.rubric.ranked.filter((c) => c.factor !== "sky"),
      },
    };
    const d = differences(mine, reportCard(r, theirs), null, 10);
    const sky = d.find((x) => x.key === "sky");
    expect(sky?.theirs).toBe("not counted");
    const firstGate = d.findIndex((x) => x.theirs === "fails");
    if (firstGate >= 0) expect(firstGate).toBe(0);
  });
});
