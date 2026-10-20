/**
 * VR7 (value-ranking.md §8): the breakdown bar's numbers. On each fixture and for each person, the rows' earned points
 * add up to the card's own points, each row's earned and lost make up its share of an A, and the lines are the grade's
 * and the verdict's cutoffs from config.
 */
import { describe, expect, it } from "vitest";
import { weightsOf } from "../rubric/weights";
import { ZACH, JULIE } from "@/test/support/rubrics";
import { expectedOf } from "@/test/support/expected";
import { SCREEN_CONSTANTS } from "../screen/config";
import { breakdown } from "./breakdown";
import { reportCard } from "./card";

const K = SCREEN_CONSTANTS.card;
const slugs = ["ferney-creek-52-47A", "macks-mountain-35-3", "grayson-mud-creek-6273"] as const;

describe("the breakdown bar (VR7)", () => {
  for (const slug of slugs)
    for (const person of [ZACH, JULIE] as const)
      it(`${slug}, ${person}: earned adds up to the card's points; earned and lost make each row's share of an A`, () => {
        const card = reportCard(expectedOf(slug, "run"), person);
        const b = breakdown(card)!;
        expect(b.points).toBeCloseTo(card.points!, 9);
        expect(b.rows.reduce((a, r) => a + r.share, 0)).toBeCloseTo(1, 9);
        for (const r of b.rows) {
          expect(r.earned + r.lost).toBeCloseTo(r.share * K.points.A, 9);
          expect(r.earned).toBeCloseTo(r.share * K.points[r.grade], 9);
        }
        expect(b.rows.length + b.ungraded.length).toBe(card.rows.length);
      });

  it("the lines: each grade's lower edge, then Contender and Pass", () => {
    const b = breakdown(reportCard(expectedOf("ferney-creek-52-47A", "run"), ZACH))!;
    expect(b.max).toBe(K.points.A);
    expect(b.lines).toEqual([
      ...K.gradeCutoffs.map((at, i) => ({ at, label: "ABCD"[i], kind: "grade" })),
      { at: K.verdict.contender, label: "Contender", kind: "verdict" },
      { at: K.verdict.pass, label: "Not for us below", kind: "verdict" },
    ]);
  });

  it("an ungraded row is left out, and the shares are of the graded rows' weights", () => {
    const card = reportCard(expectedOf("ferney-creek-52-47A", "run"), ZACH);
    const without = { ...card, rows: card.rows.map((r) => (r.key === "sky" ? { ...r, grade: null } : r)) };
    const b = breakdown(without)!;
    expect(b.ungraded.map((u) => u.key)).toEqual(["sky"]);
    const w = weightsOf(ZACH.rubric);
    const total = Object.entries(w).reduce((a, [k, v]) => a + (k === "sky" ? 0 : v), 0);
    expect(b.rows.find((r) => r.key === "elevation")!.share).toBeCloseTo(w.elevation / total, 9);
    expect(breakdown({ ...card, rows: card.rows.map((r) => ({ ...r, grade: null })) })).toBeNull();
  });
});
