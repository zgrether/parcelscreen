import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const ALL = ["lib/**/*.test.ts", "components/**/*.test.ts", "components/**/*.test.tsx", "test/**/*.test.ts"];

/**
 * The test files that run full screens over the recorded fixtures: CI runs them as four `screens` jobs beside the
 * fast `unit` job (owner, 2026-10-11), grouped so each takes about the same time (seconds measured with the whole
 * suite running on one machine). A file not listed here runs in the fast job. `pnpm test` runs everything.
 */
const SCREEN_GROUPS: Record<string, string[]> = {
  "screens-1": [
    "lib/screen/worker-sessions.test.ts", // 256 s
    "lib/screen/a3-scoring.test.ts", // 51
    "lib/screen/near-drive.test.ts", // 35
  ],
  "screens-2": [
    "lib/screen/screen.test.ts", // 226
    "lib/report/scored-route.test.ts", // 78
    "lib/screen/config-effect.test.ts", // 39
  ],
  "screens-3": [
    "lib/screen/worker-protocol.test.ts", // 155
    "test/tools/expected.test.ts", // 138
    "lib/screen/driveway-limit.test.ts", // 64
    "lib/report/easement.test.ts", // 26
  ],
  "screens-4": [
    "lib/screen/a4-driveway.test.ts", // 82
    "lib/screen/a4b-veto.test.ts", // 81
    "lib/screen/driveway-quantities.test.ts", // 73
    "lib/render/surface.test.ts", // 59
    "lib/render/pins.test.ts", // 59
  ],
};

/** UNIT_GROUP: "fast", one of SCREEN_GROUPS, or unset for every test. */
const group = process.env.UNIT_GROUP;
const include = !group || group === "fast" ? ALL : SCREEN_GROUPS[group];
if (!include)
  throw new Error(`UNIT_GROUP=${group}: expected "fast" or ${Object.keys(SCREEN_GROUPS).join(", ")}`);

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    // Tests run in Node on purpose: it proves lib/screen has no DOM dependency, and that the report blocks
    // (components/Results/blocks, rendered with react-dom/server) render on a server too (step 14 plan §8).
    environment: "node",
    include,
    exclude: [...configDefaults.exclude, ...(group === "fast" ? Object.values(SCREEN_GROUPS).flat() : [])],
    setupFiles: ["test/setup.ts"],
    // A guard against a hang, not a speed limit: a full screen takes 10–35 s alone, and over 30 s with the whole
    // suite running on one machine (Ferney's house run timed out at 30 s after B2b).
    testTimeout: 120_000,
  },
});
