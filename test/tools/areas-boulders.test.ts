/**
 * Fills each committed area file's boulder share (docs/plans/boulders.md §2) from its own sampled points, live from
 * SDA, and changes nothing else in the file: the share alone, without profiling every area again. What it found goes
 * to test-results/areas-boulders.md (the job summary).
 *
 *   pnpm areas:boulders
 *
 * Run on CI's runners (boulders.yml), which reach SDA; never in the test suite.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createHttpClient, realClock } from "@/lib/http";
import { boulderShare } from "@/lib/areas/boulders";
import { AREAS } from "@/lib/areas/catalog";
import { AREA_FILE_VERSION, AreaFileSchema } from "@/lib/areas/types";
import { DEFAULT_ENDPOINTS } from "@/lib/screen/config";

const live = () =>
  (globalThis as unknown as Record<symbol, typeof fetch>)[Symbol.for("parcelscreen.liveFetch")]!;

describe.runIf(import.meta.env.MODE === "areas-boulders")("fill the area files' boulder share", () => {
  it("each area, from its own points", async () => {
    const http = createHttpClient({ env: "node", fetchImpl: live(), clock: realClock });
    const dir = join(process.cwd(), "public", "areas", `v${AREA_FILE_VERSION}`);
    const rows: string[] = ["| Area | Points | Bouldery soils | Seconds |", "|---|---|---|---|"];
    let filled = 0;
    for (const def of AREAS) {
      const path = join(dir, `${def.id}.json`);
      // An area the last profile missed has no file to fill (boulders.yml profiles it first).
      if (!existsSync(path)) {
        rows.push(`| ${def.name} | – | no file | – |`);
        continue;
      }
      const file = AreaFileSchema.parse(JSON.parse(readFileSync(path, "utf8")));
      const t0 = performance.now();
      const share = await boulderShare(file.points.ll, { http, endpoints: DEFAULT_ENDPOINTS });
      const s = ((performance.now() - t0) / 1000).toFixed(0);
      if (share !== null) filled++;
      writeFileSync(path, JSON.stringify(AreaFileSchema.parse({ ...file, boulderShare: share })) + "\n");
      rows.push(
        `| ${def.name} | ${file.points.ll.length} | ${share === null ? "no answer" : `${Math.round(share * 100)}%`} | ${s} |`,
      );
      console.log(`${def.id}: ${share} (${s} s)`);
    }
    mkdirSync("test-results", { recursive: true });
    writeFileSync(
      "test-results/areas-boulders.md",
      [
        `# The area catalog's boulder share`,
        "",
        `${filled} of ${AREAS.length} areas answered.`,
        "",
        ...rows,
        "",
      ].join("\n"),
    );
    expect(filled).toBeGreaterThan(0);
  }, 3_600_000);
});
