/**
 * Loads the recorded reference-parcel fixtures (test/fixtures/<slug>/). See test/fixtures/README.md.
 *
 * Two lists (step 2, owner 2026-10-17): the prototype-backed fixtures (Ferney, Macks, Mud Creek) were recorded from
 * the prototype and carry its goldens (golden.json, network.har) for the parity tests and `pnpm diff:prototype`; every
 * fixture, those three and the port-only ones (Roan Mountain and every later one), has input.json, network-port.har
 * and expected.json. Port-only fixtures are recorded by `pnpm record:port` alone.
 *
 * Goldens are the prototype's own result objects, serialized as-is (minus the `_ctx` rasters), so their
 * type here is deliberately loose.
 */
import type { Feature, Polygon } from "geojson";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createReplayFetch, loadHar, type Har, type ReplayFetch } from "./replayFetch";

/** The fixtures recorded from the prototype: goldens, the prototype's HAR, `diff:prototype`. */
export const PROTOTYPE_FIXTURE_SLUGS = [
  "ferney-creek-52-47A",
  "macks-mountain-35-3",
  "grayson-mud-creek-6273",
] as const;
export type PrototypeSlug = (typeof PROTOTYPE_FIXTURE_SLUGS)[number];

/** Every fixture: the prototype-backed ones, then the port-only ones (step 2 on). */
export const FIXTURE_SLUGS = [...PROTOTYPE_FIXTURE_SLUGS, "roan-hwy-143-099-046-02"] as const;
export type FixtureSlug = (typeof FIXTURE_SLUGS)[number];

/** What e2e/tennessee.spec.ts types to find Roan by its parcel number; record:port records that search for it. */
export const ROAN_SEARCH = "099 046.02";

export const isPrototypeSlug = (slug: FixtureSlug): slug is PrototypeSlug =>
  (PROTOTYPE_FIXTURE_SLUGS as readonly string[]).includes(slug);

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
  /** Macks Mountain and Mud Creek (the prototype's site #2), Roan (the port's): where evaluateSite2 is taken. */
  evaluateSite2?: { ll: [number, number]; label: string };
  recorded: { startedAt: string; runAt: string; finishedAt: string };
}

/** A prototype-backed fixture's input: also the prototype's build and its rendered steps. */
export interface PrototypeInput extends FixtureInput {
  prototypeBuild: string;
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
  /**
   * What the replay answers from: the prototype's recording where there is one, then the requests only the port
   * makes (network-port.har, recorded by `pnpm record:port`; Batch A).
   */
  replayHar: Har;
  /** A fresh offline fetch over this fixture's recordings. */
  replayFetch(): ReplayFetch;
}

export interface PrototypeFixture extends Fixture {
  slug: PrototypeSlug;
  input: PrototypeInput;
  goldens: FixtureGoldens;
  /** The prototype's recording (network.har). */
  har: Har;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

const EMPTY: Har = { log: { entries: [] } };

export function loadFixture(slug: PrototypeSlug): PrototypeFixture;
export function loadFixture(slug: FixtureSlug): Fixture;
export function loadFixture(slug: FixtureSlug): Fixture | PrototypeFixture {
  const dir = join(FIXTURES_DIR, slug);
  const portPath = join(dir, "network-port.har");
  const port = existsSync(portPath) ? loadHar(portPath) : EMPTY;
  if (!isPrototypeSlug(slug)) {
    return {
      slug,
      input: readJson<FixtureInput>(join(dir, "input.json")),
      replayHar: port,
      replayFetch: () => createReplayFetch(port),
    };
  }
  const har = loadHar(join(dir, "network.har"));
  const replayHar: Har = { log: { entries: [...har.log.entries, ...port.log.entries] } };
  return {
    slug,
    input: readJson<PrototypeInput>(join(dir, "input.json")),
    goldens: readJson<FixtureGoldens>(join(dir, "golden.json")),
    har,
    replayHar,
    replayFetch: () => createReplayFetch(replayHar),
  };
}
