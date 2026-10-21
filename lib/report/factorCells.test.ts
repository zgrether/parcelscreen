/** The factor cells (step 10b plan §1, §4): rubric order, Musts first, a limit merged with its row, Don't care out. */
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { ZACH } from "@/test/support/rubrics";
import type { NamedRubric, Rubric } from "../rubric/types";
import { reportCard } from "./card";
import { mustLines, rankedRows, shownRankedRows } from "./cardLines";
import { factorCells } from "./factorCells";

const MUD = expectedOf("grayson-mud-creek-6273", "run");
/** Zach's real shape (step 10b plan §4): a walk-away limit on Elevation, which stays ranked too. */
const withLimit = (threshold: number): NamedRubric => {
  const r: Rubric = { ...ZACH.rubric, musts: [...ZACH.rubric.musts, { factor: "elevation", threshold }] };
  return { ...ZACH, rubric: r };
};

describe("factor cells", () => {
  it("in the rubric's order: the kept gates as marks, then the ranked rows as letters; Don't care left out", () => {
    const cells = factorCells(reportCard(MUD, ZACH));
    expect(cells.map((c) => [c.short, c.kind, c.text])).toEqual([
      ["Flood", "must", "✓"],
      ["Access", "must", "✓"],
      ["Own drive", "must", "✓"],
      ["Septic", "must", "!"],
      ["Elev", "grade", "A"],
      ["Sun", "grade", "A"],
      ["Room", "grade", "B"],
      ["Sky", "grade", "A"],
      ["Trails", "grade", "B"],
      ["Garden", "grade", "C"],
      ["Town", "grade", "C"],
    ]);
    // The starting list's Driveway is Don't care: no cell.
    expect(cells.some((c) => c.key === "driveway")).toBe(false);
    expect(cells[3]!.detail).toMatch(/^Check first: /);
    expect(cells[0]!.detail).toMatch(/^Pass: /);
  });

  it("scores higher for better: pass over check first over fail, A over F; unknown is null", () => {
    const cells = factorCells(reportCard(MUD, ZACH));
    const by = (k: string) => cells.find((c) => c.key === k)!.score;
    expect(by("floodplain")! > by("septic")!).toBe(true);
    expect(by("elevation")! > by("town")!).toBe(true);
  });
});

describe("one row per factor (the duplicate rows, step 10b plan §4)", () => {
  it("a limit that's ranked too is one Must line with its letter, and its tier skips it", () => {
    const card = reportCard(MUD, withLimit(1_800));
    const line = mustLines(card).find((m) => m.key === "elevation")!;
    expect(line).toMatchObject({ status: "pass", grade: "A", detail: "3,543 ft, at least 1,800 ft" });
    expect(shownRankedRows(card).should.some((r) => r.key === "elevation")).toBe(false);
    // It still counts where the rubric ranks it: the grade is the card's as before.
    expect(rankedRows(card).should.some((r) => r.key === "elevation")).toBe(true);
    expect([card.points, card.grade, card.verdict]).toEqual(
      (({ points, grade, verdict }) => [points, grade, verdict])(reportCard(MUD, ZACH)),
    );
    // In the grid: one column, among the Musts, "✓A".
    const cells = factorCells(card).filter((c) => c.key === "elevation");
    expect(cells.map((c) => [c.kind, c.text])).toEqual([["must", "✓A"]]);
  });

  it("a failed limit reads its value first, then the limit", () => {
    const line = mustLines(reportCard(MUD, withLimit(4_000))).find((m) => m.key === "elevation")!;
    expect(line).toMatchObject({ status: "fail", grade: "A", detail: "3,543 ft, at least 4,000 ft" });
  });
});
