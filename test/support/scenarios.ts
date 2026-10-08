/**
 * The golden scenarios, run by the port on the recorded fixtures (Batch A §1). One list, shared by the
 * expected.json generator and its check (test/tools/expected.test.ts), the prototype diff
 * (test/tools/diff-prototype.test.ts) and the screen tests.
 */
import { createHttpClient } from "@/lib/http";
import { pickParcelAt } from "@/lib/geo/parcels";
import { deriveParcel } from "@/lib/geo/recipe";
import { DEFAULT_ENDPOINTS, DEFAULT_USER_CONFIG, SCREEN_CONSTANTS } from "@/lib/screen/config";
import { evaluateAt, screen, setHouse, type ScreenDeps, type ScreenOutput } from "@/lib/screen";
import type { ScreenInput, ScreenResult } from "@/lib/screen/types";
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

const parcels = new Map<FixtureSlug, Promise<Pick<ScreenInput, "polygon" | "ownLand">>>();

/**
 * The fixture's parcel as the app screens it: the county record at the fixture's point, answered from the
 * HAR, through the recipe (lib/geo/recipe.ts). For a one-part record it's the recorded polygon; for Grayson
 * Mud Creek's two parts it's the bridged boundary with the parts as own land (follow-up 29).
 */
export function fixtureParcel(slug: FixtureSlug): Promise<Pick<ScreenInput, "polygon" | "ownLand">> {
  let p = parcels.get(slug);
  if (!p) {
    p = (async () => {
      const { point } = loadFixture(slug).input;
      const { parcel, report } = await pickParcelAt(depsFor(slug).http!, DEFAULT_ENDPOINTS.parcels, [
        point.lat,
        point.lon,
      ]);
      if (!parcel) throw new Error(`${slug}: no parcel in the HAR at its point (${report.join("; ")})`);
      const d = deriveParcel({ parts: [parcel] }, SCREEN_CONSTANTS.combine);
      if (!d.ok) throw new Error(`${slug}: the recipe failed (${d.reason})`);
      return { polygon: d.record.geo.geometry, ...(d.bridgeAcres > 0 ? { ownLand: d.own.geometry } : {}) };
    })();
    parcels.set(slug, p);
  }
  return p;
}

/** A plain screen of the fixture's parcel with the default settings, as the goldens were recorded. */
export async function runFixture(
  slug: FixtureSlug,
  extra: Partial<Parameters<typeof screen>[0]> = {},
  deps?: ScreenDeps,
): Promise<ScreenOutput> {
  return screen(
    { ...(await fixtureParcel(slug)), config: DEFAULT_USER_CONFIG, ...extra },
    undefined,
    deps ?? depsFor(slug),
  );
}

/**
 * One scenario's result, as the port computes it today. `deps` makes each run's dependencies (the replay by
 * default; `pnpm record:port` passes a live-recording one).
 */
export async function runScenario(
  slug: FixtureSlug,
  scenario: Scenario,
  deps: () => ScreenDeps = () => depsFor(slug),
): Promise<ScreenResult> {
  const input = loadFixture(slug).input;
  switch (scenario) {
    case "run":
      return (await runFixture(slug, {}, deps())).result;
    case "evaluateSite2": {
      const at = input.evaluateSite2;
      if (!at) throw new Error(`${slug} has no evaluateSite2 point`);
      return (await evaluateAt(await runFixture(slug, {}, deps()), at.ll, at.label)).result;
    }
    case "setHouse":
      return (await setHouse(await runFixture(slug, {}, deps()), houseOf(slug))).result;
    case "houseRun":
      return (await runFixture(slug, { house: houseOf(slug) }, deps())).result;
  }
}

function houseOf(slug: FixtureSlug): [number, number] {
  const h = loadFixture(slug).input.house;
  if (!h) throw new Error(`${slug} has no synthetic house`);
  return h.ll;
}
