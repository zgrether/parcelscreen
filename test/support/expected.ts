/**
 * The port's expected output per fixture (Batch A §1, owner 2026-10-08): test/fixtures/<slug>/expected.json,
 * one ScreenResult per scenario. The prototype's golden.json is frozen as the Phase 0 parity record; tests of
 * the engine's output compare against this file instead, and it changes only in a PR that declares a numbers
 * change (the expected-guard CI job).
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ScreenResult } from "@/lib/screen/types";
import type { CompareOptions } from "./compare";
import type { FixtureSlug } from "./fixtures";
import type { Scenario } from "./scenarios";

export type ExpectedResults = Partial<Record<Scenario, ScreenResult>>;

export const expectedPath = (slug: FixtureSlug): string =>
  join(resolve(process.cwd(), "test", "fixtures"), slug, "expected.json");

const cache = new Map<FixtureSlug, ExpectedResults>();

export function loadExpected(slug: FixtureSlug): ExpectedResults {
  let e = cache.get(slug);
  if (!e) {
    e = JSON.parse(readFileSync(expectedPath(slug), "utf8")) as ExpectedResults;
    cache.set(slug, e);
  }
  return e;
}

/** One scenario's expected result; throws if the fixture didn't record it. */
export function expectedOf(slug: FixtureSlug, scenario: Scenario): ScreenResult {
  const r = loadExpected(slug)[scenario];
  if (!r) throw new Error(`${slug} has no expected ${scenario}`);
  return r;
}

/**
 * The port against its own recorded output, in Node (expected.json is written in Node): the same code and the
 * same Turf on both sides, so no path needs more than the default. `runAt` is the clock.
 */
export const EXPECTED: CompareOptions = { ignore: ["runAt"] };

const ROAD_FAMILY = 1e-6;
/**
 * The Web Worker's result in Chromium (the e2e) against expected.json from Node. Same Turf (7.4.0), different
 * engines: turf.nearestPointOnLine and pointToLineDistance amplify the last-bit Math differences (plan §5).
 * Measured in A1's e2e: up to 1.6e-7 relative on the road family (Ferney's house.roadRunFt, 292.98 ft) and
 * 3.1e-9 on driveway.roadsNearestFt; these allow about 6× and 30×. Everything discrete stays exact.
 */
export const EXPECTED_BROWSER: CompareOptions = {
  ignore: ["runAt"],
  paths: {
    "road.runFt": { rel: ROAD_FAMILY },
    "road.gradePct": { rel: ROAD_FAMILY },
    "sites.roadRunFt": { rel: ROAD_FAMILY },
    "sites.roadGrade": { rel: ROAD_FAMILY },
    "sites.driveFt": { rel: ROAD_FAMILY },
    "sites.c.driveway": { rel: ROAD_FAMILY },
    "house.roadRunFt": { rel: ROAD_FAMILY },
    "house.roadGrade": { rel: ROAD_FAMILY },
    "house.driveFt": { rel: ROAD_FAMILY },
    "house.c.driveway": { rel: ROAD_FAMILY },
    "driveway.roadsNearestFt": { rel: 1e-7 },
  },
};
