/**
 * The default rubric reproduces today's card exactly (step 1 plan §3.2): on every fixture and scenario, for both of
 * the weight sets the app shipped with (test/support/rubrics.ts), the card from the rubric equals the card recorded by the card code before it took a rubric
 * (test/fixtures/<slug>/cards-v7.json, recorded once at engine 20; never regenerated: it is the oracle). A port-only
 * fixture (Roan, step 2) has cards-v8.json instead (`pnpm record:oracles`): a regression snapshot. Gates and
 * their reasons, rows with their letters and details, Check-first items, points, letter, verdict, the reason line and
 * what didn't load must all match. Any difference stops the mission (plan §5).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { differences } from "@/test/support/compare";
import { expectedOf } from "@/test/support/expected";
import { FIXTURE_SLUGS, isPrototypeSlug, type FixtureSlug } from "@/test/support/fixtures";
import { SCENARIOS } from "@/test/support/scenarios";
import { SCREEN_CONSTANTS } from "../screen/config";
import { cardFor, cardFacts, reportCard, type Card } from "../report/card";
import { PERSONS, ZACH } from "@/test/support/rubrics";
import { defaultNamedRubric, rubricFromWeights } from "./default";
import { MINE } from "./types";

type Recorded = Record<string, Record<string, Omit<Card, "rubric"> & { person: string }>>;
const recorded = (slug: FixtureSlug): Recorded =>
  JSON.parse(
    readFileSync(
      join(
        process.cwd(),
        "test",
        "fixtures",
        slug,
        isPrototypeSlug(slug) ? "cards-v7.json" : "cards-v8.json",
      ),
      "utf8",
    ),
  ) as Recorded;

/**
 * The card without what step 1 added to it (the rubric, and each row's measure), what step 7 added (the site it
 * reads, the person's ranking of the sites, and the reason's lead as data), and what the polish pass added for display
 * (what holds it at Maybe, and a gate's first clause: both say again what the card already holds).
 */
const comparable = (c: Card) => {
  const { rubric: _rubric, at: _at, sites: _sites, lead: _lead, heldBy: _held, ...rest } = c;
  return {
    ...rest,
    gates: rest.gates.map(({ first: _f, ...gate }) => gate),
    rows: rest.rows.map(({ measure: _m, ...row }) => row),
  };
};

type Recorded1 = Recorded[string][string];

/**
 * Step 11's declared split (docs/plans/step-11-new-data.md §2.1): the recorded Town and hospital row is Hospital's now,
 * with its ER half: the same letter (the ER's was the worse on every fixture), the grocery's words dropped. Town keeps
 * the groceries at weight 0, so it's Don't care and off the card. Nothing else may differ.
 */
const split = (want: Recorded1): Recorded1 => ({
  ...want,
  rows: want.rows.map((x) =>
    x.key === "town"
      ? {
          ...x,
          key: "hospital",
          label: "Hospital",
          detail: x.detail.replace(/, (\d+ to a grocery|no grocery found)/, ""),
          ...(x.short ? { short: x.short.replace(/, (grocery \d+|no grocery)$/, "") } : {}),
        }
      : x,
  ),
});

/**
 * Step 7's guard (plan §2): graded at site #1, with the Driveway row as Don't care (it is, on both shipped weight
 * sets), every card is today's, byte for byte. So a grade or verdict that changes can only come from the best site or
 * the Driveway row, the two sources the step declared.
 */
describe("the default rubric reproduces today's cards (cards-v7.json; a port-only fixture's cards-v8.json)", () => {
  for (const slug of FIXTURE_SLUGS)
    for (const scenario of SCENARIOS[slug])
      for (const nr of PERSONS)
        it(`${slug} ${scenario}, ${nr.id}`, () => {
          const want = split(recorded(slug)[scenario]![nr.id]!);
          const { person: _p, ...wantRest } = want;
          const got = comparable(reportCard(expectedOf(slug, scenario), nr, undefined, undefined, { at: 0 }));
          expect(differences(got, wantRest)).toEqual([]);
          expect(got.points).toBe(wantRest.points);
        });

  it("the default is explicit, the four gates are its Musts, every weighted row is ranked Should, Driveway is a Won't", () => {
    for (const nr of PERSONS) {
      const r = nr.rubric;
      expect(r.weights.mode).toBe("explicit");
      expect(r.musts.map((m) => m.factor)).toEqual(["floodplain", "access", "easement", "septic"]);
      expect(r.musts.every((m) => m.threshold === undefined)).toBe(true);
      expect(r.ranked.map((c) => c.tier)).toEqual(Array<"should">(7).fill("should"));
      // Step 7: the Driveway row weighs 0 in both shipped sets, so the starting list grades as before it. Step 11:
      // Town (the groceries) too, Hospital taking its weight.
      expect(r.wonts).toEqual(["driveway", "town", "climate", "privacy", "longView", "airport", "longTrail"]);
      expect(r.bands).toEqual(SCREEN_CONSTANTS.card.rows);
      expect(r.points).toEqual(SCREEN_CONSTANTS.card.points);
      expect(r.gradeCutoffs).toEqual(SCREEN_CONSTANTS.card.gradeCutoffs);
      expect(r.verdict).toEqual(SCREEN_CONSTANTS.card.verdict);
    }
    expect(ZACH.rubric.weights).toEqual({
      mode: "explicit",
      of: SCREEN_CONSTANTS.card.weights.default,
    });
    // A fresh profile's own rubric: the default, named "Mine".
    expect(defaultNamedRubric()).toEqual({ id: MINE, name: "Mine", rubric: ZACH.rubric });
  });

  it("a Won't row leaves the card and the grade; the other rows keep their letters", () => {
    const facts = cardFacts(expectedOf("ferney-creek-52-47A", "run"));
    const base = cardFor(facts, ZACH);
    const rubric = { ...ZACH.rubric, wonts: ["trails" as const] };
    const without = cardFor(facts, { id: "t", name: "Test", rubric });
    expect(without.rows.map((x) => x.key)).toEqual(base.rows.map((x) => x.key).filter((k) => k !== "trails"));
    // Trails was a D under a weight of 10 on a 3.2 card: without it the points rise.
    expect(without.points!).toBeGreaterThan(base.points!);
    expect(without.rows.map((x) => x.grade)).toEqual(
      base.rows.filter((x) => x.key !== "trails").map((x) => x.grade),
    );
  });

  it("rubricFromWeights copies the config's numbers, so a rubric edit never touches SCREEN_CONSTANTS", () => {
    const r = rubricFromWeights(SCREEN_CONSTANTS.card.weights.default);
    expect(r.bands).not.toBe(SCREEN_CONSTANTS.card.rows);
    expect(r.gradeCutoffs).not.toBe(SCREEN_CONSTANTS.card.gradeCutoffs);
    expect(r.verdict).not.toBe(SCREEN_CONSTANTS.card.verdict);
  });
});
