/**
 * The exact pins (test/tools/pins.ts): the rule on synthetic lockfiles, then the real pnpm-lock.yaml. CI runs this
 * file as its own step (`pnpm check:pins`); it also runs with the rest of `pnpm test`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lockedOverrides, pinProblems, resolvedVersions, snapshotDependencies, turfNames } from "./pins";

const OVERRIDES = [
  "  '@turf/along': 7.4.0",
  "  '@turf/buffer': 7.4.0",
  "  '@turf/jsts': 2.7.2",
  "  geotiff: 2.1.3",
  "  geotiff>pako: 2.2.0",
  "  geotiff>lerc: 3.0.0",
  "  geotiff>zstddec: 0.1.0",
  "  geotiff>@petamoriken/float16: 3.9.3",
];
const PACKAGES = [
  "'@turf/along@7.4.0'",
  "'@turf/buffer@7.4.0'",
  "'@turf/jsts@2.7.2'",
  "geotiff@2.1.3",
  "pako@2.2.0",
];
const GEOTIFF_DEPS = [
  "      '@petamoriken/float16': 3.9.3",
  "      lerc: 3.0.0",
  "      pako: 2.2.0",
  "      zstddec: 0.1.0",
];
const lock = ({ overrides = OVERRIDES, packages = PACKAGES, geotiffDeps = GEOTIFF_DEPS } = {}) =>
  [
    "lockfileVersion: '9.0'",
    "",
    "overrides:",
    ...overrides,
    "",
    "packages:",
    "",
    ...packages.flatMap((p) => [`  ${p}:`, "    resolution: {}", ""]),
    "snapshots:",
    "",
    "  geotiff@2.1.3:",
    "    dependencies:",
    ...geotiffDeps,
    "",
  ].join("\n");

describe("the pin rule", () => {
  it("reads the lockfile's packages, overrides and geotiff's own dependencies", () => {
    const l = lock();
    expect(turfNames(l)).toEqual(["@turf/along", "@turf/buffer", "@turf/jsts"]);
    expect(resolvedVersions(l, "geotiff")).toEqual(["2.1.3"]);
    expect(lockedOverrides(l)).toMatchObject({
      "@turf/jsts": "2.7.2",
      "geotiff>@petamoriken/float16": "3.9.3",
    });
    expect(snapshotDependencies(l, "geotiff@2.1.3")).toEqual({
      "@petamoriken/float16": "3.9.3",
      lerc: "3.0.0",
      pako: "2.2.0",
      zstddec: "0.1.0",
    });
  });

  it("passes when everything is pinned", () => {
    expect(pinProblems(lock())).toEqual([]);
  });

  it("fails on a Turf part at another version: the 7.1.0-plus-floating-parts case that started this", () => {
    const l = lock({
      packages: PACKAGES.map((p) => p.replace("'@turf/along@7.4.0'", "'@turf/along@7.1.0'")),
    });
    expect(pinProblems(l)).toContain("@turf/along resolves to 7.1.0, not 7.4.0");
  });

  it("fails on two versions of one part, and on a part with no override yet", () => {
    expect(pinProblems(lock({ packages: [...PACKAGES, "'@turf/along@7.3.1'"] }))).toEqual([
      "@turf/along resolves to 7.3.1, not 7.4.0",
    ]);
    expect(pinProblems(lock({ packages: [...PACKAGES, "'@turf/voronoi@7.4.0'"] }))[0]).toMatch(
      /^@turf\/voronoi has no exact override \(none\)/,
    );
  });

  it("fails when one of geotiff's decoders moves, or loses its override", () => {
    const moved = lock({ geotiffDeps: GEOTIFF_DEPS.map((d) => d.replace("pako: 2.2.0", "pako: 2.2.1")) });
    expect(pinProblems(moved)).toEqual(["geotiff's pako resolves to 2.2.1, not 2.2.0"]);
    const unpinned = lock({ overrides: OVERRIDES.filter((o) => !o.includes("geotiff>lerc")) });
    expect(pinProblems(unpinned)[0]).toMatch(/^geotiff>lerc has no exact override \(none\)/);
  });

  it("fails when geotiff itself moves", () => {
    const l = lock({ packages: PACKAGES.map((p) => p.replace("geotiff@2.1.3", "geotiff@2.1.4")) });
    expect(pinProblems(l)).toContain("geotiff resolves to 2.1.4, not 2.1.3");
  });
});

describe("pnpm-lock.yaml", () => {
  it("pins every @turf package to 7.4.0 (@turf/jsts 2.7.2), and geotiff 2.1.3 with its decoders", () => {
    expect(pinProblems(readFileSync("pnpm-lock.yaml", "utf8"))).toEqual([]);
  });
});
