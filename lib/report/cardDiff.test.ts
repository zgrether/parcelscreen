/** The grade note's diff (step 8b, owner on #228): which Must lines and rows moved, and the words for it. */
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { defaultNamedRubric } from "../rubric/default";
import { reportCard, type Card } from "./card";
import { cardDiff, gradeNote, noteTarget, unchanged } from "./cardDiff";
import { mustLines, rankedRows } from "./cardLines";

const card = reportCard(expectedOf("grayson-mud-creek-6273", "run"), defaultNamedRubric());
const septic = card.gates.find((g) => g.key === "septic")!;
/** The same card with one gate's status changed. */
const withGate = (c: Card, key: string, status: Card["gates"][number]["status"]): Card => ({
  ...c,
  gates: c.gates.map((g) => (g.key === key ? { ...g, status } : g)),
});
const firstRow = rankedRows(card).should[0] ?? rankedRows(card).could[0]!;
const withRow = (c: Card, key: string, grade: Card["rows"][number]["grade"]): Card => ({
  ...c,
  rows: c.rows.map((r) => (r.key === key ? { ...r, grade } : r)),
});

describe("the grade note's diff (step 8b)", () => {
  it("the fixture's card has Septic as a Must, and a ranked row", () => {
    expect(mustLines(card).some((m) => m.key === "septic")).toBe(true);
    expect(firstRow).toBeDefined();
  });

  it("nothing moved: no note", () => {
    const d = cardDiff(card, { ...card });
    expect(unchanged(d)).toBe(true);
    expect(gradeNote(d)).toBeNull();
  });

  it("one Must to pass, the letter and verdict as they were: a sentence", () => {
    const before = withGate(card, "septic", "warn");
    const after = withGate(card, "septic", "pass");
    const d = cardDiff(before, after);
    expect(d.changes).toEqual([
      {
        kind: "must",
        key: "septic",
        label: mustLines(card).find((m) => m.key === "septic")!.label,
        from: "warn",
        to: "pass",
      },
    ]);
    expect(gradeNote(d)).toBe(`${d.changes[0]!.label} now passes`);
    expect(noteTarget(d)).toBe("septic");
    expect(septic).toBeDefined();
  });

  it("a Must and the parcel's letter: marks and letters", () => {
    const before = { ...withGate(card, "septic", "warn"), grade: "B" as const };
    const after = { ...withGate(card, "septic", "pass"), grade: "A" as const };
    expect(gradeNote(cardDiff(before, after))).toBe(
      `${mustLines(card).find((m) => m.key === "septic")!.label}: ! → ✓ · B → A`,
    );
  });

  it("a ranked row's letter, and the verdict", () => {
    const before = { ...withRow(card, firstRow.key, "C"), verdict: "Maybe" as const };
    const after = { ...withRow(card, firstRow.key, "B"), verdict: "Contender" as const };
    const d = cardDiff(before, after);
    expect(d.changes).toEqual([
      { kind: "row", key: firstRow.key, label: firstRow.label, from: "C", to: "B" },
    ]);
    expect(gradeNote(d)).toBe(`${firstRow.label}: C → B · Maybe → Contender`);
  });

  it("a row the card hides (Don't care) doesn't count; the letter alone points at the answer", () => {
    const hidden = card.rows.find(
      (r) => ![...rankedRows(card).should, ...rankedRows(card).could].includes(r),
    );
    if (hidden) {
      const d = cardDiff(withRow(card, hidden.key, "A"), withRow(card, hidden.key, "D"));
      expect(d.changes).toEqual([]);
    }
    const d = cardDiff({ ...card, grade: "B" }, { ...card, grade: "C" });
    expect(gradeNote(d)).toBe("B → C");
    expect(noteTarget(d)).toBe("answer");
  });

  it("more than two rows: two named, the rest counted", () => {
    const keys = mustLines(card).filter((m) => m.key !== "septic" && card.gates.some((g) => g.key === m.key));
    let before = withGate(card, "septic", "warn");
    let after = withGate(card, "septic", "pass");
    for (const m of keys.slice(0, 2)) {
      before = withGate(before, m.key, "warn");
      after = withGate(after, m.key, "fail");
    }
    const d = cardDiff(before, after);
    if (d.changes.length > 2) expect(gradeNote(d)).toMatch(new RegExp(` · ${d.changes.length - 2} more$`));
  });
});
