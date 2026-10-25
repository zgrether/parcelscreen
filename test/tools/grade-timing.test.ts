/**
 * A live grade, timed (roadmap step 14d plan §6): each fixture graded three times against the real services, each
 * step's median milliseconds and the total. Run on main before the places switch and on the step's branch after it,
 * by the places workflow; the job summary holds both tables. On the branch the baked places are read from disk, as
 * the app reads them from its own origin (a static file); on main the same file runs with what main has (Photon,
 * Overpass, the official services), so it passes nothing main doesn't take.
 *
 *   pnpm grade:timing      writes test-results/grade-timing.md, and prints it
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "vitest";
import { createHttpClient } from "@/lib/http";
import { screen } from "@/lib/screen";
import { DEFAULT_USER_CONFIG } from "@/lib/screen/config";
import type { ProgressEvent } from "@/lib/screen/types";
import { FIXTURE_SLUGS, loadFixture } from "../support/fixtures";

const live = () =>
  (globalThis as unknown as Record<symbol, typeof fetch>)[Symbol.for("parcelscreen.liveFetch")]!;
const RUNS = 3;
const BAKE = join(process.cwd(), "public", "places", "v1");

/** The bake on disk as a places source, when this checkout has one (the branch); undefined on main. */
function diskPlaces() {
  if (!existsSync(join(BAKE, "index.json"))) return undefined;
  return async (folder: string, cells: readonly string[]) =>
    cells.flatMap((cell) => {
      const f = join(BAKE, folder, `${cell}.json`);
      return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as { places: unknown[] }).places : [];
    });
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : NaN;
};

describe.runIf(import.meta.env.MODE === "grade-timing")("a live grade, timed", () => {
  it("grades each fixture three times and reports each step's median", async () => {
    const places = diskPlaces();
    const label = process.env.TIMING_LABEL ?? (places ? "baked places" : "live places");
    const lines: string[] = [
      `# A live grade, timed (${label})`,
      "",
      `${new Date().toISOString()}; ${RUNS} runs each.`,
      "",
    ];
    for (const slug of FIXTURE_SLUGS) {
      const fx = loadFixture(slug);
      const byStep = new Map<string, number[]>();
      const totals: number[] = [];
      const failed = new Set<string>();
      for (let run = 0; run < RUNS; run++) {
        const started = new Map<string, number>();
        const t0 = performance.now();
        const onProgress = (e: ProgressEvent) => {
          if (e.status === "run") started.set(e.step, performance.now());
          else if (started.has(e.step)) {
            byStep.set(e.step, [...(byStep.get(e.step) ?? []), performance.now() - started.get(e.step)!]);
            if (e.status === "fail") failed.add(e.step);
          }
        };
        await screen({ polygon: fx.input.polygon.geometry, config: DEFAULT_USER_CONFIG }, onProgress, {
          http: createHttpClient({
            env: "node",
            fetchImpl: live(),
            userAgent: "ParcelScreen/1.0 (grade timing)",
          }),
          ...(places ? { places } : {}),
        } as Parameters<typeof screen>[2]);
        totals.push(performance.now() - t0);
      }
      lines.push(`## ${slug}`, "", "| Step | Median | Failed in a run |", "|---|---|---|");
      for (const [step, ms] of byStep)
        lines.push(`| ${step} | ${(median(ms) / 1000).toFixed(1)} s | ${failed.has(step) ? "yes" : ""} |`);
      lines.push(`| **Total** | **${(median(totals) / 1000).toFixed(1)} s** | |`, "");
    }
    mkdirSync("test-results", { recursive: true });
    writeFileSync("test-results/grade-timing.md", lines.join("\n"));
    console.log(lines.join("\n"));
  }, 3_600_000);
});
