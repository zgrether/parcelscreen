/**
 * The refresh's summary (step 13, docs/plans/step-13-area-catalog.md §3.6): compares last month's area files with
 * this month's, writes the PR body to <out>, and prints `changed=true` or `changed=false` for the workflow.
 *
 *   node scripts/areas-summary.mts <before dir> <after dir> <out.md> [<ERs to confirm.json>] [<overrides to remove.json>]
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { refreshSummary, type ClosedDropped, type ErToConfirm } from "../lib/areas/summary.ts";
import type { AreaFile } from "../lib/areas/types.ts";

const [before, after, out, confirm, dropped] = process.argv.slice(2);
if (!before || !after || !out)
  throw new Error("usage: node scripts/areas-summary.mts <before> <after> <out.md>");

/** Every area file in a folder (not the index), in name order. */
function files(dir: string): AreaFile[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && f !== "index.json")
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as AreaFile);
}

/** The profile run's list of ERs to confirm (test/tools/area-profile.test.ts), when there is one. */
const toConfirm: ErToConfirm[] =
  confirm && existsSync(confirm) ? JSON.parse(readFileSync(confirm, "utf8")) : [];
/** And its closed overrides CMS has since dropped (owner, #300), when there are any. */
const canRemove: ClosedDropped[] =
  dropped && existsSync(dropped) ? JSON.parse(readFileSync(dropped, "utf8")) : [];
const s = refreshSummary(
  files(before),
  files(after),
  new Date().toISOString().slice(0, 10),
  toConfirm,
  canRemove,
);
writeFileSync(out, s.markdown);
console.log(`changed=${s.changed}`);
