// pnpm study:drift <fixture> <line>: the drift test (test/tools/drift-study.test.ts, owner 2026-10-15), then its report.
//   <fixture>  one of test/fixtures (default grayson-mud-creek-6273)
//   <line>     a road in test/tools/driveway-validation.roads.json (default c, the red-gate drive), or a GeoJSON file
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const [fixture = "grayson-mud-creek-6273", line = "c"] = process.argv.slice(2);
const run = spawnSync(
  process.execPath,
  ["node_modules/vitest/vitest.mjs", "run", "test/tools/drift-study.test.ts", "--mode", "study-drift"],
  { stdio: "inherit", env: { ...process.env, FIXTURE: fixture, LINE: line } },
);
if (run.status) process.exit(run.status);
process.stdout.write(readFileSync(`tmp/study-drift/${fixture}-${line.replace(/[^\w.-]+/g, "_")}.md`, "utf8"));
