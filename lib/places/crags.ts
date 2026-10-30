/**
 * Climbing areas (roadmap step 17, docs/plans/step-17-climbing.md §2): the hand-curated list in
 * lib/screen/data/crags.json, checked, and baked as `crag` places into the places' `curated/` folder. Each entry is one
 * climbers' lot; its note is ours, read from the land manager's or the climbing coalition's page it cites. Pure.
 */
import { z } from "zod";
import { CRAG_TYPES, PLACES_VERSION, cellOf, type BakedCrag, type PlaceCell } from "../screen/placeData";
import { LatLonSchema } from "../screen/types";

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** The places' baked box, [west, south, east, north] (lib/places/bake.ts): every crag's lot is inside it. */
const BOX = [-92, 33, -74, 41] as const;

export const CragEntrySchema = z.strictObject({
  /** Stable and kebab-case: the place's id is "crag:<id>". */
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  name: z.string().min(1),
  /** The climbers' lot, [lat, lon], 5 decimals. */
  parking: LatLonSchema,
  types: z.array(z.enum(CRAG_TYPES)).min(1),
  /** One line in our own words: permits, closures, fees, waivers, where to park. */
  access: z.string().min(1).max(160),
  /** The land manager's or the coalition's page the note was read from. */
  source: z.string().url(),
  /** Where the lot's point came from: "osm:way/123", or the manager's published trailhead. */
  parkingFrom: z.string().min(1),
  checked: DateSchema,
});
export type CragEntry = z.infer<typeof CragEntrySchema>;

export const CragsFileSchema = z.strictObject({
  about: z.string(),
  crags: z.array(CragEntrySchema).min(1),
});

/** The list, checked: the schema, unique ids and names, distinct lots, and every lot inside the bake's box. */
export function parseCrags(json: unknown): CragEntry[] {
  const { crags } = CragsFileSchema.parse(json);
  const problems: string[] = [];
  const seen = new Map<string, string>();
  for (const c of crags) {
    for (const key of [`id ${c.id}`, `name ${c.name}`, `lot ${c.parking.join(",")}`]) {
      if (seen.has(key)) problems.push(`${c.id}: same ${key.split(" ")[0]} as ${seen.get(key)}`);
      else seen.set(key, c.id);
    }
    const [lat, lon] = c.parking;
    if (lon < BOX[0] || lat < BOX[1] || lon > BOX[2] || lat > BOX[3])
      problems.push(`${c.id}: lot outside the box`);
    if (new Set(c.types).size !== c.types.length) problems.push(`${c.id}: a type listed twice`);
  }
  if (problems.length) throw new Error(`crags.json: ${problems.join("; ")}`);
  return crags;
}

/** A crag as a place: its lot rounded to 5 decimals (about a metre), its types in the list's order. */
export function cragPlace(c: CragEntry): BakedCrag {
  const r5 = (x: number) => Number(x.toFixed(5));
  return {
    kind: "crag",
    id: `crag:${c.id}`,
    name: c.name,
    ll: [r5(c.parking[0]), r5(c.parking[1])],
    src: "crags",
    types: CRAG_TYPES.filter((t) => c.types.includes(t)),
    access: c.access,
    url: c.source,
    checked: c.checked,
  };
}

/** The latest check: the curated cells' bake date, so the same list always writes the same files. */
export const lastChecked = (crags: readonly CragEntry[]): string =>
  crags.reduce((d, c) => (c.checked > d ? c.checked : d), "0000-00-00");

/** The `curated/` folder's cells, sorted by cell, each cell's crags by id. */
export function cragCells(crags: readonly CragEntry[]): PlaceCell[] {
  const baked = lastChecked(crags);
  const byCell = new Map<string, BakedCrag[]>();
  for (const p of crags.map(cragPlace)) byCell.set(cellOf(p.ll), [...(byCell.get(cellOf(p.ll)) ?? []), p]);
  return [...byCell.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([cell, places]) => ({
      version: PLACES_VERSION,
      folder: "curated" as const,
      cell,
      baked,
      places: places.sort((a, b) => (a.id < b.id ? -1 : 1)),
    }));
}
