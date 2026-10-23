/**
 * The area profiler, live (step 13, docs/plans/step-13-area-catalog.md §3):
 *
 *   pnpm areas:profile          every area, written to public/areas/v1/<id>.json, then index.json
 *   AREAS=floyd,cosby pnpm areas:profile    just those (index.json keeps the others' entries)
 *   pnpm areas:record           Grayson Highlands, small, recorded to test/fixtures/areas/grayson-highlands/network.har
 *                               for the CI test (lib/areas/profile.recorded.test.ts)
 *
 * Real time, so the per-host throttle really waits: a full run is about 30–40 minutes, most of it OSRM's one request
 * a second. Never in CI's test job; the monthly refresh runs it (.github/workflows/areas-refresh.yml).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { bbox } from "@turf/turf";
import { describe, expect, it } from "vitest";
import { realClock } from "@/lib/http";
import { AREAS } from "@/lib/areas/catalog";
import { outlineOf } from "@/lib/areas/outlines";
import { profileArea } from "@/lib/areas/profile";
import {
  AREA_FILE_VERSION,
  AreaFileSchema,
  AreaIndexSchema,
  type AreaFile,
  type AreaIndex,
} from "@/lib/areas/types";
import { AREA_HAR, MUD_HAR, profileDeps, recordingFetch, RECORDED } from "../support/areaProfile";
import { loadHar, type HarEntry } from "../support/replayFetch";
import { scrubHar } from "../support/scrubHar";

const live = () =>
  (globalThis as unknown as Record<symbol, typeof fetch>)[Symbol.for("parcelscreen.liveFetch")]!;
const OUT = join(process.cwd(), "public", "areas", `v${AREA_FILE_VERSION}`);
const today = () => new Date().toLocaleDateString("en-CA");
const HOUR = 3_600_000;
const ATTEMPTS = 3;

describe.runIf(import.meta.env.MODE === "areas")("profile the areas, live", () => {
  it(
    "writes each area's file and the index",
    async () => {
      const only = (process.env.AREAS ?? "").split(",").filter(Boolean);
      const defs = only.length ? AREAS.filter((a) => only.includes(a.id)) : AREAS;
      expect(defs.length).toBeGreaterThan(0);
      mkdirSync(OUT, { recursive: true });
      const deps = await profileDeps(live(), realClock, today());
      const indexPath = join(OUT, "index.json");
      const index: AreaIndex = existsSync(indexPath)
        ? AreaIndexSchema.parse(JSON.parse(readFileSync(indexPath, "utf8")))
        : { version: AREA_FILE_VERSION, areas: [] };
      const enter = async (file: AreaFile) => {
        const entry = {
          id: file.id,
          name: file.name,
          profiledAt: file.profiledAt,
          bbox: bbox(await outlineOf(file.id)).map((x) => +x.toFixed(4)) as [number, number, number, number],
        };
        index.areas = [...index.areas.filter((a) => a.id !== file.id), entry];
        // The catalog's order, whatever order the areas were run in; written after every area, so a run that stops
        // part way still leaves an index of what's there.
        index.areas.sort(
          (a, b) => AREAS.findIndex((x) => x.id === a.id) - AREAS.findIndex((x) => x.id === b.id),
        );
        writeFileSync(indexPath, JSON.stringify(AreaIndexSchema.parse(index), null, 1) + "\n");
      };
      // Files already there that the index lacks (a run that stopped before writing it).
      for (const a of AREAS) {
        const path = join(OUT, `${a.id}.json`);
        if (existsSync(path) && !index.areas.some((x) => x.id === a.id))
          await enter(AreaFileSchema.parse(JSON.parse(readFileSync(path, "utf8"))));
      }
      const failed: string[] = [];
      for (const def of defs) {
        const started = Date.now();
        const outline = await outlineOf(def.id);
        // A dropped connection isn't retried by the HTTP client (only 429 and 503 are): the area is tried again
        // after a pause, and an area that still fails keeps last month's file (the summary says it wasn't refreshed).
        let done: Awaited<ReturnType<typeof profileArea>> | null = null;
        for (let attempt = 1; attempt <= ATTEMPTS && !done; attempt++) {
          try {
            done = await profileArea(def, outline, deps);
          } catch (e) {
            console.log(`${def.id}: attempt ${attempt} failed: ${String(e)}`);
            if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, 30_000 * attempt));
          }
        }
        if (!done) {
          failed.push(def.id);
          console.log(`::warning::${def.id} wasn't profiled; its file from the last run stands.`);
          continue;
        }
        const { file, sample } = done;
        AreaFileSchema.parse(file);
        writeFileSync(join(OUT, `${def.id}.json`), JSON.stringify(file) + "\n");
        await enter(file);
        console.log(
          `${def.id}: ${sample.points.length} points of ${sample.candidates} (${JSON.stringify(sample.rejected)}), ` +
            `${Math.round((Date.now() - started) / 1000)} s; medians ${JSON.stringify(file.medians)}`,
        );
      }
      // Every area failing is the run failing; one or two is a warning (the refresh PR lists them).
      expect(failed.length).toBeLessThan(defs.length);
    },
    3 * HOUR,
  );
});

describe.runIf(import.meta.env.MODE === "areas-record")("record Grayson Highlands for CI", () => {
  it(
    "records only what Mud Creek's recording lacks",
    async () => {
      const added: HarEntry[] = [];
      const fetchImpl = recordingFetch(loadHar(MUD_HAR), live(), added);
      const deps = await profileDeps(fetchImpl, realClock, RECORDED.today);
      const def = AREAS.find((a) => a.id === RECORDED.id)!;
      const { file } = await profileArea(def, await outlineOf(def.id), deps, RECORDED.scale);
      AreaFileSchema.parse(file);
      mkdirSync(dirname(AREA_HAR), { recursive: true });
      const har = scrubHar({ log: { entries: added } }).har;
      writeFileSync(
        AREA_HAR,
        JSON.stringify({
          log: {
            version: "1.2",
            creator: { name: "pnpm areas:record", version: "1" },
            entries: har.log.entries,
          },
        }),
      );
      console.log(`${AREA_HAR}: ${added.length} requests; medians ${JSON.stringify(file.medians)}`);
    },
    HOUR,
  );
});
