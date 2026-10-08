/**
 * The golden scenarios, run by the port on the recorded fixtures (Batch A §1). One list, shared by the
 * expected.json generator and its check (test/tools/expected.test.ts), the prototype diff
 * (test/tools/diff-prototype.test.ts) and the screen tests.
 */
import { createHttpClient } from "@/lib/http";
import { DEFAULT_USER_CONFIG } from "@/lib/screen/config";
import { evaluateAt, screen, setHouse, type ScreenDeps, type ScreenOutput } from "@/lib/screen";
import type { ScreenResult } from "@/lib/screen/types";
import { FIXTURE_SLUGS, loadFixture, type FixtureGoldens, type FixtureSlug } from "./fixtures";
import { instantClock } from "./pipeline";

export type Scenario = keyof FixtureGoldens;

/** Which scenarios each fixture recorded (test/fixtures/README.md, "Scenarios in golden.json"). */
export const SCENARIOS: Readonly<Record<FixtureSlug, readonly Scenario[]>> = {
  "ferney-creek-52-47A": ["run", "setHouse", "houseRun"],
  "macks-mountain-35-3": ["run", "evaluateSite2"],
  "grayson-mud-creek-6273": ["run", "evaluateSite2"],
};

export const ALL_SCENARIOS: readonly { slug: FixtureSlug; scenario: Scenario }[] = FIXTURE_SLUGS.flatMap(
  (slug) => SCENARIOS[slug].map((scenario) => ({ slug, scenario })),
);

/** A fresh offline client over the fixture's HAR. `wrap` lets a test intercept the replayed fetch. */
export function depsFor(
  slug: FixtureSlug,
  wrap?: (f: typeof fetch) => typeof fetch,
): ScreenDeps & { requests: string[] } {
  const replay = loadFixture(slug).replayFetch();
  const fetchImpl = wrap ? wrap(replay as unknown as typeof fetch) : (replay as unknown as typeof fetch);
  return {
    http: createHttpClient({ env: "node", fetchImpl, clock: instantClock() }),
    sleep: async () => {},
    requests: replay.requests,
  };
}

/** A plain screen of the fixture's parcel with the default settings, as the goldens were recorded. */
export function runFixture(
  slug: FixtureSlug,
  extra: Partial<Parameters<typeof screen>[0]> = {},
  deps?: ScreenDeps,
): Promise<ScreenOutput> {
  return screen(
    { polygon: loadFixture(slug).input.polygon.geometry, config: DEFAULT_USER_CONFIG, ...extra },
    undefined,
    deps ?? depsFor(slug),
  );
}

/** One scenario's result, as the port computes it today. */
export async function runScenario(slug: FixtureSlug, scenario: Scenario): Promise<ScreenResult> {
  const input = loadFixture(slug).input;
  switch (scenario) {
    case "run":
      return (await runFixture(slug)).result;
    case "evaluateSite2": {
      const at = input.evaluateSite2;
      if (!at) throw new Error(`${slug} has no evaluateSite2 point`);
      return (await evaluateAt(await runFixture(slug), at.ll, at.label)).result;
    }
    case "setHouse":
      return (await setHouse(await runFixture(slug), houseOf(slug))).result;
    case "houseRun":
      return (await runFixture(slug, { house: houseOf(slug) })).result;
  }
}

function houseOf(slug: FixtureSlug): [number, number] {
  const h = loadFixture(slug).input.house;
  if (!h) throw new Error(`${slug} has no synthetic house`);
  return h.ll;
}
