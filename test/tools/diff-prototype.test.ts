/**
 * Every difference between the port's expected output and the prototype's frozen goldens (Batch A §1).
 *
 *   pnpm diff:prototype       writes test-results/diff-prototype.txt and prints it
 *
 * It is a report, not a check: the differences are the deliberate departures from the prototype, and a PR
 * that changes expected.json quotes this output (the expected-guard CI job looks for its summary line). The
 * comparison holds the port to the prototype exactly as Phase 0 did: asPrototype() and the PARITY tolerances.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import { differences } from "../support/compare";
import { expectedOf } from "../support/expected";
import { FIXTURE_SLUGS, loadFixture, type FixtureSlug } from "../support/fixtures";
import { fromPrototype } from "../support/fromPrototype";
import { asPrototype, PARITY } from "../support/parity";
import { SCENARIOS } from "../support/scenarios";
import { prototypeDiffReport, REPORT_FILE } from "./diffReport";

describe.runIf(import.meta.env.MODE === "diff-prototype")("diff:prototype", () => {
  it("writes the report", () => {
    const perFixture = new Map<FixtureSlug, string[]>();
    for (const slug of FIXTURE_SLUGS) {
      const lines: string[] = [];
      for (const scenario of SCENARIOS[slug]) {
        const golden = loadFixture(slug).goldens[scenario]!;
        let found: string[];
        try {
          found = differences(asPrototype(expectedOf(slug, scenario), golden), fromPrototype(golden), PARITY);
        } catch (e) {
          found = [`(asPrototype) ${(e as Error).message.split("\n")[0]}`];
        }
        lines.push(...found.map((d) => `${scenario}: ${d}`));
      }
      perFixture.set(slug, lines);
    }
    const text = prototypeDiffReport(perFixture);
    mkdirSync("test-results", { recursive: true });
    writeFileSync(REPORT_FILE, text);
    process.stdout.write(`\n${text}`);
  });
});
