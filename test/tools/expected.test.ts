/**
 * The port's output on every golden scenario equals test/fixtures/<slug>/expected.json (Batch A §1).
 *
 *   pnpm test                 checks it (this file runs with the rest)
 *   pnpm expected             regenerates the files (vitest --mode expected), for a PR that changes numbers
 *
 * A regenerated file is a numbers change: the PR must declare it and quote `pnpm diff:prototype`, or the
 * expected-guard CI job fails.
 */
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ScreenResult } from "@/lib/screen/types";
import { differences } from "../support/compare";
import { EXPECTED, expectedPath, loadExpected, type ExpectedResults } from "../support/expected";
import { FIXTURE_SLUGS } from "../support/fixtures";
import { runScenario, SCENARIOS } from "../support/scenarios";

const WRITE = import.meta.env.MODE === "expected";

/** Stable bytes: the run's clock isn't part of what's expected, so it's written as a fixed value. */
const forFile = (r: ScreenResult): ScreenResult => ({ ...r, runAt: "(not compared)" });

describe.each(FIXTURE_SLUGS)("%s: the port's output", (slug) => {
  if (WRITE) {
    it("is written to expected.json", async () => {
      const out: ExpectedResults = {};
      for (const scenario of SCENARIOS[slug]) out[scenario] = forFile(await runScenario(slug, scenario));
      writeFileSync(expectedPath(slug), JSON.stringify(out, null, 1) + "\n");
    }, 120_000);
    return;
  }
  it.each(SCENARIOS[slug])("%s equals expected.json", async (scenario) => {
    const want = loadExpected(slug)[scenario];
    expect(want, `expected.json has no ${scenario}: run pnpm expected`).toBeDefined();
    expect(differences(await runScenario(slug, scenario), want!, EXPECTED)).toEqual([]);
  });
});
