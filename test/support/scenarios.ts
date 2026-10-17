/**
 * The golden scenarios, run by the port on the recorded fixtures (Batch A §1). One list, shared by the
 * expected.json generator and its check (test/tools/expected.test.ts), the prototype diff
 * (test/tools/diff-prototype.test.ts) and the screen tests.
 */
import { createHttpClient, type HttpClient } from "@/lib/http";
import { pickParcelAt } from "@/lib/geo/parcels";
import { fieldsFor, fullRecord } from "@/lib/geo/parcelTiles";
import { deriveParcel } from "@/lib/geo/recipe";
import { DEFAULT_ENDPOINTS, DEFAULT_USER_CONFIG, SCREEN_CONSTANTS } from "@/lib/screen/config";
import { evaluateAt, screen, setHouse, type ScreenDeps, type ScreenOutput } from "@/lib/screen";
import type { ScreenInput, ScreenResult, UserConfig } from "@/lib/screen/types";
import { FIXTURE_SLUGS, loadFixture, type FixtureGoldens, type FixtureSlug } from "./fixtures";
import { instantClock } from "./pipeline";

export type Scenario = keyof FixtureGoldens;

/**
 * Which scenarios each fixture runs: for the prototype-backed ones, what the prototype recorded (test/fixtures/README.md,
 * "Scenarios in golden.json"); a port-only one (step 2) has no golden, only expected.json.
 */
export const SCENARIOS: Readonly<Record<FixtureSlug, readonly Scenario[]>> = {
  "ferney-creek-52-47A": ["run", "setHouse", "houseRun"],
  "macks-mountain-35-3": ["run", "evaluateSite2"],
  "grayson-mud-creek-6273": ["run", "evaluateSite2"],
  "roan-hwy-143-099-046-02": ["run", "evaluateSite2"],
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
 * Mud Creek's two parts it's the bridged boundary with the parts as own land (follow-up 29). `http` is the run's
 * own client when it brings one (record:port's, which records what the HAR lacks); the replay's answer is cached.
 */
export function fixtureParcel(
  slug: FixtureSlug,
  http?: HttpClient,
): Promise<Pick<ScreenInput, "polygon" | "ownLand">> {
  let p = http ? undefined : parcels.get(slug);
  if (!p) {
    p = (async () => {
      const { point } = loadFixture(slug).input;
      const client = http ?? depsFor(slug).http!;
      const { parcel: picked, report } = await pickParcelAt(client, DEFAULT_ENDPOINTS.parcels, [
        point.lat,
        point.lon,
      ]);
      if (!picked) throw new Error(`${slug}: no parcel in the HAR at its point (${report.join("; ")})`);
      // Where a parcel can be several features (Tennessee, step 2) the app takes the full record, as a tap does.
      const parcel = fieldsFor(picked.source).groupById ? await fullRecord(client, picked) : picked;
      const d = deriveParcel({ parts: [parcel] }, SCREEN_CONSTANTS.combine);
      if (!d.ok) throw new Error(`${slug}: the recipe failed (${d.reason})`);
      return { polygon: d.record.geo.geometry, ...(d.bridgeAcres > 0 ? { ownLand: d.own.geometry } : {}) };
    })();
    if (!http) parcels.set(slug, p);
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
    { ...(await fixtureParcel(slug, deps?.http)), config: DEFAULT_USER_CONFIG, ...extra },
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
  config?: UserConfig,
): Promise<ScreenResult> {
  const input = loadFixture(slug).input;
  const extra = config ? { config } : {};
  switch (scenario) {
    case "run":
      return (await runFixture(slug, extra, deps())).result;
    case "evaluateSite2": {
      // The prototype's recorded site #2 point, labelled as the app labels the pin there now: since A3's
      // re-ranking the same bench can hold another rank (Macks's 9.6 ac bench is #1). The browser test taps
      // that same pin (e2e/screen.spec.ts).
      const at = input.evaluateSite2;
      if (!at) throw new Error(`${slug} has no evaluateSite2 point`);
      const out = await runFixture(slug, extra, deps());
      return (await evaluateAt(out, at.ll, sitePinLabel(out.result, at.ll) ?? at.label)).result;
    }
    case "setHouse":
      return (await setHouse(await runFixture(slug, extra, deps()), houseOf(slug))).result;
    case "houseRun":
      return (await runFixture(slug, { ...extra, house: houseOf(slug) }, deps())).result;
  }
}

/**
 * The rules most driveway tests were written under: a 10% grade limit and a 20% veto. The defaults are 15% and 25%
 * since #103's decisions (2026-10-11); at 15% Grayson's #1 is reached on its own land within the limit, so the
 * over-limit, easement and "no practical drive" cases the fixtures exercise appear only at 10%.
 */
export const RULES_AT_10: UserConfig = { ...DEFAULT_USER_CONFIG, roadMaxGradePct: 10, roadVetoGradePct: 20 };

/** "site #N" for the ranked site at this point, as the map's pin there is labelled; undefined if none is. */
export function sitePinLabel(result: ScreenResult, ll: readonly [number, number]): string | undefined {
  const s = result.sites?.find((x) => Math.abs(x.ll[0] - ll[0]) < 1e-9 && Math.abs(x.ll[1] - ll[1]) < 1e-9);
  return s ? `site #${s.rank}` : undefined;
}

function houseOf(slug: FixtureSlug): [number, number] {
  const h = loadFixture(slug).input.house;
  if (!h) throw new Error(`${slug} has no synthetic house`);
  return h.ll;
}
