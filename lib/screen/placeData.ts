/**
 * The baked places (roadmap step 14d, docs/plans/step-14d-places.md §2): groceries, trailheads and their parking, and
 * paddle launches, for VA, NC and TN plus 60 km, in 1° cells under `public/places/v1/`. Two folders, one per
 * licence: `osm/` (OpenStreetMap, ODbL) and `official/` (USFS and the states). No published file mixes them; the near
 * step merges them per grade (§2.3). Pure data and arithmetic: the worker fetches the cells, Node reads them.
 */
import { z } from "zod";
import type { HttpClient } from "../http";
import { LatLonSchema } from "./types";
import type { LatLon } from "./util";

export const PLACES_VERSION = 1 as const;
/** Where the app serves them, and where the bake writes them under `public/`. */
export const PLACES_PATH = `/places/v${PLACES_VERSION}`;

export const PLACE_FOLDERS = ["osm", "official"] as const;
export type PlaceFolder = (typeof PLACE_FOLDERS)[number];

/**
 * Each source, as a place records it. The trailhead sources map onto the near step's three ranks (usfs, state, osm;
 * trailheads.ts) by `TRAILHEAD_RANK_SOURCE`.
 */
export const PLACE_SOURCES = ["osm", "usfs", "va-parks", "nc-parks", "tn-parks", "tn-trec"] as const;
export type PlaceSource = (typeof PLACE_SOURCES)[number];

export const FOLDER_OF: Record<PlaceSource, PlaceFolder> = {
  osm: "osm",
  usfs: "official",
  "va-parks": "official",
  "nc-parks": "official",
  "tn-parks": "official",
  "tn-trec": "official",
};

export const TRAILHEAD_RANK_SOURCE: Record<PlaceSource, "usfs" | "state" | "osm"> = {
  osm: "osm",
  usfs: "usfs",
  "va-parks": "state",
  "nc-parks": "state",
  "tn-parks": "state",
  "tn-trec": "state",
};

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const Base = {
  /** Stable across bakes: "osm:way/123", "usfs:4521", "tn-trec:88:p". */
  id: z.string().min(1),
  name: z.string().min(1),
  ll: LatLonSchema,
  src: z.enum(PLACE_SOURCES),
};

const GrocerSchema = z.strictObject({
  kind: z.literal("grocer"),
  ...Base,
  /** A chain (near.bigGrocer), by its name or brand. */
  big: z.boolean(),
});

const TrailheadSchema = z.strictObject({
  kind: z.literal("trailhead"),
  ...Base,
  /** A TREC trail's trailhead, named after its trail; merged by distance at grade time (trailheads.ts). */
  trec: z.literal(true).optional(),
});

/**
 * An OSM parking lot within drive.parkingWithinM of a baked trailhead. The drive step still picks a trailhead's lot
 * at grade time (`parkingFor`, trailheadParking.ts), from these instead of an Overpass query, so the merged trailhead's
 * own name and point decide it as before. Only what `parkingFor` reads is kept: the name, and whether another tag says
 * trailhead or hiking.
 */
const ParkingSchema = z.strictObject({
  kind: z.literal("parking"),
  id: z.string().min(1),
  ll: LatLonSchema,
  src: z.literal("osm"),
  name: z.string().min(1).optional(),
  hiking: z.literal(true).optional(),
});

/**
 * A paddle launch (step 14d plan §2.4): OSM's slipways, put-ins and access points, and USFS's boating sites, each
 * classified at bake time from NHD: flatwater when within paddling.flatwaterWithinM of a lake, pond or reservoir of at
 * least paddling.flatwaterMinAc, else river (and always river when tagged whitewater).
 */
const LaunchSchema = z.strictObject({
  kind: z.literal("launch"),
  ...Base,
  water: z.enum(["flat", "river"]),
  /** The lake's or the river's NHD name, when it has one. */
  waterName: z.string().min(1).optional(),
  /** The lake's acres (flatwater only). */
  waterAc: z.number().nonnegative().optional(),
  /** A named paddle trail it's on (an OSM canoe route). */
  trail: z.string().min(1).optional(),
});

export const PlaceSchema = z.discriminatedUnion("kind", [
  GrocerSchema,
  TrailheadSchema,
  ParkingSchema,
  LaunchSchema,
]);
export type Place = z.infer<typeof PlaceSchema>;
export type Grocer = z.infer<typeof GrocerSchema>;
export type BakedTrailhead = z.infer<typeof TrailheadSchema>;
export type BakedParking = z.infer<typeof ParkingSchema>;
export type BakedLaunch = z.infer<typeof LaunchSchema>;

export const PlaceCellSchema = z.strictObject({
  version: z.literal(PLACES_VERSION),
  folder: z.enum(PLACE_FOLDERS),
  cell: z.string().regex(/^-?\d+_-?\d+$/),
  baked: DateSchema,
  /** Sorted by id, so a bake that finds the same places writes the same file. */
  places: z.array(PlaceSchema),
});
export type PlaceCell = z.infer<typeof PlaceCellSchema>;

export const PlacesIndexSchema = z.strictObject({
  version: z.literal(PLACES_VERSION),
  baked: DateSchema,
  /** The baked area's box, [west, south, east, north]: VA, NC and TN plus `marginKm`. */
  bounds: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  marginKm: z.number(),
  sources: z.array(
    z.strictObject({
      id: z.enum(PLACE_SOURCES),
      name: z.string(),
      folder: z.enum(PLACE_FOLDERS),
      licence: z.string(),
      attribution: z.string(),
      url: z.string(),
      /** The date its places were fetched: the bake's, or an earlier bake's when this one couldn't reach it. */
      fetched: DateSchema,
      count: z.number().int().nonnegative(),
    }),
  ),
  /** The cells each folder has, with their place counts; a cell not listed has no places. */
  cells: z.strictObject({
    osm: z.record(z.string(), z.number().int().nonnegative()),
    official: z.record(z.string(), z.number().int().nonnegative()),
  }),
});
export type PlacesIndex = z.infer<typeof PlacesIndexSchema>;

/** The cell holding a point: its south-west corner in whole degrees, "36_-82". */
export function cellOf([lat, lon]: LatLon): string {
  return `${Math.floor(lat)}_${Math.floor(lon)}`;
}

/** The cells a circle of `km` around the centre touches (its bounding box's), south to north, west to east. */
export function cellsWithin([lat, lon]: LatLon, km: number): string[] {
  const dLat = km / 111.32;
  const dLon = km / (111.32 * Math.cos((lat * Math.PI) / 180));
  const out: string[] = [];
  for (let a = Math.floor(lat - dLat); a <= Math.floor(lat + dLat); a++)
    for (let o = Math.floor(lon - dLon); o <= Math.floor(lon + dLon); o++) out.push(`${a}_${o}`);
  return out;
}

/** Reads a folder's cells; a cell the bake didn't write (no places, or outside the area) reads as empty. */
export type PlacesSource = (
  folder: PlaceFolder,
  cells: readonly string[],
  signal?: AbortSignal,
) => Promise<Place[]>;

/**
 * The browser's (the worker's): each cell from the app's own origin through the throttled client, `base` being the
 * origin plus PLACES_PATH. A 404 is a cell with nothing in it; any other failure rejects (the places half is lost).
 */
export function placesFromHttp(http: HttpClient, base: string): PlacesSource {
  return async (folder, cells, signal) => {
    const files = await Promise.all(
      cells.map(async (cell) => {
        const r = await http.fetch(`${base}/${folder}/${cell}.json`, {
          timeoutMs: 20_000,
          ...(signal ? { signal } : {}),
        });
        if (r.status === 404) return [];
        if (!r.ok) throw new Error(`places ${folder}/${cell}: ${r.status}`);
        return PlaceCellSchema.parse(await r.json()).places;
      }),
    );
    return files.flat();
  };
}
