/**
 * An area's profile file (step 13, docs/plans/step-13-area-catalog.md §3.3): public/areas/v2/<id>.json, written by
 * `pnpm areas:profile` and loaded on demand. The per-point values are columns; a measure that failed at a point is
 * null there. A format change starts the next version and drops the last (clean break, §1): v2 added paddleMin (step
 * 14d plan §4.4).
 */
import { z } from "zod";
import { LatLonSchema, ScreenResultSchema } from "../screen/types";

/** The file format's version; it's also the folder: public/areas/v2/. */
export const AREA_FILE_VERSION = 2;
export const AREAS_PATH = `/areas/v${AREA_FILE_VERSION}`;

/** What's measured at each point (§3.2), in the units the card's rows read. */
export const MEASURES = [
  "elevFt",
  "skyMag",
  "janLowF",
  "julHighF",
  "viewOpenPct",
  "erMin",
  "groceryMin",
  "airportMin",
  "trailheadMin",
  "openLandFt",
  "longTrailMin",
  "paddleMin",
] as const;
export type Measure = (typeof MEASURES)[number];

const Column = z.array(z.number().nullable());
/** A GeoJSON position, [lon, lat]. */
const Position = z.array(z.number()).min(2);
const Geometry = z.union([
  z.strictObject({ type: z.literal("Polygon"), coordinates: z.array(z.array(Position)) }),
  z.strictObject({ type: z.literal("MultiPolygon"), coordinates: z.array(z.array(z.array(Position))) }),
]);
const Date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const AreaFileSchema = z.strictObject({
  version: z.literal(AREA_FILE_VERSION),
  id: z.string(),
  name: z.string(),
  description: z.tuple([z.string(), z.string()]),
  /** GeoJSON, [lon, lat]. */
  outline: Geometry,
  profiledAt: Date,
  /** Each source and its date or edition, as the refresh summary lists them. */
  sources: z.record(z.string(), z.string()),
  /** Candidates drawn to accept the points (water, developed and public land rejected). */
  candidates: z.number().int(),
  /** Fewer than the profile's minimum points were accepted: the shares say "from N points". */
  thin: z.boolean(),
  points: z.strictObject({
    /** [lat, lon]. */
    ll: z.array(LatLonSchema),
    ...(Object.fromEntries(MEASURES.map((m) => [m, Column])) as Record<Measure, typeof Column>),
  }),
  medians: z.strictObject(
    Object.fromEntries(MEASURES.map((m) => [m, z.number().nullable()])) as Record<
      Measure,
      z.ZodNullable<z.ZodNumber>
    >,
  ),
});
export type AreaFile = z.infer<typeof AreaFileSchema>;

export const AreaIndexSchema = z.strictObject({
  version: z.literal(AREA_FILE_VERSION),
  areas: z.array(
    z.strictObject({
      id: z.string(),
      name: z.string(),
      profiledAt: Date,
      /** [west, south, east, north]: the map can place an outline's label before its file loads. */
      bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    }),
  ),
});
export type AreaIndex = z.infer<typeof AreaIndexSchema>;

/**
 * A sample parcel's file's version (step 13 plan §5): samples are screens, not profiles, so they keep their own
 * version and folder, public/areas/v1/samples/, when the area files' format moves on.
 */
export const SAMPLE_FILE_VERSION = 1;
const SAMPLES_PATH = `/areas/v${SAMPLE_FILE_VERSION}/samples`;

/**
 * A sample parcel (step 13 plan §5): public/areas/v1/samples/<area>-<n>.json, written by `pnpm areas:samples`. Its
 * boundary, its acres and its screen, and nothing else: no owner, address or parcel number (phase-0.md §9.23). The
 * name is the app's.
 */
export const SampleFileSchema = z.strictObject({
  version: z.literal(SAMPLE_FILE_VERSION),
  area: z.string(),
  n: z.number().int().positive(),
  name: z.string(),
  acres: z.number(),
  boundary: z.strictObject({ type: z.literal("Polygon"), coordinates: z.array(z.array(Position)) }),
  result: ScreenResultSchema,
});
export type SampleFile = z.infer<typeof SampleFileSchema>;

/** Where a sample's file is. */
export const samplePath = (area: string, n: number): string => `${SAMPLES_PATH}/${area}-${n}.json`;
