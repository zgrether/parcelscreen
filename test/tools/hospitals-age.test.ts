/** `pnpm check:hospitals-age`: a CI warning past 120 days, never a failure (owner, #82 review). */
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { ageWarning, MAX_AGE_DAYS } from "../../scripts/check-hospitals-age.mjs";

describe("the hospital snapshot's age", () => {
  const day = (iso: string) => new Date(`${iso}T12:00:00Z`);

  it("120 days old is fine; 121 warns, naming the date and what to run", () => {
    expect(MAX_AGE_DAYS).toBe(120);
    expect(ageWarning("2026-10-09", day("2027-02-06"))).toBeNull(); // 120 days
    const w = ageWarning("2026-10-09", day("2027-02-07"))!; // 121
    expect(w).toContain("generated 2026-10-09, 121 days ago (over 120)");
    expect(w).toContain("pnpm data:hospitals");
  });

  it("an unreadable date warns too", () => {
    expect(ageWarning("soon", day("2026-10-09"))).toMatch(/isn't a date/);
  });

  it("the CI step exits 0 either way", () => {
    // The committed snapshot, whatever its age: the step must never fail the job.
    expect(() =>
      execFileSync(process.execPath, ["scripts/check-hospitals-age.mts"], { stdio: "pipe" }),
    ).not.toThrow();
  });
});
