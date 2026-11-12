/**
 * "House already here" (docs/plans/existing-house.md §1, §7): Ferney's marked house (its `setHouse` scenario) read as a
 * house already built. The build rows are set aside by the app with their reason, the house itself is graded, the verdict
 * is recomputed without them; a drawn existing drive is graded; without the flag the card is exactly as before.
 */
import { describe, expect, it } from "vitest";
import { ZACH } from "@/test/support/rubrics";
import { expectedOf } from "@/test/support/expected";
import { isAdjusted, shownLetter } from "./adjust";
import { costInputOf, reportCard } from "./card";
import { agentQuestions } from "./agent";
import { asideMustsLine } from "./answer";
import { costSummary } from "./costLines";
import { EXISTING_HOUSE_QUESTIONS, HOUSE_HERE, NO_BUILD_COST, VERIFY } from "./existingHouse";
import { drawnOf } from "./marks";

/** Zach's rubric with the Driveway row graded (the default leaves it Don't care). */
const DRIVE = {
  ...ZACH,
  rubric: {
    ...ZACH.rubric,
    ranked: [...ZACH.rubric.ranked, { factor: "driveway" as const, tier: "should" as const }],
    wonts: ZACH.rubric.wonts.filter((f) => f !== "driveway"),
  },
};
const house = () => structuredClone(expectedOf("ferney-creek-52-47A", "setHouse"));
const here = (drives: string[] = []) => ({ ...drawnOf([]), facts: { existingHouse: { drives } } });

describe("House already here", () => {
  it("sets Room to build, the Septic Must and the Driveway row aside, with their reason and what to check", () => {
    const c = reportCard(house(), DRIVE, here());
    expect(c.existingHouse).toBe(true);
    expect(c.gates.map((g) => g.key)).not.toContain("septic");
    expect(c.rows.map((x) => x.key)).not.toContain("room");
    expect(c.rows.map((x) => x.key)).not.toContain("driveway");
    const aside = new Map((c.setAside ?? []).map((x) => [x.key, x]));
    for (const k of ["septic", "room", "driveway"] as const) {
      expect(aside.get(k)).toMatchObject({ reason: HOUSE_HERE, auto: { verify: VERIFY[k] } });
    }
    expect(aside.get("septic")!.must).toBe(true);
    // The app's, not the person's: no ✎.
    expect(isAdjusted(c)).toBe(false);
    expect(shownLetter(c, "room")).toEqual({ grade: null, adjusted: false, setAside: true });
  });

  it("grades the marked point itself, and finds no new house sites", () => {
    const r = house();
    const c = reportCard(r, ZACH, here());
    expect(c.rows.find((x) => x.key === "homesite")!.detail).toBe(
      "the house: faces NNW, 6.6 h of December sun, 10° slope",
    );
    expect(c.rows.find((x) => x.key === "elevation")!.detail).toBe("2,654 ft at the marked house");
    expect(c.sites).toEqual([]);
  });

  it("recomputes the verdict without what's set aside", () => {
    const r = house();
    const before = reportCard(r, ZACH);
    const after = reportCard(r, ZACH, here());
    // The house's own reading counts; the rows that assume a build don't.
    const graded = (c: typeof after) => c.rows.filter((x) => x.grade !== null).map((x) => x.key);
    expect(graded(after)).not.toContain("room");
    expect(graded(before)).toContain("room");
    expect(after.reason).not.toMatch(/septic|footprint|gentle ground/i);
  });

  it("grades a drawn existing drive instead of setting the Driveway row aside", () => {
    const r = house();
    r.lines = [
      {
        id: "d1",
        kind: "track",
        lengthFt: 900,
        widthFt: null,
        outsideFt: 0,
        gradedFt: 900,
        avgGradePct: 9,
        maxGradePct: 14,
      },
    ];
    const c = reportCard(r, DRIVE, here(["d1"]));
    expect(c.rows.find((x) => x.key === "driveway")).toMatchObject({
      detail: "the existing drive: 900 ft, 9% average, 14% at its steepest",
    });
    expect((c.setAside ?? []).map((x) => x.key)).not.toContain("driveway");
  });

  it("sets Within budget aside when only a build budget was given", () => {
    const nr = { ...ZACH, rubric: { ...ZACH.rubric, budgets: { camp: null, build: 400_000 } } };
    const c = reportCard(house(), nr, here());
    expect((c.setAside ?? []).find((x) => x.key === "budget")).toMatchObject({ reason: HOUSE_HERE });
  });

  it("without the flag, Ferney's house scenarios grade exactly as before", () => {
    for (const s of ["setHouse", "houseRun"] as const) {
      const r = structuredClone(expectedOf("ferney-creek-52-47A", s));
      const plain = reportCard(r, ZACH);
      expect(reportCard(r, ZACH, drawnOf([]))).toEqual(plain);
      expect(plain.existingHouse).toBeUndefined();
      expect(plain.setAside).toBeUndefined();
    }
  });

  it("does nothing without a house on the parcel", () => {
    const r = structuredClone(expectedOf("ferney-creek-52-47A", "run"));
    expect(reportCard(r, ZACH, here())).toEqual(reportCard(r, ZACH, drawnOf([])));
  });

  it("says what it set aside on the answer line, and asks the agent about the house", () => {
    const c = reportCard(house(), DRIVE, here());
    expect(asideMustsLine(c)).toBe("3 set aside: a house is already here.");
    const qs = agentQuestions(c).map((q) => q.question);
    expect(qs.slice(-5)).toEqual([...EXISTING_HOUSE_QUESTIONS]);
    expect(agentQuestions(reportCard(house(), DRIVE)).map((q) => q.question)).not.toContain(
      EXISTING_HOUSE_QUESTIONS[0],
    );
  });

  it("asks the cost not to price the drive in, with the drawn existing drive's measures (Zach, #425)", () => {
    const r = house();
    r.lines = [
      {
        id: "d1",
        kind: "track",
        lengthFt: 900,
        widthFt: null,
        outsideFt: 0,
        gradedFt: 900,
        avgGradePct: 9,
        maxGradePct: 14,
      },
    ];
    const cost = { lines: [], askingPrice: null, rates: {} } as unknown as NonNullable<
      ReturnType<typeof here>["cost"]
    >;
    expect(costInputOf(r, 0, { ...here(["d1"]), cost })?.existingHouse).toEqual({
      drive: { lengthFt: 900, maxGradePct: 14 },
    });
    expect(costInputOf(r, 0, { ...here(), cost })?.existingHouse).toEqual({ drive: null });
    expect(costInputOf(r, 0, { ...drawnOf([]), cost })?.existingHouse).toBeUndefined();
  });

  it("leaves Ready to build out of the cost, and says why", () => {
    const line = (total: number) => ({
      land: 100_000,
      total: { low: total, high: total },
      items: [],
    });
    const cost = { kind: "priced", camp: line(120_000), build: line(300_000) } as unknown as Parameters<
      typeof costSummary
    >[0];
    const s = costSummary(cost, undefined, true);
    expect(s).toMatchObject({ kind: "lines", note: NO_BUILD_COST });
    expect(s?.kind === "lines" && s.lines.map((l) => l.which)).toEqual(["camp"]);
    const plain = costSummary(cost, undefined);
    expect(plain?.kind === "lines" && plain.lines.map((l) => l.which)).toEqual(["camp", "build"]);
  });
});
