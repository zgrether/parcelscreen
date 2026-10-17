/**
 * Musts with thresholds (workflow-review.md, Rubric algorithm 2; step 1 plan §3.1): the outcome by the row's direction
 * and unit, and what a threshold Must does to a card: a fail is a Pass that names the row, an unknown holds the verdict
 * at Maybe. None in the default rubric, so nothing on screen changes in step 1.
 */
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { cardFacts, cardFor } from "../report/card";
import { personRubrics } from "../report/persons";
import { thresholdStatus, thresholdWords } from "./musts";
import type { MustCard, Rubric } from "./types";

const withMusts = (musts: MustCard[]): Rubric => {
  const base = personRubrics().zach.rubric;
  return { ...base, musts: [...base.musts, ...musts] };
};

describe("thresholdStatus", () => {
  it("at least: elevation 2,640 ft against 3,000 fails, against 2,500 passes", () => {
    expect(thresholdStatus({ factor: "elevation", threshold: 3000 }, { value: 2640, unit: "ft" })).toBe(
      "fail",
    );
    expect(thresholdStatus({ factor: "elevation", threshold: 2500 }, { value: 2640, unit: "ft" })).toBe(
      "pass",
    );
  });
  it("at most: an ER 47 min away against 30 fails, against 60 passes", () => {
    expect(thresholdStatus({ factor: "town", threshold: 30 }, { value: 47, unit: "min" })).toBe("fail");
    expect(thresholdStatus({ factor: "town", threshold: 60 }, { value: 47, unit: "min" })).toBe("pass");
  });
  it("unknown: no measure, another unit (trails by straight-line km), a letter-only row, or no threshold", () => {
    expect(thresholdStatus({ factor: "elevation", threshold: 3000 }, undefined)).toBe("unknown");
    expect(thresholdStatus({ factor: "trails", threshold: 30 }, { value: 10, unit: "km" })).toBe("unknown");
    expect(thresholdStatus({ factor: "homesite", threshold: 1 }, { value: 1, unit: "x" })).toBe("unknown");
    expect(thresholdStatus({ factor: "elevation" }, { value: 2640, unit: "ft" })).toBe("unknown");
  });
  it("in words", () => {
    const fmt = (n: number) => n.toLocaleString("en-US");
    expect(thresholdWords({ factor: "elevation", threshold: 3000 }, fmt)).toBe("at least 3,000 ft");
    expect(thresholdWords({ factor: "town", threshold: 30 }, fmt)).toBe("at most 30 min");
  });
});

describe("a threshold Must on the card", () => {
  const facts = cardFacts(expectedOf("ferney-creek-52-47A", "run"));
  const base = cardFor(facts, "zach");

  it("Ferney is a Contender at 2,640 ft; 'at least 3,000 ft' makes it a Pass that names the row", () => {
    expect(base.verdict).toBe("Contender");
    const elevation = facts.rows.find((x) => x.key === "elevation")!;
    expect(elevation.measure).toEqual({ value: expect.any(Number) as number, unit: "ft" });
    const c = cardFor(facts, {
      id: "t",
      name: "Test",
      rubric: withMusts([{ factor: "elevation", threshold: 3000 }]),
    });
    expect(c.verdict).toBe("Pass");
    expect(c.reason).toBe(
      `Pass: elevation at the build site fails your must (${elevation.short}; you asked for at least 3,000 ft).`,
    );
    // The grade itself is unchanged: a Must gates, it never adds or removes points.
    expect([c.points, c.grade]).toEqual([base.points, base.grade]);
  });

  it("a Must the measure can't answer holds the verdict at Maybe, with today's reason", () => {
    const c = cardFor(facts, {
      id: "t",
      name: "Test",
      rubric: withMusts([{ factor: "homesite", threshold: 80 }]),
    });
    expect(c.verdict).toBe("Maybe");
    expect(c.reason).toBe(base.reason.replace("Contender", "Maybe"));
  });

  it("a Must that passes changes nothing", () => {
    const c = cardFor(facts, {
      id: "t",
      name: "Test",
      rubric: withMusts([{ factor: "elevation", threshold: 2500 }]),
    });
    expect([c.verdict, c.reason, c.points]).toEqual([base.verdict, base.reason, base.points]);
  });
});
