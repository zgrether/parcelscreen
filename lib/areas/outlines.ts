/**
 * The areas' outlines (step 13, docs/plans/step-13-area-catalog.md §2.1), built by `pnpm areas:outlines` from the
 * recipes in catalog.ts and checked when loaded.
 */
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { z } from "zod";

const Ring = z.array(z.tuple([z.number(), z.number()])).min(4);
const Geometry = z.union([
  z.strictObject({ type: z.literal("Polygon"), coordinates: z.array(Ring).min(1) }),
  z.strictObject({ type: z.literal("MultiPolygon"), coordinates: z.array(z.array(Ring).min(1)).min(1) }),
]);

export const OutlinesSchema = z.strictObject({
  source: z.string(),
  checked: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.literal("FeatureCollection"),
  features: z.array(
    z.strictObject({
      type: z.literal("Feature"),
      properties: z.strictObject({ id: z.string(), mi2: z.number() }),
      geometry: Geometry,
    }),
  ),
});
export type Outlines = z.infer<typeof OutlinesSchema>;
export type Outline = Feature<Polygon | MultiPolygon, { id: string; mi2: number }>;

let loaded: Promise<Outlines> | null = null;

/** The outlines, once per process. */
export const loadOutlines = (): Promise<Outlines> =>
  (loaded ??= import("./data/outlines.json").then((m) => OutlinesSchema.parse(m.default)));

/** An area's outline by its id. */
export async function outlineOf(id: string): Promise<Outline> {
  const f = (await loadOutlines()).features.find((x) => x.properties.id === id);
  if (!f) throw new Error(`no outline for ${id}`);
  return f as Outline;
}
