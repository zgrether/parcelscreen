/**
 * VR7 (#118 review): the rulebook's sentences that restate a rule must say what the code does. The over-limit term in
 * words against overLimitTerm, at a 10% limit (the knee above it) and a 15% one (the knee at it), and at a limit past
 * the top of the curve; the verdict's Maybe caps against cardFor.
 */
import { describe, expect, it } from "vitest";
import { ZACH } from "@/test/support/rubrics";
import { expectedOf } from "@/test/support/expected";
import { SCREEN_CONSTANTS } from "../screen/config";
import { overLimitTerm } from "../screen/score";
import { MAYBE_CAPS, cardFacts, cardFor, maybeCaps } from "./card";
import { panelText } from "./cardPanels";
import { overLimitWords } from "./rulebook";

const D = SCREEN_CONSTANTS.driveway;

describe("the over-limit term in words (overLimitTerm's branches)", () => {
  it("a 10% limit: a point a percent up to 15%, then rising to 20 at 20% and steeper", () => {
    expect(overLimitWords(10)).toBe(
      "1 point a percent over the limit up to 15%, then rising to 20 at 20% and steeper",
    );
    expect([10, 11, 13, 15].map((g) => overLimitTerm(g, 10))).toEqual([0, 1, 3, 5]);
    expect(overLimitTerm(17.5, 10)).toBeCloseTo(12.5, 9); // halfway from 5 at 15% to 20 at 20%
    expect([20, 25].map((g) => overLimitTerm(g, 10))).toEqual([20, 20]);
  });

  it("a 15% limit (the default): a straight line from 0 at 15% to 20 at 20% and steeper", () => {
    expect(overLimitWords(15)).toBe("rising in a straight line from 0 at 15% to 20 at 20% and steeper");
    expect(overLimitTerm(15, 15)).toBe(0);
    expect(overLimitTerm(16, 15)).toBeCloseTo(4, 9); // 4 points a percent
    expect(overLimitTerm(17.5, 15)).toBeCloseTo(10, 9);
    expect([20, 30].map((g) => overLimitTerm(g, 15))).toEqual([20, 20]);
  });

  it("a limit at the top of the curve or past it: the whole term at once", () => {
    expect(overLimitWords(D.overLimitMaxAtPct)).toBe("the full 20 for any grade over the limit");
    expect(overLimitTerm(D.overLimitMaxAtPct + 0.5, D.overLimitMaxAtPct)).toBe(D.overLimitMaxPts);
    expect(overLimitTerm(D.overLimitMaxAtPct, D.overLimitMaxAtPct)).toBe(0);
  });
});

describe("the verdict's Maybe caps (cardFor, and the panel's words)", () => {
  // Ferney's card under Zach's weights is a Contender with nothing missing and nothing to check first.
  const facts = cardFacts(expectedOf("ferney-creek-52-47A", "run"));
  const base = cardFor(facts, ZACH);

  it("each cap holds an otherwise Contender at Maybe", () => {
    expect(base.verdict).toBe("Contender");
    expect(maybeCaps(facts)).toEqual({ incomplete: false, checkFirst: false });
    const missing = {
      ...facts,
      rows: facts.rows.map((r, i) => (i === 6 ? { ...r, missing: "the terrain" } : r)),
    };
    const check = {
      ...facts,
      rows: facts.rows.map((r, i) => (i === 3 ? { ...r, checkFirst: "it doesn't fit" } : r)),
    };
    expect(maybeCaps(missing).incomplete).toBe(true);
    expect(cardFor(missing, ZACH).verdict).toBe("Maybe");
    expect(maybeCaps(check).checkFirst).toBe(true);
    expect(cardFor(check, ZACH).verdict).toBe("Maybe");
  });

  it("the Grade and verdict panel names every cap cardFor applies", () => {
    const how = panelText("verdict").howScored;
    expect(Object.keys(maybeCaps(facts)).sort()).toEqual(Object.keys(MAYBE_CAPS).sort());
    for (const words of Object.values(MAYBE_CAPS)) expect(how).toContain(words);
    expect(how).toContain(
      "A parcel is at most a Maybe when something didn't load (run it again) or when there's a 'Check first' item, such as a build that doesn't fit (Room to build F).",
    );
  });
});
