/**
 * The committed profiles (step 13 plan §3.3, §10): one file per area in public/areas/v2/, each passing its schema,
 * with its catalog name and description, and an index listing all thirty in the catalog's order.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AREAS } from "./catalog";
import { AREA_FILE_VERSION, AreaFileSchema, AreaIndexSchema } from "./types";

const dir = join(process.cwd(), "public", "areas", `v${AREA_FILE_VERSION}`);
const read = (name: string): unknown => JSON.parse(readFileSync(join(dir, name), "utf8"));

describe("the committed profiles", () => {
  it.each(AREAS.map((a) => [a.id, a] as const))(
    "%s: passes its schema, with the catalog's words",
    (id, def) => {
      const file = AreaFileSchema.parse(read(`${id}.json`));
      expect(file.id).toBe(id);
      expect(file.name).toBe(def.name);
      expect(file.description).toEqual([...def.description]);
      expect(file.points.ll.length).toBeGreaterThan(0);
    },
  );

  it("the index lists every area, in the catalog's order", () => {
    const index = AreaIndexSchema.parse(read("index.json"));
    expect(index.areas.map((a) => a.id)).toEqual(AREAS.map((a) => a.id));
  });
});
