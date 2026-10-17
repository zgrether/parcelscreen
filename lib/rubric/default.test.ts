/**
 * The default rubric reproduces today's card exactly (step 1 plan §3.2): on every fixture and scenario, for both of
 * today's weight sets, the card from the rubric equals the card recorded by the card code before it took a rubric
 * (test/fixtures/<slug>/cards-v7.json, recorded once at engine 20; never regenerated: it is the oracle). Gates and
 * their reasons, rows with their letters and details, Check-first items, points, letter, verdict, the reason line and
 * what didn't load must all match. Any difference stops the mission (plan §5).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { differences } from "@/test/support/compare";
import { expectedOf } from "@/test/support/expected";
import { FIXTURE_SLUGS, type FixtureSlug } from "@/test/support/fixtures";
import { SCENARIOS } from "@/test/support/scenarios";
import { SCREEN_CONSTANTS } from "../screen/config";
import { cardFor, cardFacts, reportCard, type Card } from "../report/card";
import { PERSONS, personRubrics } from "../report/persons";
import { rubricFromWeights } from "./default";

type Recorded = Record<string, Record<string, Omit<Card, "rubric"> & { person: string }>>;
const recorded = (slug: FixtureSlug): Recorded =>
  JSON.parse(
    readFileSync(join(process.cwd(), "test", "fixtures", slug, "cards-v7.json"), "utf8"),
  ) as Recorded;

/** The card without what step 1 added to it: the rubric, and each row's measure. */
const comparable = (c: Card) => {
  const { rubric: _rubric, ...rest } = c;
  return { ...rest, rows: rest.rows.map(({ measure: _m, ...row }) => row) };
};

describe("the default rubric reproduces today's cards (cards-v7.json)", () => {
  for (const slug of FIXTURE_SLUGS)
    for (const scenario of SCENARIOS[slug])
      for (const person of PERSONS)
        it(`${slug} ${scenario}, ${person}`, () => {
          const want = recorded(slug)[scenario]![person]!;
          const { person: _p, ...wantRest } = want;
          const got = comparable(reportCard(expectedOf(slug, scenario), person));
          expect(differences(got, wantRest)).toEqual([]);
          expect(got.points).toBe(wantRest.points);
        });

  it("the default is explicit, the four gates are its Musts, every row is ranked Should, nothing is a Won't", () => {
    for (const nr of Object.values(personRubrics())) {
      const r = nr.rubric;
      expect(r.weights.mode).toBe("explicit");
      expect(r.musts.map((m) => m.factor)).toEqual(["floodplain", "access", "easement", "septic"]);
      expect(r.musts.every((m) => m.threshold === undefined)).toBe(true);
      expect(r.ranked.map((c) => c.tier)).toEqual(Array<"should">(7).fill("should"));
      expect(r.wonts).toEqual([]);
      expect(r.bands).toEqual(SCREEN_CONSTANTS.card.rows);
      expect(r.points).toEqual(SCREEN_CONSTANTS.card.points);
      expect(r.gradeCutoffs).toEqual(SCREEN_CONSTANTS.card.gradeCutoffs);
      expect(r.verdict).toEqual(SCREEN_CONSTANTS.card.verdict);
    }
    expect(personRubrics().zach.rubric.weights).toEqual({
      mode: "explicit",
      of: SCREEN_CONSTANTS.card.weights.zach,
    });
  });

  it("a Won't row leaves the card and the grade; the other rows keep their letters", () => {
    const facts = cardFacts(expectedOf("ferney-creek-52-47A", "run"));
    const base = cardFor(facts, "zach");
    const rubric = { ...personRubrics().zach.rubric, wonts: ["trails" as const] };
    const without = cardFor(facts, { id: "t", name: "Test", rubric });
    expect(without.rows.map((x) => x.key)).toEqual(base.rows.map((x) => x.key).filter((k) => k !== "trails"));
    // Trails was a D under a weight of 10 on a 3.2 card: without it the points rise.
    expect(without.points!).toBeGreaterThan(base.points!);
    expect(without.rows.map((x) => x.grade)).toEqual(
      base.rows.filter((x) => x.key !== "trails").map((x) => x.grade),
    );
  });

  it("rubricFromWeights copies the config's numbers, so a rubric edit never touches SCREEN_CONSTANTS", () => {
    const r = rubricFromWeights(SCREEN_CONSTANTS.card.weights.zach);
    expect(r.bands).not.toBe(SCREEN_CONSTANTS.card.rows);
    expect(r.gradeCutoffs).not.toBe(SCREEN_CONSTANTS.card.gradeCutoffs);
    expect(r.verdict).not.toBe(SCREEN_CONSTANTS.card.verdict);
  });
});
