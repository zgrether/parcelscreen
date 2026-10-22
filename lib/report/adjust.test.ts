/**
 * Per-parcel adjustments in the grade (step 12, plan §3): an override sets a row's letter or a Must's result and keeps
 * the app's beside it; a set-aside leaves the grade, the Musts and the verdict and is listed apart; a person's own are
 * applied to their card only.
 */
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { defaultRubric } from "../rubric/default";
import { gradedRows, parcelGrade } from "../rubric/grade";
import { MINE, type Factor, type NamedRubric, type Rubric } from "../rubric/types";
import { weightsOf } from "../rubric/weights";
import { adjustKey, type Adjustment } from "./adjust";
import { asideMustsLine, answerReason } from "./answer";
import { reportCard, type Card } from "./card";
import { mustLines } from "./cardLines";
import { drawnOf } from "./marks";

const MUD = expectedOf("grayson-mud-creek-6273", "run");
const FERNEY = expectedOf("ferney-creek-52-47A", "run");
const mine = (rubric: Rubric = defaultRubric()): NamedRubric => ({ id: MINE, name: "Mine", rubric });

function adj(factor: Factor, a: Partial<Adjustment>): Adjustment {
  return {
    key: adjustKey("p", "zach", factor),
    parcel: "p",
    by: "zach",
    factor,
    kind: "override",
    reason: "walked it",
    was: "–",
    at: "2026-10-22T12:00:00Z",
    ...a,
  };
}
const withAdj = (xs: Adjustment[], id: string = MINE) => ({
  ...drawnOf([], null),
  adjust: new Map([[id, xs]]),
});
const rowOf = (c: Card, key: string) => c.rows.find((x) => x.key === key);

describe("an override", () => {
  it("sets a row's letter, re-grades the parcel with it, and keeps the app's beside it", () => {
    const before = reportCard(MUD, mine());
    const row = before.rows.find((x) => x.grade && x.grade !== "A")!;
    const after = reportCard(MUD, mine(), withAdj([adj(row.key as Factor, { grade: "A", was: row.grade! })]));
    expect(rowOf(after, row.key)).toMatchObject({
      grade: "A",
      adjusted: { from: row.grade, to: "A", reason: "walked it", then: row.grade },
    });
    // The parcel's points are the rubric's weighted mean with the new letter.
    const R = defaultRubric();
    const expected = parcelGrade(gradedRows(after.rows, R), R, weightsOf(R));
    expect(after.points).toBeCloseTo(expected.points!, 9);
    expect(after.points!).toBeGreaterThan(before.points!);
  });

  it("says when the app's own value changed since it was made", () => {
    const before = reportCard(MUD, mine());
    const row = before.rows.find((x) => x.grade)!;
    const other = row.grade === "C" ? "D" : "C";
    const after = reportCard(MUD, mine(), withAdj([adj(row.key as Factor, { grade: "B", was: other })]));
    expect(rowOf(after, row.key)!.adjusted).toMatchObject({ from: row.grade, then: other });
  });

  it("a Must counted as failed is a Pass; counted as passed again, it isn't", () => {
    const before = reportCard(FERNEY, mine());
    expect(before.verdict).not.toBe("Pass");
    const failed = reportCard(FERNEY, mine(), withAdj([adj("floodplain", { status: "fail", was: "pass" })]));
    expect(failed.verdict).toBe("Pass");
    expect(failed.lead.kind).toBe("fail");
    expect(mustLines(failed).find((m) => m.key === "floodplain")).toMatchObject({
      status: "fail",
      adjusted: { from: "pass", to: "fail" },
    });
  });

  it("a limit's result: the person's stands for the measure's", () => {
    const R: Rubric = {
      ...defaultRubric(),
      musts: [...defaultRubric().musts, { factor: "elevation", threshold: 9000 }],
    };
    expect(reportCard(MUD, mine(R)).verdict).toBe("Pass");
    const passed = reportCard(MUD, mine(R), withAdj([adj("elevation", { status: "pass", was: "fail" })]));
    expect(passed.verdict).not.toBe("Pass");
    expect(mustLines(passed).find((m) => m.key === "elevation")!.status).toBe("pass");
  });
});

describe("a set-aside", () => {
  it("a row leaves the grade, the rest keep their weights, and it's listed apart", () => {
    const before = reportCard(MUD, mine());
    const row = before.rows.find((x) => x.grade)!;
    const after = reportCard(MUD, mine(), withAdj([adj(row.key as Factor, { kind: "setAside" })]));
    expect(rowOf(after, row.key)).toBeUndefined();
    expect(after.setAside).toEqual([
      { key: row.key, label: row.label, reason: "walked it", must: false, at: "2026-10-22T12:00:00Z" },
    ]);
    const R = defaultRubric();
    const rest = gradedRows(
      before.rows.filter((x) => x.key !== row.key),
      R,
    );
    expect(after.points).toBeCloseTo(parcelGrade(rest, R, weightsOf(R)).points!, 9);
    expect(asideMustsLine(after)).toBeNull();
  });

  it("a failing Must set aside no longer decides the verdict, and the answer line names it", () => {
    const failed = adj("floodplain", { status: "fail" });
    const pass = reportCard(FERNEY, mine(), withAdj([failed]));
    expect(pass.verdict).toBe("Pass");
    const aside = reportCard(FERNEY, mine(), withAdj([{ ...failed, kind: "setAside", status: undefined }]));
    // As if Floodplain weren't a Must on this parcel.
    const without: Rubric = {
      ...defaultRubric(),
      musts: defaultRubric().musts.filter((m) => m.factor !== "floodplain"),
    };
    expect(aside.verdict).toBe(reportCard(FERNEY, mine(without)).verdict);
    expect(aside.points).toBe(reportCard(FERNEY, mine(without)).points);
    expect(aside.gates.some((g) => g.key === "floodplain")).toBe(false);
    expect(mustLines(aside).some((m) => m.key === "floodplain")).toBe(false);
    expect(aside.setAside?.[0]).toMatchObject({ key: "floodplain", must: true });
    expect(answerReason(aside, FERNEY)).toMatch(/You set aside a must-have: Floodplain\.$/);
  });

  it("two Musts: named together", () => {
    const c = reportCard(
      FERNEY,
      mine(),
      withAdj([adj("floodplain", { kind: "setAside" }), adj("septic", { kind: "setAside" })]),
    );
    expect(asideMustsLine(c)).toMatch(/^You set aside 2 must-haves: Floodplain, /);
  });
});

describe("personal", () => {
  it("a card reads only its own rubric's adjustments", () => {
    const julie: NamedRubric = { id: "julie", name: "Julie", rubric: defaultRubric() };
    const failed = withAdj([adj("floodplain", { status: "fail" })]);
    expect(reportCard(FERNEY, mine(), failed).verdict).toBe("Pass");
    expect(reportCard(FERNEY, julie, failed).verdict).toBe(reportCard(FERNEY, julie).verdict);
    expect(reportCard(FERNEY, julie, withAdj([adj("floodplain", { status: "fail" })], "julie")).verdict).toBe(
      "Pass",
    );
  });

  it("no adjustments: the card is the same object shape as before", () => {
    expect(reportCard(MUD, mine(), drawnOf([], null))).toEqual(reportCard(MUD, mine()));
  });
});

describe("the marks (plan §3, PR 4)", () => {
  const over = withAdj([adj("sky", { grade: "A", was: "B" }), adj("floodplain", { kind: "setAside" })]);

  it("the grid's cells: the override marked, the set-aside kept empty and marked, never best", async () => {
    const { factorCells } = await import("./factorCells");
    const cells = factorCells(reportCard(FERNEY, mine(), over));
    expect(cells.find((c) => c.key === "sky")).toMatchObject({ grade: "A", adjusted: true });
    expect(cells.find((c) => c.key === "floodplain")).toMatchObject({
      kind: "must",
      text: "–",
      score: null,
      setAside: true,
      adjusted: true,
    });
    expect(factorCells(reportCard(FERNEY, mine())).some((c) => c.adjusted)).toBe(false);
  });

  it("Compare's grade cell and the print rows say so", async () => {
    const { compareTable } = await import("./compare");
    const { cardTiers } = await import("../print/report");
    const t = compareTable(
      [{ key: "p", name: "Ferney", state: "ok", result: FERNEY, drawn: over } as never],
      mine(),
    );
    expect(t.head.cells[0]!.text).toMatch(/ ✎$/);
    const tiers = cardTiers(reportCard(FERNEY, mine(), over));
    const rows = tiers.flatMap((x) => x.rows);
    expect(rows.find((r) => r.key === "sky")!.mark).toBe("A ✎");
    expect(rows.find((r) => r.key === "aside-floodplain")).toMatchObject({
      mark: "– ✎",
      text: "Set aside for this parcel: “walked it”.",
    });
  });

  it("isAdjusted: an override, a set-aside, or neither", async () => {
    const { isAdjusted } = await import("./adjust");
    expect(isAdjusted(reportCard(FERNEY, mine()))).toBe(false);
    expect(isAdjusted(reportCard(FERNEY, mine(), withAdj([adj("sky", { grade: "A" })])))).toBe(true);
    expect(isAdjusted(reportCard(FERNEY, mine(), withAdj([adj("sky", { kind: "setAside" })])))).toBe(true);
  });

  it("Full's lines: who, the factor, what changed and why", async () => {
    const { adjustChange } = await import("./adjustWords");
    expect(adjustChange({ kind: "override", grade: "A", was: "B" })).toBe("B → A");
    expect(adjustChange({ kind: "override", status: "pass", was: "warn" })).toBe("Check first → Pass");
    expect(adjustChange({ kind: "setAside", was: "C" })).toBe("set aside");
  });
});
