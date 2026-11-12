/**
 * The trail-lot rule applied to the shipped places (Zach, #425), without a full bake:
 *
 *   pnpm data:qualify    every OSM trailhead in public/places/v1/osm judged (lib/places/qualify.ts): a lot on no
 *                        hiking route of trailLotRouteMi and near no public land of trailLotPublicAc is dropped; the
 *                        cells and the index's counts rewritten; the report to test-results/places-qualify.md
 *
 * OSM's tagged trailheads and the cited overrides are kept whatever the evidence; a lot whose evidence won't load is
 * kept. Live, so never in CI's test job: the places workflow's `qualify` job runs it.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createHttpClient } from "@/lib/http";
import { dropReport, overpassRetried } from "@/lib/places/bake";
import { qualifyTrailLots } from "@/lib/places/qualify";
import { trailheadOverrides } from "@/lib/places/trailheadOverrides";
import { SCREEN_CONSTANTS } from "@/lib/screen/config";
import { PLACES_PATH, PlaceCellSchema, PlacesIndexSchema, type Place } from "@/lib/screen/placeData";

const live = () =>
  (globalThis as unknown as Record<symbol, typeof fetch>)[Symbol.for("parcelscreen.liveFetch")]!;
const OUT = join(process.cwd(), "public", PLACES_PATH);
const K = SCREEN_CONSTANTS.near;

describe.runIf(import.meta.env.MODE === "places-qualify")("the trail-lot rule on the shipped places", () => {
  it(
    "drops the lots that aren't trailheads",
    async () => {
      const http = createHttpClient({
        env: "node",
        fetchImpl: live(),
        userAgent: "parcelscreen-data/1 (places qualify; https://github.com/zgrether/parcelscreen)",
      });
      const log = (l: string) => console.log(l);
      const indexPath = join(OUT, "index.json");
      const index = PlacesIndexSchema.parse(JSON.parse(readFileSync(indexPath, "utf8")));
      const dir = join(OUT, "osm");
      const cells = readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => ({ f, cell: PlaceCellSchema.parse(JSON.parse(readFileSync(join(dir, f), "utf8"))) }));
      const overrides = new Set(trailheadOverrides().map((o) => o.id));
      const trailheads = cells.flatMap(({ cell }) =>
        cell.places.filter((p) => p.kind === "trailhead" && p.src === "osm" && !overrides.has(p.id)),
      );
      log(`${trailheads.length} OSM trailheads to judge (${overrides.size} overrides kept)`);
      const verdicts = await qualifyTrailLots(trailheads, {
        http,
        ask: (ql, what) => overpassRetried(ql, { http, log }, what),
        log,
      });
      const drop = new Set(verdicts.filter((v) => !v.keep).map((v) => v.lot.id));
      for (const { f, cell } of cells) {
        const places = cell.places.filter((p: Place) => !drop.has(p.id));
        if (places.length === cell.places.length) continue;
        writeFileSync(join(dir, f), JSON.stringify({ ...cell, places }) + "\n");
        if (places.length) index.cells.osm[cell.cell] = places.length;
        else delete index.cells.osm[cell.cell];
      }
      const osm = index.sources.find((s) => s.id === "osm")!;
      osm.count -= drop.size;
      writeFileSync(indexPath, JSON.stringify(index, null, 2) + "\n");

      const by = (why: RegExp) => verdicts.filter((v) => why.test(v.why)).length;
      const lots = verdicts.filter((v) => !/^tagged/.test(v.why));
      const keptLots = lots.filter((v) => v.keep);
      const find = (id: string) => verdicts.find((v) => v.lot.id === id);
      const line = (name: string, id: string) => {
        const v = find(id);
        return `- ${name}: ${v ? `${v.keep ? "kept" : "dropped"} (${v.why})` : "not among the shipped trailheads"}`;
      };
      mkdirSync(join(process.cwd(), "test-results"), { recursive: true });
      writeFileSync(
        join(process.cwd(), "test-results", "places-qualify.md"),
        [
          "# The trail-lot rule on the shipped places (Zach, #425)",
          "",
          `A lot counts on a hiking route of ${K.trailLotRouteMi} mi or more, or within ${K.trailLotPublicM} m of public land of ${K.trailLotPublicAc} ac or more.`,
          "",
          `- OSM trailheads: ${verdicts.length}; tagged as trailheads (not judged): ${by(/^tagged/)}`,
          `- Trail lots judged: ${lots.length}; kept ${keptLots.length} (on a route ${by(/^on /)}, by public land ${by(/ac, within/)}, unchecked ${by(/unchecked/)}); dropped ${drop.size}`,
          `- Trail lots shipped now: ${keptLots.length}, plus ${overrides.size} override (bake 2's bar: 1,140 found, 594 kept)`,
          line("Brumley Mountain Trail (parking), Hayters Gap", "osm:way/808088841"),
          line("Skymart (parking), Morristown", "osm:way/896001424"),
          "",
          ...dropReport(
            verdicts
              .filter((v) => !v.keep)
              .map((v) => ({ name: v.lot.name ?? "Trailhead", ll: v.lot.ll, why: v.why })),
          ),
        ].join("\n"),
      );
      expect(verdicts.length).toBeGreaterThan(0);
    },
    3 * 3_600_000,
  );
});
