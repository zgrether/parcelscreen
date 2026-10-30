import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import cragsJson from "../screen/data/crags.json";
import { PLACES_PATH, PlaceCellSchema, PlacesIndexSchema, isRopeArea } from "../screen/placeData";
import { cragCells, cragPlace, parseCrags, type CragEntry } from "./crags";

const OUT = join(process.cwd(), "public", PLACES_PATH);

const entry = (over: Partial<CragEntry> = {}): CragEntry => ({
  id: "foster-falls",
  name: "Foster Falls",
  parking: [35.181712, -85.673811],
  types: ["sport"],
  access: "South Cumberland State Park; day use.",
  source: "https://example.org/foster-falls",
  parkingFrom: "osm:way/1",
  checked: "2026-10-31",
  ...over,
});
const file = (crags: CragEntry[]) => ({ about: "test", crags });

describe("the climbing areas' list (step 17, plan §2)", () => {
  it("parses as committed", () => {
    const crags = parseCrags(cragsJson);
    expect(crags.length).toBeGreaterThanOrEqual(30);
    expect(crags.filter((c) => isRopeArea(c.types)).length).toBeGreaterThan(0);
    expect(crags.filter((c) => c.types.includes("bouldering")).length).toBeGreaterThan(0);
  });

  it("refuses a repeated id, name or lot, a lot outside the box, and a type twice", () => {
    const a = entry();
    expect(() => parseCrags(file([a, entry({ name: "Other", parking: [35, -85] })]))).toThrow(/same id/);
    expect(() => parseCrags(file([a, entry({ id: "b", parking: [35, -85] })]))).toThrow(/same name/);
    expect(() => parseCrags(file([a, entry({ id: "b", name: "B" })]))).toThrow(/same lot/);
    expect(() => parseCrags(file([entry({ parking: [44, -85] })]))).toThrow(/outside the box/);
    expect(() => parseCrags(file([entry({ types: ["sport", "sport"] })]))).toThrow(/twice/);
    expect(() => parseCrags(file([entry({ types: [] })]))).toThrow();
  });

  it("counts sport or trad as rope, never top-rope or bouldering alone (§11, Q4)", () => {
    expect(isRopeArea(["trad"])).toBe(true);
    expect(isRopeArea(["sport", "bouldering"])).toBe(true);
    expect(isRopeArea(["top-rope"])).toBe(false);
    expect(isRopeArea(["bouldering", "top-rope"])).toBe(false);
  });

  it("makes a place of each, its lot to 5 decimals and its types in a fixed order", () => {
    expect(cragPlace(entry({ types: ["bouldering", "sport"] }))).toEqual({
      kind: "crag",
      id: "crag:foster-falls",
      name: "Foster Falls",
      ll: [35.18171, -85.67381],
      src: "crags",
      types: ["sport", "bouldering"],
      access: "South Cumberland State Park; day use.",
      url: "https://example.org/foster-falls",
      checked: "2026-10-31",
    });
  });

  it("is baked as committed: the curated cells and the index's lines (pnpm data:crags)", () => {
    const crags = parseCrags(cragsJson);
    const cells = cragCells(crags);
    const dir = join(OUT, "curated");
    expect(existsSync(dir)).toBe(true);
    expect(readdirSync(dir).sort()).toEqual(cells.map((c) => `${c.cell}.json`).sort());
    for (const c of cells)
      expect(PlaceCellSchema.parse(JSON.parse(readFileSync(join(dir, `${c.cell}.json`), "utf8")))).toEqual(c);
    const index = PlacesIndexSchema.parse(JSON.parse(readFileSync(join(OUT, "index.json"), "utf8")));
    expect(index.cells.curated).toEqual(Object.fromEntries(cells.map((c) => [c.cell, c.places.length])));
    expect(index.sources.find((s) => s.id === "crags")?.count).toBe(crags.length);
  });
});
