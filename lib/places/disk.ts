/**
 * The baked places read from disk (roadmap step 14d): for the runs outside the app, the area profiler's monthly refresh
 * (the repo's own bake, public/places/v1) and the tests (a fixture's frozen copy). The app reads them over HTTP
 * (placesFromHttp); a cell the bake didn't write reads as empty either way.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PLACES_PATH, PlaceCellSchema, type PlacesSource } from "../screen/placeData";

/** The repo's current bake. */
export const BAKE_DIR = join(process.cwd(), "public", PLACES_PATH);

export function placesFromDir(dir: string): PlacesSource {
  return async (folder, cells) =>
    cells.flatMap((cell) => {
      const file = join(dir, folder, `${cell}.json`);
      return existsSync(file) ? PlaceCellSchema.parse(JSON.parse(readFileSync(file, "utf8"))).places : [];
    });
}
