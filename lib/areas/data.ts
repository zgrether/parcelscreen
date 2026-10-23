/**
 * The area profiler's two destination lists (step 13, docs/plans/step-13-area-catalog.md §3.4), checked when loaded:
 * the hospitals with an emergency department, the same list parcel screens time (lib/screen/hospitals.ts: CMS Hospital
 * General Information with the hand-checked additions, `pnpm data:er`; phase-0.md §9.69), and the commercial airports
 * (BTS NTAD, Part 139 Class I with scheduled service, `pnpm data:airports`).
 */
import { distance } from "@turf/turf";
import { z } from "zod";
import { erPlaces, loadErLists, type ErAddition, type ErList } from "../screen/hospitals";
import { LatLonSchema } from "../screen/types";
import type { LatLon } from "../geo/types";
import { CATALOG_BOX } from "./extent";

export type { ErList };

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

let airports: Promise<AirportList> | null = null;

/** CMS's ER list, once per process (lib/screen/data/er.json). */
export const loadErList = (): Promise<ErList> => loadErLists().then(([list]) => list);

/** The airport list, once per process. */
export const loadAirports = (): Promise<AirportList> =>
  (airports ??= import("./data/airports.json").then((m) => AirportListSchema.parse(m.default)));

/** The hand-checked additions (lib/screen/data/er-additions.json), once per process. */
export const loadErAdditions = (): Promise<ErAddition[]> => loadErLists().then(([, additions]) => additions);

const km = ([a, b]: LatLon, [c, d]: LatLon) => distance([b, a], [d, c], { units: "kilometers" });

/** Where the profiler times ER drives to: the parcel screen's ERs (lib/screen/hospitals.ts erPlaces), as points. */
export const erDestinations = (list: ErList, additions: readonly ErAddition[]): LatLon[] =>
  erPlaces(list, additions).map((p) => p.ll);

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
 * How far past the catalog's extent the to-confirm list reaches, in degrees: the ERs that could be an area's nearest. The
 * list covers the parcel screen's whole extent, mostly with CMS's own hospitals under other names (158 of 200 left, 10/23).
 */
const TO_CONFIRM_MARGIN_DEG = 0.25;
const nearCatalog = ([lat, lon]: LatLon) => {
  const [s, w, n, e] = CATALOG_BOX;
  const m = TO_CONFIRM_MARGIN_DEG;
  return lat > s - m && lat < n + m && lon > w - m && lon < e + m;
};

/**
 * The ERs in OpenStreetMap but not CMS, to confirm by hand (owner, #298 answers): the snapshot's OSM-only list near the
 * catalog, less those an addition already covers and those CMS has under another name nearby. Listed in the monthly
 * refresh PR, never timed.
 */
export function ersToConfirm(list: ErList, additions: readonly ErAddition[]): ErList["osmOnly"] {
  // CMS's hospitals it couldn't place: their names, without the town and state.
  const unplaced = list.unplaced.map((u) => words(u.split(",")[0] ?? u));
  return list.osmOnly.filter((o) => {
    if (!nearCatalog(o.ll)) return false;
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
