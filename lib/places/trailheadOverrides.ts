/**
 * The cited trailhead overrides (lib/screen/data/trailhead-overrides.json; existing-house plan §2, Zach 11/12): trailheads
 * the sources miss, checked by hand. The places bake adds each as an OpenStreetMap trailhead under its own id, so a
 * parcel near one finds it whatever Overpass answered that run. Pure.
 */
import { z } from "zod";
import type { BakedTrailhead } from "../screen/placeData";
import { LatLonSchema } from "../screen/types";
import overridesJson from "../screen/data/trailhead-overrides.json";

const OverridesSchema = z.strictObject({
  about: z.string(),
  trailheads: z.array(
    z.strictObject({
      id: z.string().regex(/^osm:(node|way|relation)\/\d+$/),
      name: z.string().min(1),
      ll: LatLonSchema,
      // An OpenStreetMap element and the managing agency's page, at least.
      sources: z.array(z.url()).min(2),
      note: z.string(),
      checked: z.iso.date(),
    }),
  ),
});

/** The overrides as baked trailheads. */
export function trailheadOverrides(json: unknown = overridesJson): BakedTrailhead[] {
  return OverridesSchema.parse(json).trailheads.map((t) => ({
    kind: "trailhead",
    id: t.id,
    name: t.name,
    ll: t.ll,
    src: "osm",
  }));
}
