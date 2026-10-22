/**
 * The priorities page's "Try it" strip (step 3 plan §4; the owner's words, 10/18) on Mud Creek, the page's sample: the
 * card before and now, and the two factors that moved most, each as one plain sentence.
 */
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { defaultRubric } from "../rubric/default";
import { moveCard, setBandEdge, type EditResult } from "../rubric/edit";
import type { Rubric } from "../rubric/types";
import { rubricPreview } from "./rubricPreview";

const D = defaultRubric();
const MUD = expectedOf("grayson-mud-creek-6273", "run");
const after = (r: EditResult): Rubric => {
  if (!r.ok) throw new Error(r.reason);
  return r.rubric;
};

describe("the preview", () => {
  it("unchanged: the same card twice, nothing moved", () => {
    const p = rubricPreview(MUD, D, D);
    expect([p.before.grade, p.before.verdict]).toEqual(["B", "Contender"]);
    expect(p.now.points).toBe(p.before.points);
    expect(p.moved).toEqual([]);
  });

  it("the first reorder: Mud Creek moves B → A, and the two rows whose weight moved most say they count more or less", () => {
    const now = after(moveCard(D, { kind: "factor", factor: "sky" }, "should", 1));
    const p = rubricPreview(MUD, D, now);
    expect(p.before.grade).toBe("B");
    expect(p.moved).toHaveLength(2);
    for (const m of p.moved) expect(m.why).toMatch(/^.+ now counts (more|less)$/);
    expect(p.moved.map((m) => m.why)).toContain("Night sky now counts more");
    expect(Math.abs(p.moved[0]!.delta)).toBeGreaterThanOrEqual(Math.abs(p.moved[1]!.delta));
  });

  it("a dealbreaker that warned, moved to Won't, comes first: it decides the verdict", () => {
    // Mud Creek's septic warns (no soil better than very limited).
    const now = after(moveCard(D, { kind: "factor", factor: "septic" }, "wont"));
    const p = rubricPreview(MUD, D, now);
    expect(p.moved[0]).toEqual({ key: "septic", label: "Septic", delta: 0, why: "Septic no longer checked" });
  });

  it("a band moved: the row's new letter is named", () => {
    const now = setBandEdge(D, "elevationFt", 4000);
    const p = rubricPreview(MUD, D, now);
    expect(p.moved[0]!.key).toBe("elevation");
    expect(p.moved[0]!.why).toMatch(/^Elevation at the build site now gets an? [A-F]$/);
    expect(p.moved[0]!.delta).toBeLessThan(0);
  });

  it("a limit added is named, with its words", () => {
    const now = after(moveCard(D, { kind: "factor", factor: "hospital" }, "must"));
    const p = rubricPreview(MUD, D, now);
    expect(p.moved[0]).toEqual({
      key: "hospital",
      label: "Hospital",
      delta: 0,
      why: "Out: Hospital misses its limit (ER within 30 min)",
    });
  });
});
