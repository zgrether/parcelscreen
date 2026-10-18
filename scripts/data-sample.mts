/**
 * Regenerates lib/rubric/sample/mud-creek.json: the rubric editor's fallback parcel (step 3 plan §4), Mud Creek's
 * `run` result from its expected.json (test/fixtures/grayson-mud-creek-6273), as the port computes it. A ScreenResult
 * holds no owner fields. Loaded by the editor only when no saved parcel has a current screen.
 *
 *   pnpm data:sample
 *
 * Run by hand after an expected.json change for Mud Creek (the result's schema and engine follow it).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const expected = JSON.parse(
  readFileSync(join(ROOT, "test", "fixtures", "grayson-mud-creek-6273", "expected.json"), "utf8"),
) as { run: unknown };
const out = join(ROOT, "lib", "rubric", "sample", "mud-creek.json");
writeFileSync(out, JSON.stringify(expected.run) + "\n");
console.log(`wrote ${out}`);
