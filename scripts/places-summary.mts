/**
 * The refresh's places summary (roadmap step 14d, docs/plans/step-14d-places.md §7): compares last month's baked places
 * with this month's, writes the markdown to <out>, and prints `changed=true` or `changed=false` for the workflow.
 *
 *   node scripts/places-summary.mts <before dir> <after dir> <out.md> [<kept.json>]
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { placesSummary } from "../lib/places/summary.ts";
import type { Place, PlaceCell, PlacesIndex } from "../lib/screen/placeData.ts";

const [before, after, out, keptPath] = process.argv.slice(2);
if (!before || !after || !out)
  throw new Error("usage: node scripts/places-summary.mts <before> <after> <out.md> [<kept.json>]");

/** Every place in a bake's folders. */
function places(dir: string): Place[] {
  return ["osm", "official"].flatMap((folder) => {
    const d = join(dir, folder);
    if (!existsSync(d)) return [];
    return readdirSync(d)
      .filter((f) => f.endsWith(".json"))
      .flatMap((f) => (JSON.parse(readFileSync(join(d, f), "utf8")) as PlaceCell).places);
  });
}

const indexOf = (dir: string): PlacesIndex | null =>
  existsSync(join(dir, "index.json")) ? JSON.parse(readFileSync(join(dir, "index.json"), "utf8")) : null;
const towns = indexOf(after)?.towns ?? indexOf(before)?.towns ?? [];
const kept: string[] = keptPath && existsSync(keptPath) ? JSON.parse(readFileSync(keptPath, "utf8")) : [];

const s = placesSummary(places(before), places(after), towns, kept);
writeFileSync(out, s.markdown);
console.log(`changed=${s.changed}`);
