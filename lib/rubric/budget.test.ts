/** Within budget in the rubric (step 10 plan §3): where the interview puts it, and the editor's moves. */
import { describe, expect, it } from "vitest";
import { defaultRubric } from "./default";
import { columnsOf, isBudgetMust, moveCard } from "./edit";
import { rubricFromAnswers } from "./interview/generate";
import { RubricSchema } from "./schema";
import type { Rubric } from "./types";
import { plainLine, tierOf } from "./words";

const land = { campBudget: 250_000, buildBudget: 300_000 };
const card = { kind: "factor", factor: "budget" } as const;
const ok = (r: ReturnType<typeof moveCard>): Rubric => {
  if (!r.ok) throw new Error(r.reason);
  return r.rubric;
};

describe("Within budget in the rubric", () => {
  it("isn't on the starting list, and a rubric saved before step 10 reads without budgets", () => {
    const D = defaultRubric();
    expect(D.budgets).toBeUndefined();
    expect([...D.ranked.map((c) => c.factor), ...D.wonts]).not.toContain("budget");
    expect(Object.values(columnsOf(D)).flat()).not.toContainEqual(card);
    const { budgets: _b, ...old } = D;
    expect(RubricSchema.parse(old).budgets).toBeUndefined();
  });

  it("the interview: the last of Really want; a Must with 'Over budget' walked away from; Don't care in 14b", () => {
    const ranked = rubricFromAnswers({ land }).rubric;
    expect(ranked.budgets).toEqual({ camp: 250_000, build: 300_000 });
    expect(ranked.ranked.filter((c) => c.tier === "should").at(-1)).toEqual({
      factor: "budget",
      tier: "should",
    });
    expect(plainLine(ranked, "budget")).toBe("Ready to camp under $250k, ready to build under $300k");

    const must = rubricFromAnswers({ land, walkAway: { chips: ["overBudget"] } });
    expect(isBudgetMust(must.rubric)).toBe(true);
    expect(tierOf(must.rubric, "budget")).toBe("must");
    expect(must.rubric.ranked.map((c) => c.factor)).not.toContain("budget");
    expect(must.why.cards.budget).toEqual(["You'd walk away from a place over budget"]);
    expect(must.later).not.toContain("Within budget (a must)");

    const off = rubricFromAnswers({ land, dontMatter: ["overBudget"] }).rubric;
    expect(tierOf(off, "budget")).toBe("wont");

    // No budget given: no card, and the chip stays on the quiet list.
    const none = rubricFromAnswers({ walkAway: { chips: ["overBudget"] } });
    expect(none.rubric.budgets).toBeUndefined();
    expect(isBudgetMust(none.rubric)).toBe(false);
    expect(none.later).toContain("Within budget (a must)");
  });

  it("the editor moves it between Must (no number), the ranked tiers and Don't care", () => {
    const r = rubricFromAnswers({ land }).rubric;
    const m = ok(moveCard(r, card, "must"));
    expect(columnsOf(m).must).toContainEqual(card);
    expect(m.ranked.map((c) => c.factor)).not.toContain("budget");
    expect(m.musts.filter((x) => x.factor === "budget")).toEqual([{ factor: "budget" }]);

    const could = ok(moveCard(m, card, "could"));
    expect(isBudgetMust(could)).toBe(false);
    expect(tierOf(could, "budget")).toBe("could");

    const wont = ok(moveCard(m, card, "wont"));
    expect(isBudgetMust(wont)).toBe(false);
    expect(wont.wonts).toContain("budget");
    expect(columnsOf(wont).wont).toContainEqual(card);
  });
});
