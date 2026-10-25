/**
 * The places bake, live (roadmap step 14d, docs/plans/step-14d-places.md §7):
 *
 *   pnpm data:places        every cell, written to public/places/v1/{osm,official}/<cell>.json, then index.json
 *
 * Real time, so the per-host throttle really waits: about 90 Overpass queries at one a second plus their answers, the
 * parking batches, and each official layer paged. Never in CI's test job; the places workflow and the monthly refresh
 * run it. A source that doesn't answer keeps the previous bake's places (lib/places/bake.ts).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createHttpClient } from "@/lib/http";
import { bakePlaces } from "@/lib/places/bake";
import {
  PLACE_FOLDERS,
  PLACES_PATH,
  PlaceCellSchema,
  PlacesIndexSchema,
  type Place,
} from "@/lib/screen/placeData";

const live = () =>
  (globalThis as unknown as Record<symbol, typeof fetch>)[Symbol.for("parcelscreen.liveFetch")]!;
const OUT = join(process.cwd(), "public", PLACES_PATH);
const today = () => new Date().toLocaleDateString("en-CA");

/** The bake on disk, if there is one: the fallback for a source that doesn't answer. */
function previous() {
  const indexPath = join(OUT, "index.json");
  if (!existsSync(indexPath)) return undefined;
  const index = PlacesIndexSchema.parse(JSON.parse(readFileSync(indexPath, "utf8")));
  const places: Place[] = [];
  for (const folder of PLACE_FOLDERS) {
    const dir = join(OUT, folder);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")))
      places.push(...PlaceCellSchema.parse(JSON.parse(readFileSync(join(dir, f), "utf8"))).places);
  }
  return { index, places };
}

describe.runIf(import.meta.env.MODE === "places-bake")("bake the places, live", () => {
  it(
    "writes every cell and the index",
    async () => {
      const http = createHttpClient({
        env: "node",
        fetchImpl: live(),
        userAgent: "parcelscreen-data/1 (places bake; https://github.com/zgrether/parcelscreen)",
      });
      const prev = previous();
      const { index, cells } = await bakePlaces({
        http,
        today: today(),
        ...(prev ? { previous: prev } : {}),
        log: (l) => console.log(l),
      });
      expect(cells.length).toBeGreaterThan(0);
      // The folders are rewritten whole: a cell that's now empty goes.
      for (const folder of PLACE_FOLDERS) {
        rmSync(join(OUT, folder), { recursive: true, force: true });
        mkdirSync(join(OUT, folder), { recursive: true });
      }
      for (const c of cells) writeFileSync(join(OUT, c.folder, `${c.cell}.json`), JSON.stringify(c) + "\n");
      writeFileSync(join(OUT, "index.json"), JSON.stringify(index, null, 2) + "\n");
      const bytes = cells.reduce((t, c) => t + JSON.stringify(c).length, 0);
      console.log(
        [
          `baked ${index.baked}: ${cells.length} cell files, ${Math.round(bytes / 1024)} KB`,
          ...index.sources.map((s) => `  ${s.id}: ${s.count} (fetched ${s.fetched})`),
        ].join("\n"),
      );
    },
    6 * 3_600_000,
  );
});
