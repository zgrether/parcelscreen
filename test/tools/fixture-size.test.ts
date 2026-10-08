/**
 * The fixtures' size on disk stays under the plain-git limit (owner, #80 review, 2026-10-08; phase-0.md §9.19,
 * replacing §9.9's 20 MB): 100 MB, counted as 100 × 2^20 bytes. Revisit Git LFS only if a re-record would cross
 * it. CI runs this file as its own step (`pnpm check:fixtures`); it also runs with the rest of `pnpm test`.
 */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

export const FIXTURE_LIMIT_BYTES = 100 * 2 ** 20;

/** Every file under a directory, with its size. */
function files(dir: string): { path: string; bytes: number }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    return d.isDirectory() ? files(p) : [{ path: p, bytes: statSync(p).size }];
  });
}

describe("the fixtures' size on disk", () => {
  it("is under 100 MB", () => {
    const all = files(join(process.cwd(), "test", "fixtures"));
    const total = all.reduce((n, f) => n + f.bytes, 0);
    const largest = [...all]
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 5)
      .map((f) => `${(f.bytes / 2 ** 20).toFixed(1)} MB ${f.path}`);
    expect(
      total,
      `test/fixtures is ${(total / 2 ** 20).toFixed(1)} MB, over the 100 MB plain-git limit (phase-0.md §9.19). Largest:\n${largest.join("\n")}`,
    ).toBeLessThanOrEqual(FIXTURE_LIMIT_BYTES);
  });
});
