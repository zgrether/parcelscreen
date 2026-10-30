/**
 * The climbing areas' bake (roadmap step 17, docs/plans/step-17-climbing.md §2.4), no network:
 *
 *   pnpm data:crags     lib/screen/data/crags.json → public/places/v1/curated/<cell>.json, and index.json's curated
 *                       cells and its "crags" source, everything else in the index as it was
 *
 * The monthly bake (pnpm data:places) writes the same cells from the same list.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import cragsJson from "@/lib/screen/data/crags.json";
import { SOURCE_DEFS } from "@/lib/places/bake";
import { cragCells, parseCrags } from "@/lib/places/crags";
import { PLACES_PATH, PlacesIndexSchema } from "@/lib/screen/placeData";

const OUT = join(process.cwd(), "public", PLACES_PATH);

describe.runIf(import.meta.env.MODE === "crags-bake")("bake the climbing areas", () => {
  it("writes the curated cells and the index's lines for them", () => {
    const crags = parseCrags(cragsJson);
    const cells = cragCells(crags);
    rmSync(join(OUT, "curated"), { recursive: true, force: true });
    mkdirSync(join(OUT, "curated"), { recursive: true });
    for (const c of cells) writeFileSync(join(OUT, "curated", `${c.cell}.json`), JSON.stringify(c) + "\n");

    const index = PlacesIndexSchema.parse(JSON.parse(readFileSync(join(OUT, "index.json"), "utf8")));
    const def = SOURCE_DEFS.find((d) => d.id === "crags")!;
    const entry = { ...def, folder: "curated" as const, fetched: def.fetched!, count: crags.length };
    // In SOURCE_DEFS' order, as the monthly bake writes them.
    const order = (id: string) => SOURCE_DEFS.findIndex((d) => d.id === id);
    index.sources = [...index.sources.filter((s) => s.id !== "crags"), entry].sort(
      (a, b) => order(a.id) - order(b.id),
    );
    index.cells.curated = Object.fromEntries(cells.map((c) => [c.cell, c.places.length]));
    writeFileSync(join(OUT, "index.json"), JSON.stringify(index, null, 2) + "\n");
    console.log(`${crags.length} climbing areas in ${cells.length} cells`);
    expect(cells.length).toBeGreaterThan(0);
  });
});
