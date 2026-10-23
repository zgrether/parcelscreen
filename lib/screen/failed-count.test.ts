/**
 * The failed count under concurrent load (2026-10-22, the flaky grade.spec): "Try again: N sources didn't load" counts
 * each failed step once. Several screens of Mud Creek at once, with FEMA, PAD-US and OSRM unanswered as in the e2e's
 * recording: each run fails exactly those three, once each, and the count is 3, never more.
 */
import { describe, expect, it } from "vitest";
import { depsFor, runFixture } from "@/test/support/scenarios";
import { failedCount, gradeButton, sourcesDidntLoad } from "@/lib/client/gradeButton";

/** The e2e's recording lacks these: refused, as its replay refuses them. */
const UNANSWERED = /hazards\.fema\.gov|Fee_Managers_PADUS|router\.project-osrm\.org/;

const refusing = (f: typeof fetch): typeof fetch =>
  ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return UNANSWERED.test(url) ? Promise.reject(new TypeError("Failed to fetch")) : f(input, init);
  }) as typeof fetch;

describe("the failed count under concurrent load", () => {
  it("four screens at once: each fails flood, padus and drive, once each; the button says 3", async () => {
    const runs = await Promise.all(
      [0, 1, 2, 3].map(() =>
        runFixture("grayson-mud-creek-6273", {}, depsFor("grayson-mud-creek-6273", refusing)),
      ),
    );
    for (const { result } of runs) {
      expect([...result.failed].sort()).toEqual(["drive", "flood", "padus"]);
      expect(new Set(result.failed).size).toBe(result.failed.length);
      const button = gradeButton({
        running: false,
        graded: true,
        fresh: null,
        sessionLive: true,
        failed: failedCount(result.failed),
      });
      expect(button).toEqual({ kind: "retry", failed: 3 });
      expect(sourcesDidntLoad(failedCount(result.failed))).toBe("3 sources didn't load");
    }
  }, 300_000);

  it("a step listed twice still counts once", () => {
    expect(failedCount(["flood", "drive", "drive"])).toBe(2);
  });
});
