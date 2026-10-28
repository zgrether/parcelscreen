/**
 * Map layers › Motor-vehicle routes' data (roadmap step 16, docs/plans/step-16-public-lands.md §1.2, §2): the Forest
 * Service's Motor Vehicle Use Map roads and trails (the Enterprise Data Warehouse's `EDW_MVUM_01`, layers 1 and 2),
 * Forest Service system routes only (the `symbol` values that carry MVUM data). Asked by zoom-11 tiles, each a GET whose
 * box is MapLibre's `{bbox-epsg-3857}`, so the offline cache keys it by tile. Pure: the map component fetches.
 */
import type { Feature, LineString, MultiLineString } from "geojson";
import { z } from "zod";

export const MVUM_SERVICE = "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_01/MapServer";

export type RouteLayer = "roads" | "trails";
export const ROUTE_LAYERS: readonly RouteLayer[] = ["roads", "trails"];
const LAYER_ID: Record<RouteLayer, number> = { roads: 1, trails: 2 };

/** The MVUM symbols of Forest Service system routes (the service's own description). */
const SYMBOLS: Record<RouteLayer, readonly string[]> = {
  roads: ["1", "2", "3", "4", "11", "12"],
  trails: ["5", "6", "7", "8", "9", "10", "11", "12", "16", "17"],
};

/** Each vehicle class's open field and its dates, as the MVUM names them. */
export const VEHICLES = [
  ["passengervehicle", "passengervehicle_datesopen"],
  ["highclearancevehicle", "highclearancevehicle_datesopen"],
  ["truck", "truck_datesopen"],
  ["bus", "bus_datesopen"],
  ["motorhome", "motorhome_datesopen"],
  ["fourwd_gt50inches", "fourwd_gt50_datesopen"],
  ["twowd_gt50inches", "twowd_gt50_datesopen"],
  ["other_ohv_gt50inches", "other_ohv_gt50_datesopen"],
  ["tracked_ohv_gt50inches", "tracked_ohv_gt50_datesopen"],
  ["atv", "atv_datesopen"],
  ["motorcycle", "motorcycle_datesopen"],
  ["otherwheeled_ohv", "otherwheeled_ohv_datesopen"],
  ["other_ohv_lt50inches", "other_ohv_lt50_datesopen"],
  ["tracked_ohv_lt50inches", "tracked_ohv_lt50_datesopen"],
] as const;
export type VehicleField = (typeof VEHICLES)[number][0];

const FIELDS = [
  "objectid",
  "id",
  "name",
  "symbol",
  "seasonal",
  "forestname",
  "districtname",
  ...VEHICLES.flat(),
];

/** Routes are asked by these tiles, and shown from this zoom. */
export const MVUM_TILE_ZOOM = 11;
export const MVUM_MIN_ZOOM = 11;
/** About 5 m, so a route follows its ground at zoom 16. */
const OFFSET_DEG = 0.00005;

export function mvumTemplate(layer: RouteLayer): string {
  const q = new URLSearchParams({
    f: "geojson",
    where: `symbol IN (${SYMBOLS[layer].map((s) => `'${s}'`).join(",")})`,
    geometryType: "esriGeometryEnvelope",
    inSR: "102100",
    spatialRel: "esriSpatialRelIntersects",
    outFields: FIELDS.join(","),
    outSR: "4326",
    maxAllowableOffset: String(OFFSET_DEG),
    geometryPrecision: "6",
  });
  return `${MVUM_SERVICE}/${LAYER_ID[layer]}/query?${q.toString()}&geometry={bbox-epsg-3857}`;
}

const text = z.string().nullish();
const Props = z
  .object({
    objectid: z.number(),
    id: text,
    name: text,
    symbol: z.union([z.string(), z.number()]).transform(String),
    seasonal: text,
    forestname: text,
    districtname: text,
  })
  .catchall(z.unknown());
export type RouteProps = z.infer<typeof Props>;

const Answer = z.object({
  features: z
    .array(
      z.object({
        type: z.literal("Feature"),
        geometry: z
          .object({ type: z.enum(["LineString", "MultiLineString"]), coordinates: z.array(z.any()) })
          .nullable(),
        properties: Props,
      }),
    )
    .default([]),
  error: z.unknown().optional(),
});

export type RouteFeature = Feature<LineString | MultiLineString, RouteProps>;

/** A tile's routes, or null when it isn't an answer (an ArcGIS error is JSON with a 200). */
export function parseRoutes(json: unknown): RouteFeature[] | null {
  const r = Answer.safeParse(json);
  if (!r.success || r.data.error !== undefined) return null;
  return r.data.features.filter((f) => f.geometry !== null) as RouteFeature[];
}
