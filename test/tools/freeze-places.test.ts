/**
 * Freezes each fixture's copy of the baked places (roadmap step 14d plan §1): each kind within its reach of the parcel
 * (REACH_KM), every folder, from public/places/v1 to test/fixtures/<slug>/places/; and the recorded area profile's (its
 * outline's box plus each kind's reach), to test/fixtures/areas/<id>/places/. The fixtures' replays answer the places
 * from these (test/support/fixtures.ts), so a monthly re-bake moves no fixture number; re-freezing is a declared
 * numbers change, as re-recording is.
 *
 *   pnpm places:freeze
 *   PLACES_FREEZE_KINDS=launch pnpm places:freeze   (a new kind only; the rest as frozen before)
 *
 * Offline: it reads the bake on disk.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bbox, centroid } from "@turf/turf";
import { describe, expect, it } from "vitest";
import {
  PLACE_FOLDERS,
  PLACES_PATH,
  PlaceCellSchema,
  cellsWithin,
  type Place,
  type PlaceCell,
} from "@/lib/screen/placeData";
import { SCREEN_CONSTANTS } from "@/lib/screen/config";
import { outlineOf } from "@/lib/areas/outlines";
import { FIXTURE_SLUGS, loadFixture } from "../support/fixtures";
import { AREA_PLACES, RECORDED } from "../support/areaProfile";

const BAKE = join(process.cwd(), "public", PLACES_PATH);
type Kind = Place["kind"];
/**
 * How far each kind is read from a parcel: the near step's widest reach (groceries, 40 km) plus the parking cells'
 * kilometre and a little for the centroid; launches, the flatwater drive's straight-line reach (paddling.maxKm).
 */
const REACH_KM: Record<Kind, number> = {
  grocer: SCREEN_CONSTANTS.near.groceryKm + 2,
  trailhead: SCREEN_CONSTANTS.near.groceryKm + 2,
  parking: SCREEN_CONSTANTS.near.groceryKm + 2,
  launch: SCREEN_CONSTANTS.paddling.maxKm + 2,
  // Step 17: the climbing areas' straight-line reach (the plan's climbing.maxKm, 150 km).
  crag: 150 + 2,
};
/**
 * PLACES_FREEZE_KINDS=launch: only those kinds are taken from the bake; the frozen copy keeps its own of every other
 * kind (and its index), so a new kind joins the fixtures without moving any number frozen before (step 14d PR 3).
 */
const ONLY = (process.env.PLACES_FREEZE_KINDS ?? "")
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean) as Kind[];

/** A cell as written (checked against the schema, but its own key order kept, so an unchanged cell is byte-identical). */
function readCell(file: string): PlaceCell | null {
  if (!existsSync(file)) return null;
  const raw = JSON.parse(readFileSync(file, "utf8")) as PlaceCell;
  PlaceCellSchema.parse(raw);
  return raw;
}

/** Writes `out`'s cells: each kind from the bake within its own cells (`cellsOf`); returns how many cell files. */
function freeze(out: string, cellsOf: (kind: Kind) => readonly string[]): number {
  const wanted = new Map<string, Set<Kind>>();
  for (const kind of Object.keys(REACH_KM) as Kind[])
    for (const cell of cellsOf(kind)) wanted.set(cell, (wanted.get(cell) ?? new Set()).add(kind));
  const kept = new Map<string, PlaceCell>();
  if (ONLY.length)
    for (const folder of PLACE_FOLDERS)
      for (const cell of wanted.keys()) {
        const c = readCell(join(out, folder, `${cell}.json`));
        if (c) kept.set(`${folder}/${cell}`, c);
      }
  const index = ONLY.length ? readFileSync(join(out, "index.json")) : readFileSync(join(BAKE, "index.json"));
  rmSync(out, { recursive: true, force: true });
  let written = 0;
  for (const folder of PLACE_FOLDERS) {
    mkdirSync(join(out, folder), { recursive: true });
    for (const [cell, kinds] of wanted) {
      const baked = readCell(join(BAKE, folder, `${cell}.json`));
      const old = kept.get(`${folder}/${cell}`);
      const fresh = (p: Place) => kinds.has(p.kind) && (!ONLY.length || ONLY.includes(p.kind));
      const places = [
        ...(baked?.places.filter(fresh) ?? []),
        ...(old?.places.filter((p) => !ONLY.includes(p.kind)) ?? []),
      ].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      if (!places.length) continue;
      const base = baked ?? old!;
      writeFileSync(
        join(out, folder, `${cell}.json`),
        JSON.stringify({ version: base.version, folder, cell, baked: base.baked, places }) + "\n",
      );
      written++;
    }
  }
  writeFileSync(join(out, "index.json"), index);
  return written;
}

describe.runIf(import.meta.env.MODE === "places-freeze")("freeze the fixtures' places", () => {
  it.each(FIXTURE_SLUGS)("%s", (slug) => {
    expect(existsSync(join(BAKE, "index.json"))).toBe(true);
    const [lon, lat] = centroid(loadFixture(slug).input.polygon).geometry.coordinates as [number, number];
    const written = freeze(join(process.cwd(), "test", "fixtures", slug, "places"), (kind) =>
      cellsWithin([lat, lon], REACH_KM[kind]),
    );
    console.log(`${slug}: ${written} cell files`);
    expect(written).toBeGreaterThan(0);
  });

  it(`the recorded area, ${RECORDED.id}`, async () => {
    const [w, s, e, n] = bbox(await outlineOf(RECORDED.id));
    // Every cell of the box widened by a kind's reach: the trailhead search's for the trailheads (the cells its grid
    // centres' searches touch), the kind's own for the rest.
    const cellsOf = (kind: Kind) => {
      const reach = kind === "trailhead" ? SCREEN_CONSTANTS.near.trailheadKm + 2 : REACH_KM[kind];
      const sw = cellsWithin([s, w], reach)[0]!.split("_").map(Number) as [number, number];
      const ne = cellsWithin([n, e], reach).at(-1)!.split("_").map(Number) as [number, number];
      const cells: string[] = [];
      for (let a = sw[0]; a <= ne[0]; a++) for (let o = sw[1]; o <= ne[1]; o++) cells.push(`${a}_${o}`);
      return cells;
    };
    const written = freeze(AREA_PLACES, cellsOf);
    console.log(`${RECORDED.id}: ${written} cell files`);
    expect(written).toBeGreaterThan(0);
  });
});
