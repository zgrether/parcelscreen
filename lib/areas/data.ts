/**
 * The area profiler's two destination lists (step 13, docs/plans/step-13-area-catalog.md §3.4), checked when loaded:
 * the hospitals with an emergency department (CMS Hospital General Information, `pnpm data:er`) and the commercial
 * airports (BTS NTAD, Part 139 Class I with scheduled service, `pnpm data:airports`). The parcel screen reads neither.
 */
import { z } from "zod";
import { LatLonSchema } from "../screen/types";

export const ErListSchema = z.strictObject({
  source: z.string(),
  /** CMS's release date of the dataset. */
  released: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checked: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hospitals: z
    .array(
      z.strictObject({
        /** CMS's facility ID (the CCN). */
        id: z.string(),
        name: z.string(),
        city: z.string(),
        state: z.string().length(2),
        type: z.string(),
        ll: LatLonSchema,
      }),
    )
    .min(1),
  /** CMS hospitals that neither the geocoder nor the OSM snapshot could place: left out. */
  unplaced: z.array(z.string()),
  /** OSM emergency=yes hospitals no CMS entry matches (a reopening CMS hasn't listed yet): for review, never timed. */
  osmOnly: z.array(z.strictObject({ name: z.string(), ll: LatLonSchema })),
});
export type ErList = z.infer<typeof ErListSchema>;

export const AirportListSchema = z.strictObject({
  source: z.string(),
  /** The FAA records' effective date. */
  effective: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checked: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  airports: z
    .array(
      z.strictObject({
        code: z.string().regex(/^[A-Z0-9]{3,4}$/),
        name: z.string(),
        city: z.string(),
        state: z.string().length(2),
        ll: LatLonSchema,
      }),
    )
    .min(1),
});
export type AirportList = z.infer<typeof AirportListSchema>;

let ers: Promise<ErList> | null = null;
let airports: Promise<AirportList> | null = null;

/** The ER list, once per process. */
export const loadErList = (): Promise<ErList> =>
  (ers ??= import("./data/er.json").then((m) => ErListSchema.parse(m.default)));

/** The airport list, once per process. */
export const loadAirports = (): Promise<AirportList> =>
  (airports ??= import("./data/airports.json").then((m) => AirportListSchema.parse(m.default)));
