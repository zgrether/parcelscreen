/**
 * The Turf pin (test/tools/turfPin.ts): its rule on synthetic lockfiles, and the real pnpm-lock.yaml. CI runs
 * this file as its own step (`pnpm check:turf`); it also runs with the rest of `pnpm test`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lockedOverrides, resolvedTurf, turfPinProblems } from "./turfPin";

const lock = (overrides: string, packages: string) =>
  `lockfileVersion: '9.0'\n\noverrides:\n${overrides}\nimporters:\n\n  .:\n    dependencies: {}\n\npackages:\n\n${packages}`;
const PINNED = lock(
  `  '@turf/along': 7.4.0\n  '@turf/buffer': 7.4.0\n  '@turf/jsts': 2.7.2\n`,
  `  '@turf/along@7.4.0':\n    resolution: {}\n\n  '@turf/buffer@7.4.0':\n    resolution: {}\n\n  '@turf/jsts@2.7.2':\n    resolution: {}\n`,
);

describe("the Turf pin rule", () => {
  it("passes when every part is at 7.4.0 with an exact override, and @turf/jsts at 2.7.2", () => {
    expect(resolvedTurf(PINNED).map((p) => `${p.name}@${p.version}`)).toEqual([
      "@turf/along@7.4.0",
      "@turf/buffer@7.4.0",
      "@turf/jsts@2.7.2",
    ]);
    expect(lockedOverrides(PINNED)).toEqual({
      "@turf/along": "7.4.0",
      "@turf/buffer": "7.4.0",
      "@turf/jsts": "2.7.2",
    });
    expect(turfPinProblems(PINNED)).toEqual([]);
  });

  it("fails on a part at another version: the 7.1.0-plus-floating-parts case that started this", () => {
    const floating = PINNED.replace("'@turf/along@7.4.0'", "'@turf/along@7.1.0'");
    expect(turfPinProblems(floating)).toContain("@turf/along resolves to 7.1.0, not 7.4.0");
  });

  it("fails on two versions of one part", () => {
    const two = PINNED + `\n  '@turf/along@7.3.1':\n    resolution: {}\n`;
    expect(turfPinProblems(two)).toEqual(["@turf/along resolves to 7.3.1, not 7.4.0"]);
  });

  it("fails on a part with no override yet", () => {
    const added = PINNED + `\n  '@turf/voronoi@7.4.0':\n    resolution: {}\n`;
    expect(turfPinProblems(added)[0]).toMatch(/^@turf\/voronoi has no exact override \(none\)/);
  });
});

describe("pnpm-lock.yaml", () => {
  it("resolves every @turf package to exactly 7.4.0 (@turf/jsts 2.7.2), each with an override", () => {
    expect(turfPinProblems(readFileSync("pnpm-lock.yaml", "utf8"))).toEqual([]);
  });
});
