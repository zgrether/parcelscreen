/**
 * Map layers › Public land's data (roadmap step 16, docs/plans/step-16-public-lands.md §2): USGS PAD-US 4.1's Manager
 * Name layer, the same database and version as the grade's `Fee_Managers_PADUS`, with its Fee and Easement records
 * only. Asked by fixed map tiles at two levels of detail, each a GET whose box is MapLibre's `{bbox-epsg-3857}`, so the
 * offline cache and Save offline key it by tile as they key Slope. The service never clips to the tile: a unit that
 * crosses tiles comes back whole in each, and the layer keeps it once. Pure: the map component fetches.
 */
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { z } from "zod";

export const PADUS_MANAGER_NAME =
  "https://services.arcgis.com/v01gqwM5QqNysAAi/ArcGIS/rest/services/Manager_Name_PADUS/FeatureServer/0";

/** The fields the style and the card read. */
export const PADUS_FIELDS = [
  "OBJECTID",
  "FeatClass",
  "Mang_Type",
  "Mang_Name",
  "Loc_Mang",
  "Des_Tp",
  "Loc_Ds",
  "Unit_Nm",
  "Pub_Access",
  "Src_Date",
  "GIS_Acres",
  "EsmtHldr",
] as const;

export type DetailLevel = "coarse" | "fine";

export interface Level {
  /** The tiles the data is asked by. */
  tileZoom: number;
  /** The server's simplification, degrees (outSR 4326): one zoom-9 pixel coarse, about 5 m fine. */
  offsetDeg: number;
  /** Drawn from this map zoom, up to the next level's. */
  minZoom: number;
}

export const LEVELS: Record<DetailLevel, Level> = {
  coarse: { tileZoom: 9, offsetDeg: 0.00275, minZoom: 9 },
  fine: { tileZoom: 11, offsetDeg: 0.00005, minZoom: 11 },
};

/** Shown from this zoom; below it, the zoom hint. */
export const PUBLIC_LAND_MIN_ZOOM = LEVELS.coarse.minZoom;

export const levelAt = (zoom: number): DetailLevel => (zoom >= LEVELS.fine.minZoom ? "fine" : "coarse");

/** A level's query as a MapLibre-style template: the tile's box is `{bbox-epsg-3857}`. */
export function publicLandTemplate(level: DetailLevel): string {
  const q = new URLSearchParams({
    f: "geojson",
    where: "FeatClass IN ('Fee','Easement')",
    geometryType: "esriGeometryEnvelope",
    inSR: "102100",
    spatialRel: "esriSpatialRelIntersects",
    outFields: PADUS_FIELDS.join(","),
    outSR: "4326",
    maxAllowableOffset: String(LEVELS[level].offsetDeg),
    geometryPrecision: level === "fine" ? "6" : "4",
  });
  // The placeholder stays unescaped, as MapLibre's own templates are.
  return `${PADUS_MANAGER_NAME}/query?${q.toString()}&geometry={bbox-epsg-3857}`;
}

const Props = z.object({
  OBJECTID: z.number(),
  FeatClass: z.string().nullish(),
  Mang_Type: z.string().nullish(),
  Mang_Name: z.string().nullish(),
  Loc_Mang: z.string().nullish(),
  Des_Tp: z.string().nullish(),
  Loc_Ds: z.string().nullish(),
  Unit_Nm: z.string().nullish(),
  Pub_Access: z.string().nullish(),
  Src_Date: z.string().nullish(),
  GIS_Acres: z.number().nullish(),
  EsmtHldr: z.string().nullish(),
});
export type PadusUnit = z.infer<typeof Props>;

const Answer = z.object({
  features: z
    .array(
      z.object({
        type: z.literal("Feature"),
        geometry: z
          .object({ type: z.enum(["Polygon", "MultiPolygon"]), coordinates: z.array(z.any()) })
          .nullable(),
        properties: Props,
      }),
    )
    .default([]),
  error: z.unknown().optional(),
});

export type UnitFeature = Feature<Polygon | MultiPolygon, PadusUnit>;

/**
 * A tile's answer as features, or null when it isn't one (an ArcGIS error comes back as JSON with a 200). A record
 * without geometry is dropped.
 */
export function parseTile(json: unknown): UnitFeature[] | null {
  const r = Answer.safeParse(json);
  if (!r.success || r.data.error !== undefined) return null;
  return r.data.features.filter((f) => f.geometry !== null) as UnitFeature[];
}
