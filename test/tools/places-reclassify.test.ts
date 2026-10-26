/**
 * The baked launches brought up to #350's flatwater rule without a re-bake (owner, 10/26): each launch the bake called
 * river is flatwater when its name or a known dam pool says so (lib/places/flatwater.ts), and Recreation.gov's
 * Corps and Forest Service sites (lib/places/ridb.ts) join the official cells. The next bake applies the same rule to
 * the sources' own names and tags; this pass has only the baked names, so a name the bake made up from the water
 * ("<river> access", "Boat launch") counts only through the known pools, and a whitewater tag isn't seen.
 *
 *   pnpm exec vitest run test/tools/places-reclassify.test.ts --mode places-reclassify
 *
 * Offline: it rewrites public/places/v1 in place and prints each launch it changed.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SOURCE_DEFS } from "@/lib/places/bake";
import { KNOWN_POOLS, flatwaterByName } from "@/lib/places/flatwater";
import { RIDB_LAUNCHES } from "@/lib/places/ridb";
import {
  FOLDER_OF,
  PLACE_FOLDERS,
  PLACES_PATH,
  PlaceCellSchema,
  PlacesIndexSchema,
  cellOf,
  type Place,
  type PlaceCell,
} from "@/lib/screen/placeData";

const OUT = join(process.cwd(), "public", PLACES_PATH);

describe.runIf(import.meta.env.MODE === "places-reclassify")("the baked launches, reclassified", () => {
  it("rewrites the cells and the index", () => {
    const index = PlacesIndexSchema.parse(JSON.parse(readFileSync(join(OUT, "index.json"), "utf8")));
    const cells = new Map<string, PlaceCell>();
    for (const folder of PLACE_FOLDERS)
      for (const f of readdirSync(join(OUT, folder)).filter((x) => x.endsWith(".json"))) {
        const c = PlaceCellSchema.parse(JSON.parse(readFileSync(join(OUT, folder, f), "utf8")));
        cells.set(`${folder}/${c.cell}`, c);
      }

    const changed: string[] = [];
    for (const c of cells.values())
      c.places = c.places
        .filter((p) => p.src !== "ridb")
        .map((p): Place => {
          if (p.kind !== "launch" || p.water !== "river") return p;
          const madeUp = p.name === "Boat launch" || (!!p.waterName && p.name === `${p.waterName} access`);
          const still = flatwaterByName({ id: p.id, ...(madeUp ? {} : { name: p.name }) });
          if (!still) return p;
          const name = madeUp && still.waterName ? `${still.waterName} access` : p.name;
          changed.push(
            `${p.id} | ${p.name}${name !== p.name ? ` → ${name}` : ""} | was ${p.waterName ?? "-"}`,
          );
          const { waterName: _river, ...rest } = p;
          return { ...rest, name, water: "flat", ...(still.waterName ? { waterName: still.waterName } : {}) };
        });

    for (const l of RIDB_LAUNCHES) {
      const key = `${FOLDER_OF[l.src]}/${cellOf(l.ll)}`;
      const c = cells.get(key) ?? {
        version: index.version,
        folder: FOLDER_OF[l.src],
        cell: cellOf(l.ll),
        baked: index.baked,
        places: [],
      };
      c.places.push(l);
      cells.set(key, c);
    }
    for (const c of cells.values()) c.places.sort((a, b) => (a.id < b.id ? -1 : 1));

    const all = [...cells.values()].flatMap((c) => c.places);
    index.sources = SOURCE_DEFS.map((d) => ({
      ...d,
      folder: FOLDER_OF[d.id],
      fetched: d.fetched ?? index.sources.find((s) => s.id === d.id)?.fetched ?? index.baked,
      count: all.filter((p) => p.src === d.id && p.kind !== "parking").length,
    }));
    index.cells = Object.fromEntries(
      PLACE_FOLDERS.map((f) => [
        f,
        Object.fromEntries(
          [...cells.values()]
            .filter((c) => c.folder === f)
            .sort((a, b) => (a.cell < b.cell ? -1 : 1))
            .map((c) => [c.cell, c.places.length]),
        ),
      ]),
    ) as typeof index.cells;

    for (const c of cells.values())
      writeFileSync(join(OUT, c.folder, `${c.cell}.json`), JSON.stringify(PlaceCellSchema.parse(c)) + "\n");
    writeFileSync(join(OUT, "index.json"), JSON.stringify(PlacesIndexSchema.parse(index), null, 2) + "\n");
    console.log(
      [
        `${changed.length} launches now flatwater:`,
        ...changed,
        `${RIDB_LAUNCHES.length} Recreation.gov launches added`,
      ].join("\n"),
    );
    expect(Object.keys(KNOWN_POOLS).every((id) => all.some((p) => p.id === id && p.kind === "launch"))).toBe(
      true,
    );
  });
});
