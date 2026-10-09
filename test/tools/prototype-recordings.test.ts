/**
 * The prototype's recordings are never rewritten (owner, 2026-10-08): each fixture's network.har, golden.json and
 * input.json against its pinned SHA-256 (test/fixtures/prototype-recordings.sha256.json), and `pnpm record:port`
 * able to write a fixture's network-port.har only. A new fixture adds its hashes in the PR that records it.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FIXTURE_SLUGS } from "../support/fixtures";
import { assertPortHar, portHarPath } from "../support/portHar";

const DIR = join(process.cwd(), "test", "fixtures");
const PINNED = JSON.parse(readFileSync(join(DIR, "prototype-recordings.sha256.json"), "utf8")) as Record<
  string,
  string
>;
const PROTOTYPE_FILES = ["network.har", "golden.json", "input.json"] as const;

describe("the prototype's recordings", () => {
  it.each(FIXTURE_SLUGS.flatMap((s) => PROTOTYPE_FILES.map((f) => `${s}/${f}`)))(
    "%s is byte for byte as recorded",
    (file) => {
      const sha = createHash("sha256")
        .update(readFileSync(join(DIR, file)))
        .digest("hex");
      expect(PINNED[file], `${file} has no pinned hash`).toBeDefined();
      expect(sha, `${file} changed: the prototype's recordings are never rewritten`).toBe(PINNED[file]);
    },
  );
});

describe("pnpm record:port writes only network-port.har", () => {
  it("each fixture's port recording is network-port.har in its own directory", () => {
    for (const slug of FIXTURE_SLUGS) {
      expect(portHarPath(slug)).toBe(join(DIR, slug, "network-port.har"));
      expect(() => assertPortHar(portHarPath(slug))).not.toThrow();
    }
  });

  it("refuses every other fixture file, and any path outside test/fixtures/<slug>/", () => {
    for (const slug of FIXTURE_SLUGS)
      for (const f of ["network.har", "golden.json", "input.json", "expected.json"])
        expect(() => assertPortHar(join(DIR, slug, f))).toThrow(/may write only/);
    expect(() => assertPortHar(join(DIR, "network-port.har"))).toThrow(); // not in a fixture's directory
    expect(() => assertPortHar(join(DIR, "ferney-creek-52-47A", "sub", "network-port.har"))).toThrow();
    expect(() => assertPortHar(join(process.cwd(), "network-port.har"))).toThrow();
  });

  it("the recorder has no other way to write, rename or delete a file", () => {
    const src = readFileSync(join(process.cwd(), "test", "tools", "record-port.test.ts"), "utf8");
    expect(src).toContain("writePortHar(path, har)");
    expect(src).not.toMatch(
      /\b(writeFile|writeFileSync|appendFile|appendFileSync|rename|renameSync|rm|rmSync|unlink|unlinkSync|copyFile|copyFileSync|createWriteStream)\s*\(/,
    );
  });
});
