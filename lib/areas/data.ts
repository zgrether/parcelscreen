/**
 * The area profiler's two destination lists (step 13, docs/plans/step-13-area-catalog.md §3.4), checked when loaded:
 * the hospitals with an emergency department (CMS Hospital General Information, `pnpm data:er`) and the commercial
 * airports (BTS NTAD, Part 139 Class I with scheduled service, `pnpm data:airports`). The parcel screen reads neither.
 */
import { distance } from "@turf/turf";
import { z } from "zod";
import { ADDITION_MATCH_KM, ErAdditionsSchema, type ErAddition } from "../screen/hospitals";
import { LatLonSchema } from "../screen/types";
import type { LatLon } from "../geo/types";

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

/** The hand-checked additions (lib/screen/data/er-additions.json), once per process; none when they don't load. */
export const loadErAdditions = (): Promise<ErAddition[]> =>
  import("../screen/data/er-additions.json")
    .then((m) => ErAdditionsSchema.parse(m.default).hospitals)
    .catch(() => []);

const km = ([a, b]: LatLon, [c, d]: LatLon) => distance([b, a], [d, c], { units: "kilometers" });

/**
 * Where the profiler times ER drives to (owner, #298 answers): CMS's hospitals with an ER, less any an addition within
 * ADDITION_MATCH_KM says has none, plus the additions with an ER that CMS doesn't have near them.
 */
export function erDestinations(list: ErList, additions: readonly ErAddition[]): LatLon[] {
  const near = (a: LatLon, b: LatLon) => km(a, b) <= ADDITION_MATCH_KM;
  const closed = additions.filter((a) => !a.er);
  const cms = list.hospitals.map((h) => h.ll).filter((ll) => !closed.some((a) => near(a.ll, ll)));
  const added = additions.filter((a) => a.er && !cms.some((ll) => near(a.ll, ll))).map((a) => a.ll);
  return [...cms, ...added];
}

/** Words too common in hospital names to say two names are the same place. */
const GENERIC = new Set(
  "hospital hospitals medical center centre regional health healthcare memorial community county general system inc the of and saint st emergency department campus".split(
    " ",
  ),
);
const words = (name: string) =>
  name
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 2 && !GENERIC.has(w));
const VETERANS = /veterans|\bva medical/i;
/** OSM's name and CMS's within this distance, sharing a word that isn't generic, are taken to be the same hospital. */
const NAME_MATCH_KM = 5;

/**
 * The ERs in OpenStreetMap but not CMS, to confirm by hand (owner, #298 answers): the snapshot's OSM-only list, less
 * those an addition already covers and those CMS has under another name nearby. Listed in the monthly refresh PR,
 * never timed.
 */
export function ersToConfirm(list: ErList, additions: readonly ErAddition[]): ErList["osmOnly"] {
  // CMS's hospitals it couldn't place: their names, without the town and state.
  const unplaced = list.unplaced.map((u) => words(u.split(",")[0] ?? u));
  return list.osmOnly.filter((o) => {
    if (additions.some((a) => km(a.ll, o.ll) <= 1.5)) return false;
    // A veterans' hospital's ER isn't open to everyone, which is why CMS's list leaves them out.
    if (VETERANS.test(o.name)) return false;
    const mine = new Set(words(o.name));
    if (unplaced.some((u) => u.filter((w) => mine.has(w)).length >= 2)) return false;
    return !list.hospitals.some(
      (h) => km(h.ll, o.ll) <= NAME_MATCH_KM && words(h.name).some((w) => mine.has(w)),
    );
  });
}
