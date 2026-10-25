/**
 * Freezes each fixture's copy of the baked places (roadmap step 14d plan §1): the cells within FREEZE_KM of its parcel,
 * both folders, copied from public/places/v1 to test/fixtures/<slug>/places/; and the recorded area profile's (its
 * outline's box plus the trailhead search's reach), to test/fixtures/areas/<id>/places/. The fixtures' replays answer the places
 * from these (test/support/fixtures.ts), so a monthly re-bake moves no fixture number; re-freezing is a declared
 * numbers change, as re-recording is.
 *
 *   pnpm places:freeze
 *
 * Offline: it reads the bake on disk.
 */
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { centroid } from "@turf/turf";
import { describe, expect, it } from "vitest";
import { PLACE_FOLDERS, PLACES_PATH, cellsWithin } from "@/lib/screen/placeData";
import { SCREEN_CONSTANTS } from "@/lib/screen/config";
import { bbox } from "@turf/turf";
import { outlineOf } from "@/lib/areas/outlines";
import { FIXTURE_SLUGS, loadFixture } from "../support/fixtures";
import { AREA_PLACES, RECORDED } from "../support/areaProfile";

const BAKE = join(process.cwd(), "public", PLACES_PATH);
/** The near step's widest reach (groceries, 40 km), plus the parking cells' kilometre and a little for the centroid. */
const FREEZE_KM = SCREEN_CONSTANTS.near.groceryKm + 2;

/** Copies the given cells of both folders, and the index, from the bake to `out`; returns how many cell files. */
function freeze(out: string, cells: readonly string[]): number {
  rmSync(out, { recursive: true, force: true });
  let copied = 0;
  for (const folder of PLACE_FOLDERS) {
    mkdirSync(join(out, folder), { recursive: true });
    for (const cell of cells) {
      const from = join(BAKE, folder, `${cell}.json`);
      if (!existsSync(from)) continue;
      copyFileSync(from, join(out, folder, `${cell}.json`));
      copied++;
    }
  }
  copyFileSync(join(BAKE, "index.json"), join(out, "index.json"));
  return copied;
}

describe.runIf(import.meta.env.MODE === "places-freeze")("freeze the fixtures' places", () => {
  it.each(FIXTURE_SLUGS)("%s", (slug) => {
    expect(existsSync(join(BAKE, "index.json"))).toBe(true);
    const [lon, lat] = centroid(loadFixture(slug).input.polygon).geometry.coordinates as [number, number];
    const copied = freeze(
      join(process.cwd(), "test", "fixtures", slug, "places"),
      cellsWithin([lat, lon], FREEZE_KM),
    );
    console.log(`${slug}: ${copied} cell files`);
    expect(copied).toBeGreaterThan(0);
  });

  it(`the recorded area, ${RECORDED.id}`, async () => {
    const [w, s, e, n] = bbox(await outlineOf(RECORDED.id));
    // Every cell of the box widened by the trailhead search's reach: the cells its grid centres' searches touch.
    const reach = SCREEN_CONSTANTS.near.trailheadKm + 2;
    const sw = cellsWithin([s, w], reach)[0]!.split("_").map(Number) as [number, number];
    const ne = cellsWithin([n, e], reach).at(-1)!.split("_").map(Number) as [number, number];
    const cells: string[] = [];
    for (let a = sw[0]; a <= ne[0]; a++) for (let o = sw[1]; o <= ne[1]; o++) cells.push(`${a}_${o}`);
    const copied = freeze(AREA_PLACES, cells);
    console.log(`${RECORDED.id}: ${copied} cell files`);
    expect(copied).toBeGreaterThan(0);
  });
});
