import { describe, expect, it } from "vitest";
import { gradeButton, gradeLabel, logLine, runSeconds, type GradeState } from "./gradeButton";

const FRESH = { boundary: false, house: false, lines: false, settings: false };
const graded: GradeState = { running: false, graded: true, fresh: FRESH, sessionLive: true, failed: 0 };
const label = (s: GradeState) => {
  const b = gradeButton(s);
  return b ? gradeLabel(b) : null;
};

describe("the grade button (step 4c, plan §2)", () => {
  it("before the first run, and while one runs", () => {
    expect(label({ ...graded, graded: false, fresh: null })).toBe("Grade this parcel");
    expect(label({ ...graded, running: true })).toBe("Grading…");
    expect(label({ ...graded, graded: false, running: true })).toBe("Grading…");
  });

  it("a run that stopped on an error: Try again, whether or not there's a kept run", () => {
    expect(label({ ...graded, stopped: true })).toBe("Try again");
    expect(label({ ...graded, graded: false, fresh: null, stopped: true })).toBe("Try again");
    expect(label({ ...graded, stopped: true, running: true })).toBe("Grading…");
  });

  it("after a clean run with nothing changed: no button", () => {
    expect(gradeButton(graded)).toBeNull();
  });

  it("names the reason, the first in order: boundary, house, lines, settings, then failed steps", () => {
    expect(label({ ...graded, fresh: { ...FRESH, boundary: true, lines: true }, failed: 3 })).toBe(
      "Grade again: boundary changed",
    );
    expect(label({ ...graded, fresh: { ...FRESH, house: true, settings: true }, sessionLive: false })).toBe(
      "Grade again: house moved",
    );
    expect(label({ ...graded, fresh: { ...FRESH, lines: true, settings: true } })).toBe(
      "Grade again: lines changed",
    );
    expect(label({ ...graded, fresh: { ...FRESH, settings: true } })).toBe("Grade again: settings changed");
    expect(label({ ...graded, failed: 3 })).toBe("Try again: 3 sources didn't load");
    expect(label({ ...graded, failed: 1 })).toBe("Try again: 1 source didn't load");
  });

  it("a moved house with a live session is re-assessed without a run: no reason", () => {
    expect(gradeButton({ ...graded, fresh: { ...FRESH, house: true }, sessionLive: true })).toBeNull();
  });
});

describe("the one-line log (owner, 10/19: the count appears once)", () => {
  it("the run's time; the count only when the button doesn't carry it", () => {
    const retry = gradeButton({ ...graded, failed: 3 });
    expect(logLine(66, 3, retry)).toBe("Graded in 66 s");
    const again = gradeButton({ ...graded, failed: 3, fresh: { ...FRESH, boundary: true } });
    expect(logLine(66, 3, again)).toBe("Graded in 66 s · 3 sources didn't load");
    expect(logLine(66, 0, null)).toBe("Graded in 66 s");
    expect(logLine(null, 0, null)).toBe("Graded");
  });

  it("from the steps' times: the first start to the last end", () => {
    expect(runSeconds([{ startedAt: 1000, ms: 200 }, { startedAt: 1300, ms: 65_500 }, undefined])).toBe(66);
    expect(runSeconds([{ startedAt: 1000 }])).toBeNull();
    expect(runSeconds([])).toBeNull();
  });
});
