/** The grade's progress line (UX part 2 PR 3b, Z-9). */
import { describe, expect, it } from "vitest";
import { STEPS } from "@/lib/screen/config";
import { gradeProgress, PROGRESS_WORD } from "./gradeProgress";

describe("gradeProgress", () => {
  it("has words for every step", () => {
    for (const [id] of STEPS) expect(PROGRESS_WORD[id]).toBeTruthy();
  });

  it("before any step: the first step, 1 of 11", () => {
    expect(gradeProgress({})).toMatchObject({ text: "Pulling elevation… 1 of 11", ended: 0, total: 11 });
  });

  it("names the running step, numbered after the ended ones (a failed or skipped step counts as ended)", () => {
    const p = gradeProgress({
      dem: { status: "done" },
      terrain: { status: "done" },
      soils: { status: "fail" },
      sun: { status: "done" },
      sky: { status: "skip" },
      flood: { status: "done" },
      padus: { status: "done" },
      near: { status: "run" },
    });
    expect(p).toMatchObject({
      text: "Finding hospitals, groceries and trailheads… 8 of 11",
      step: "Finding hospitals, groceries and trailheads…",
      count: "8 of 11",
      ended: 7,
      total: 11,
    });
  });

  it("with every step ended, the last one, 11 of 11", () => {
    const all = Object.fromEntries(STEPS.map(([id]) => [id, { status: "done" as const }]));
    expect(gradeProgress(all).text).toBe("Routing drive times… 11 of 11");
  });
});
