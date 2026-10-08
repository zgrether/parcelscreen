/**
 * Loads the recorded reference-parcel fixtures (test/fixtures/<slug>/). See test/fixtures/README.md.
 *
 * Goldens are the prototype's own result objects, serialized as-is (minus the `_ctx` rasters), so their
 * type here is deliberately loose. The field-by-field mapping onto ScreenResult (plan §5 "fromPrototype")
 * lands in step 4 together with the ScreenResult schema it maps onto.
 */
import type { Feature, Polygon } from "geojson";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createReplayFetch, loadHar, type Har, type ReplayFetch } from "./replayFetch";

export const FIXTURE_SLUGS = [
  "ferney-creek-52-47A",
  "macks-mountain-35-3",
  "grayson-mud-creek-6273",
] as const;
export type FixtureSlug = (typeof FIXTURE_SLUGS)[number];

// From the repo root, where Vitest and Playwright both run: Playwright loads this file as CommonJS (the
// package isn't "type": "module"), where import.meta doesn't parse.
const FIXTURES_DIR = resolve(process.cwd(), "test", "fixtures");

export interface FixtureInput {
  name: string;
  point: { lat: number; lon: number };
  polygon: Feature<Polygon>;
  props: Record<string, unknown>;
  source: string;
  /** Ferney Creek only: the synthetic house used for the setHouse / houseRun goldens. */
  house?: { ll: [number, number]; distanceM: number; bearingDeg: number; site2: [number, number] };
  /** Macks Mountain only: where the evaluateSite2 golden was taken. */
  evaluateSite2?: { ll: [number, number]; label: string };
  prototypeBuild: string;
  recorded: { startedAt: string; runAt: string; finishedAt: string };
  /** The prototype's step list as rendered after each screen run. */
  steps: Record<string, string[]>;
}

/** A prototype result object (`R` in legacy/parcelscreen.html). NaN/Infinity were serialized as null. */
export type PrototypeResult = Record<string, unknown> & {
  verdict: "fatal" | "marginal" | "ok";
  acres: number;
  failed: string[];
  flags: { lvl: "fatal" | "warn" | "good"; t: string }[];
};

export interface FixtureGoldens {
  /** Plain run at the parcel, default config. */
  run: PrototypeResult;
  /** Macks Mountain: after setFocus at site #2 (→ evaluateAt). */
  evaluateSite2?: PrototypeResult;
  /** Ferney Creek: after setHouse on the existing result (→ setHouse). */
  setHouse?: PrototypeResult;
  /** Ferney Creek: a full re-run with the house marked. */
  houseRun?: PrototypeResult;
}

export interface Fixture {
  slug: FixtureSlug;
  input: FixtureInput;
  goldens: FixtureGoldens;
  har: Har;
  /** A fresh offline fetch over this fixture's HAR. */
  replayFetch(): ReplayFetch;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function loadFixture(slug: FixtureSlug): Fixture {
  const dir = join(FIXTURES_DIR, slug);
  const har = loadHar(join(dir, "network.har"));
  return {
    slug,
    input: readJson<FixtureInput>(join(dir, "input.json")),
    goldens: readJson<FixtureGoldens>(join(dir, "golden.json")),
    har,
    replayFetch: () => createReplayFetch(har),
  };
}
