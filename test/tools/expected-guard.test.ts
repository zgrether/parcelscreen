/**
 * The expected-guard rule's tests, and (with --mode guard, in CI) the check itself on a pull request:
 *   CHANGED_FILES   a file listing the PR's changed paths, one per line
 *   PR_BODY        the PR description (passed through the environment, never interpolated into a script)
 * and the report pnpm diff:prototype wrote just before.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { prototypeDiffReport, REPORT_FILE, summaryOf } from "./diffReport";
import { checkExpectedGuard } from "./guard";

const report = prototypeDiffReport(
  new Map([
    ["ferney-creek-52-47A", []],
    ["macks-mountain-35-3", []],
    ["grayson-mud-creek-6273", ["run: driveway.roadsNearestFt: 18.26 vs 18.43 (diff 1.66e-1)"]],
  ]),
);
const summary = summaryOf(report)!;
const EXPECTED = ["test/fixtures/grayson-mud-creek-6273/expected.json"];

describe("the expected-guard rule", () => {
  it("the report ends in a summary line with a hash and the counts", () => {
    expect(summary).toMatch(/^diff:prototype [0-9a-f]{12}: 1 difference \(ferney 0, macks 0, grayson 1\)$/);
    expect(summaryOf(`${report}\n`)).toBe(summary);
  });

  it("the hash changes with any line of the report", () => {
    const other = prototypeDiffReport(
      new Map([["grayson-mud-creek-6273", ["run: driveway.roadsNearestFt: 18.26 vs 18.44 (diff 1.67e-1)"]]]),
    );
    const hash = (s: string) => /^diff:prototype ([0-9a-f]{12}):/.exec(s)![1];
    expect(hash(summaryOf(other)!)).not.toBe(hash(summary));
  });

  it("passes when no expected.json changed, whatever the description", () => {
    expect(checkExpectedGuard({ changedFiles: ["lib/screen/padus.ts"], body: "", summary: null }).ok).toBe(
      true,
    );
  });

  it("passes with a declaration and the current output", () => {
    const body = `Numbers change: Grayson's nearest road, see below.\n\n\`\`\`\n${report}\`\`\`\n`;
    expect(checkExpectedGuard({ changedFiles: EXPECTED, body, summary })).toMatchObject({ ok: true });
    // The declaration may be a list item or bold, as PR descriptions write it.
    const bold = `- **Numbers change:** none\n${report}`;
    expect(checkExpectedGuard({ changedFiles: EXPECTED, body: bold, summary }).ok).toBe(true);
  });

  it("fails without the declaration", () => {
    const r = checkExpectedGuard({ changedFiles: EXPECTED, body: report, summary });
    expect(r.ok).toBe(false);
    expect(r.message).toContain('no "Numbers change:" line');
  });

  it("fails without the output, or with an older run's output", () => {
    const missing = checkExpectedGuard({ changedFiles: EXPECTED, body: "Numbers change: yes", summary });
    expect(missing.ok).toBe(false);
    expect(missing.message).toContain(summary);
    const stale = checkExpectedGuard({
      changedFiles: EXPECTED,
      body: `Numbers change: yes\n${summary.replace(/^diff:prototype [0-9a-f]{12}/, "diff:prototype 000000000000")}`,
      summary,
    });
    expect(stale.ok).toBe(false);
  });

  it("fails when diff:prototype didn't run", () => {
    const r = checkExpectedGuard({
      changedFiles: EXPECTED,
      body: `Numbers change: yes\n${summary}`,
      summary: null,
    });
    expect(r).toMatchObject({ ok: false });
    expect(r.message).toContain("no summary line");
  });

  it("only a fixture's expected.json counts", () => {
    const r = checkExpectedGuard({
      changedFiles: [
        "test/fixtures/README.md",
        "test/fixtures/grayson-mud-creek-6273/golden.json",
        "x/expected.json",
      ],
      body: "",
      summary: null,
    });
    expect(r.ok).toBe(true);
  });
});

describe.runIf(import.meta.env.MODE === "guard")("the expected-guard check on this pull request", () => {
  it("passes", () => {
    const changedFiles = readFileSync(process.env.CHANGED_FILES ?? "", "utf8")
      .split(/\r?\n/)
      .filter(Boolean);
    const r = checkExpectedGuard({
      changedFiles,
      body: process.env.PR_BODY ?? "",
      summary: existsSync(REPORT_FILE) ? summaryOf(readFileSync(REPORT_FILE, "utf8")) : null,
    });
    expect(r.ok, r.message).toBe(true);
  });
});
