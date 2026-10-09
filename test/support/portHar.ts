/**
 * The one file `pnpm record:port` may write: test/fixtures/<slug>/network-port.har (owner, 2026-10-08). The
 * prototype's network.har and golden.json, the fixture's input.json and the port's expected.json are never
 * written by the recorder: every write goes through writePortHar, which refuses any other path.
 */
import { writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import type { FixtureSlug } from "./fixtures";
import type { Har } from "./replayFetch";
import { scrubHar } from "./scrubHar";

const FIXTURES = resolve(process.cwd(), "test", "fixtures");
export const PORT_HAR = "network-port.har";

/** Where a fixture's port recording lives. */
export const portHarPath = (slug: FixtureSlug): string => join(FIXTURES, slug, PORT_HAR);

/** Throws unless `path` is a fixture's network-port.har: directly in test/fixtures/<one directory>/. */
export function assertPortHar(path: string): void {
  const p = resolve(path);
  if (basename(p) !== PORT_HAR || dirname(dirname(p)) !== FIXTURES)
    throw new Error(`record:port may write only test/fixtures/<slug>/${PORT_HAR}, not ${path}`);
}

/** Writes a port recording, after checking the path; cookies, auth headers and owner fields scrubbed (scrubHar.ts). */
export function writePortHar(path: string, har: Har): void {
  assertPortHar(path);
  har = scrubHar(har).har;
  writeFileSync(
    path,
    JSON.stringify({
      log: { version: "1.2", creator: { name: "pnpm record:port", version: "1" }, entries: har.log.entries },
    }),
  );
}
