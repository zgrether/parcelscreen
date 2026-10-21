/**
 * Within budget (step 10 plan §3): the row graded on the rubric's budgets, as a ranked card or a Must, from the cost to
 * enjoy at the build site. The fixtures under the plan's test budgets ($250k camp, $300k build) are the hand-back's
 * before/after table.
 */
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { DEFAULT_RATES } from "../config/costs";
import { SCREEN_CONSTANTS } from "../screen/config";
import { defaultRubric } from "../rubric/default";
import type { Budgets, Rubric } from "../rubric/types";
import { budgetRow, reportCard, type Card } from "./card";
import { costToEnjoy } from "./cost";
import { drawnOf } from "./marks";

const MUD = "grayson-mud-creek-6273";
const D = defaultRubric();
/** The interview's lists are rank-sum: "before" is the starting order without budgets. */
const BEFORE: Rubric = { ...D, weights: { mode: "rankSum" } };
const TEST_BUDGETS: Budgets = { camp: 250_000, build: 300_000 };
const ranked = (budgets: Budgets = TEST_BUDGETS): Rubric => ({
  ...BEFORE,
  budgets,
  ranked: [...BEFORE.ranked, { factor: "budget", tier: "should" }],
});
const must = (budgets: Budgets = TEST_BUDGETS): Rubric => ({
  ...BEFORE,
  budgets,
  musts: [...BEFORE.musts, { factor: "budget" }],
});

const card = (slug: Parameters<typeof expectedOf>[0], rubric: Rubric, price: number | null): Card =>
  reportCard(
    expectedOf(slug, "run"),
    { id: "x", name: "x", rubric },
    { ...drawnOf([]), cost: { lines: [], askingPrice: price, rates: DEFAULT_RATES } },
  );
const row = (c: Card) => c.rows.find((x) => x.key === "budget");
const summary = (c: Card) => [Number(c.points!.toFixed(3)), c.grade, c.verdict];

describe("Within budget (step 10 plan §3)", () => {
  it("is no row without budgets: a card graded without them is the card as before", () => {
    const r = expectedOf(MUD, "run");
    const plain = reportCard(r, { id: "x", name: "x", rubric: D });
    const priced = card(MUD, D, 185_000);
    expect(row(priced)).toBeUndefined();
    expect(priced.rows).toEqual(plain.rows);
    expect(summary(priced)).toEqual(summary(plain));
    expect(priced.reason).toBe(plain.reason);
  });

  it("ranked: the worse of the two budgets' letters, by the high end as a share of the budget", () => {
    // Mud Creek at $185k: camp $200–240k (96% of $250k, a B), build $330–595k (198% of $300k, an F).
    const c = card(MUD, ranked(), 185_000);
    expect(row(c)).toMatchObject({
      grade: "F",
      detail: "ready to camp $200–240k, under your $250k; ready to build $330–595k, over your $300k",
      short: "camp $200–240k, build $330–595k",
    });
    // Within 80% for an A: a $400k camp budget and a $750k build one.
    expect(row(card(MUD, ranked({ camp: 400_000, build: 750_000 }), 185_000))?.grade).toBe("A");
    // A budget alone grades alone: the camp's B.
    expect(row(card(MUD, ranked({ camp: 250_000, build: null }), 185_000))?.grade).toBe("B");
  });

  it("as a Must: a fail is Not for us, a straddle a warning, no price holds at Maybe", () => {
    const fail = card(MUD, must(), 185_000);
    expect(fail.budgetMust).toEqual({ status: "fail", reason: "ready to build $330–595k, over your $300k" });
    expect(fail.verdict).toBe("Pass");
    expect(fail.reason).toBe("Not for us: ready to build $330–595k, over your $300k.");

    const warn = card(MUD, must({ camp: 250_000, build: 500_000 }), 185_000);
    expect(warn.budgetMust?.status).toBe("warn");
    // Its septic warning leads the reason; the budget's is the second warning, which holds it at Maybe.
    expect(warn.verdict).toBe("Maybe");
    expect(warn.heldBy).toEqual(["Septic", "Within budget"]);

    const pass = card(MUD, must({ camp: 250_000, build: 600_000 }), 185_000);
    expect(pass.budgetMust?.status).toBe("pass");
    expect(pass.verdict).toBe("Contender");

    const unpriced = card("ferney-creek-52-47A", must(), null);
    expect(unpriced.budgetMust?.status).toBe("unknown");
    expect(unpriced.verdict).toBe("Maybe");
    expect(unpriced.heldBy).toContain("Within budget");
  });

  it("isn't graded without an asking price, and says what the costs are", () => {
    const c = card("macks-mountain-35-3", ranked(), null);
    expect(row(c)?.grade).toBeNull();
    expect(row(c)?.detail).toMatch(
      /^No asking price: ready to camp \$\d+–\d+k, ready to build \$\d+–\d+k, plus the land$/,
    );
  });

  it("the before/after table: the fixtures under $250k camp and $300k build (the hand-back's)", () => {
    const table = (
      [
        [MUD, 185_000],
        ["macks-mountain-35-3", null],
        ["ferney-creek-52-47A", null],
        ["roan-hwy-143-099-046-02", null],
      ] as const
    ).map(([slug, price]) => [
      slug,
      summary(card(slug, BEFORE, price)),
      summary(card(slug, ranked(), price)),
      summary(card(slug, must(), price)),
    ]);
    expect(table).toEqual([
      [MUD, [3.5, "A", "Contender"], [3.333, "B", "Contender"], [3.5, "A", "Pass"]],
      ["macks-mountain-35-3", [3.214, "B", "Maybe"], [3.086, "B", "Maybe"], [3.214, "B", "Maybe"]],
      ["ferney-creek-52-47A", [3.179, "B", "Contender"], [3.114, "B", "Contender"], [3.179, "B", "Maybe"]],
      ["roan-hwy-143-099-046-02", [2.786, "B", "Maybe"], [2.771, "B", "Maybe"], [2.786, "B", "Maybe"]],
    ]);
  });

  it("isn't graded with no practical drive or before the driveway is routed", () => {
    const K = SCREEN_CONSTANTS.card;
    expect(budgetRow({ kind: "noWay" }, TEST_BUDGETS, K)).toMatchObject({
      grade: null,
      detail: "No practical drive: the costs need a way in",
    });
    expect(budgetRow(null, TEST_BUDGETS, K)?.grade).toBeNull();
    expect(budgetRow(null, { camp: null, build: null }, K)).toBeNull();
    const c = costToEnjoy({
      result: expectedOf(MUD, "run"),
      lines: [],
      marks: [],
      askingPrice: 185_000,
      rates: DEFAULT_RATES,
    });
    expect(budgetRow(c, undefined, K)).toBeNull();
  });
});
