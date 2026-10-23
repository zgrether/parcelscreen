/**
 * The emergency departments the drive step times (the ER follow-up, owner 2026-10-23; phase-0.md §9.69): one list for
 * parcel screens and the area catalog.
 * - CMS Hospital General Information's hospitals with Emergency Services "Yes", geocoded (lib/screen/data/er.json,
 *   `pnpm data:er`, refreshed monthly; a change is a numbers change);
 * - with the hand-checked overrides (lib/screen/data/er-overrides.json): an ER CMS doesn't list yet ("open"), or a CMS
 *   hospital that no longer has one ("closed").
 * OpenStreetMap's hospitals (lib/screen/data/hospitals.json) are never timed: they help the script place CMS's
 * addresses, and fill the monthly refresh PR's "to confirm" list.
 *
 * If the list can't be loaded, there's no hospital to time and the Hospital row is left out.
 */
import { distance } from "@turf/turf";
import { z } from "zod";
import { SCREEN_CONSTANTS } from "./config";
import { LatLonSchema } from "./types";
import type { LatLon } from "./util";

const K = SCREEN_CONSTANTS.near;

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

/** A date an entry was checked, YYYY-MM-DD. */
const CheckedSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Emergency departments the sources lag on, checked by hand (owner, #298 and #300), each with its source and the date
 * it was checked:
 * - "open": an ER CMS doesn't list yet (Stuart Community, reopened January 2026), timed unless CMS has a hospital
 *   within ADDITION_MATCH_KM of it;
 * - "closed": a CMS hospital that no longer has one, named by its CMS facility ID, or else by its name within
 *   ADDITION_MATCH_KM of its coordinates. It's never timed; once CMS drops it too, the monthly refresh PR says the entry
 *   can be removed (closedCmsDropped).
 */
export const ErOverridesSchema = z.strictObject({
  about: z.string(),
  hospitals: z.array(
    z.discriminatedUnion("status", [
      z.strictObject({
        status: z.literal("open"),
        name: z.string(),
        ll: LatLonSchema,
        source: z.string().url(),
        checked: CheckedSchema,
      }),
      z.strictObject({
        status: z.literal("closed"),
        /** CMS's facility ID (the CCN), when known: the surest match. */
        id: z.string().optional(),
        /** CMS's name for it (as er.json writes it). */
        name: z.string(),
        ll: LatLonSchema,
        source: z.string().url(),
        checked: CheckedSchema,
      }),
    ]),
  ),
});
export type ErOverrides = z.infer<typeof ErOverridesSchema>;
export type ErOverride = ErOverrides["hospitals"][number];
type ClosedOverride = Extract<ErOverride, { status: "closed" }>;

/** An override stands for any hospital this close to it: the same place, under another name or position. */
export const ADDITION_MATCH_KM = 1;

/** An emergency department the drive step may time. */
export interface ErPlace {
  name: string;
  ll: LatLon;
}

const km = ([a, b]: LatLon, [c, d]: LatLon) => distance([b, a], [d, c], { units: "kilometers" });
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Whether a closed override names this CMS hospital: by its ID, or by its name near its coordinates. */
const closes = (c: ClosedOverride, h: ErList["hospitals"][number]): boolean =>
  c.id !== undefined ? c.id === h.id : sameName(c.name, h.name) && km(c.ll, h.ll) <= ADDITION_MATCH_KM;

/** The ERs: CMS's, less those a closed override names, plus the open overrides that CMS has nothing near. */
export function erPlaces(list: ErList, overrides: readonly ErOverride[]): ErPlace[] {
  const closed = overrides.filter((o): o is ClosedOverride => o.status === "closed");
  const cms = list.hospitals
    .filter((h) => !closed.some((c) => closes(c, h)))
    .map((h) => ({ name: h.name, ll: h.ll }));
  const added = overrides
    .filter((o) => o.status === "open" && !list.hospitals.some((h) => km(o.ll, h.ll) <= ADDITION_MATCH_KM))
    .map((o) => ({ name: o.name, ll: o.ll }));
  return [...cms, ...added];
}

/** The closed overrides CMS no longer lists the hospital of: they can be removed (the monthly refresh PR says so). */
export const closedCmsDropped = (list: ErList, overrides: readonly ErOverride[]): ClosedOverride[] =>
  overrides.filter(
    (o): o is ClosedOverride => o.status === "closed" && !list.hospitals.some((h) => closes(o, h)),
  );

/** A hospital the drive step may route to; every one an ER since §9.69. Stored results before it may say otherwise. */
export interface HospitalCandidate {
  name: string;
  ll: LatLon;
  km: number;
  er?: boolean;
}

export type HospitalSource = () => Promise<readonly ErPlace[] | null>;

let lists: Promise<[ErList, ErOverride[]]> | null = null;

/**
 * CMS's list and the overrides, loaded once per process (separate chunks in the browser) and checked. The overrides
 * failing to load leave CMS's list as it is.
 */
export const loadErLists = (): Promise<[ErList, ErOverride[]]> =>
  (lists ??= Promise.all([
    import("./data/er.json").then((m) => ErListSchema.parse((m as { default: unknown }).default)),
    import("./data/er-overrides.json")
      .then((m) => ErOverridesSchema.parse((m as { default: unknown }).default).hospitals)
      .catch(() => [] as ErOverride[]),
  ]).catch((e: unknown) => {
    lists = null; // try again next run
    throw e;
  }));

/** The ERs, loaded once per session; null when the list can't be loaded or doesn't parse. */
export const loadHospitals: HospitalSource = () =>
  loadErLists().then(
    ([list, overrides]) => erPlaces(list, overrides),
    () => null,
  );

/**
 * The ERs within near.hospitalKm, nearest first (straight line). The prototype's name filter still applies; CMS's
 * list already leaves out psychiatric, children's and veterans' hospitals.
 */
export function hospitalCandidates(places: readonly ErPlace[], centre: LatLon): HospitalCandidate[] {
  return places
    .filter((h) => !K.excludeHospital.test(h.name))
    .map((h) => ({ name: h.name, ll: h.ll, km: km(centre, h.ll), er: true }))
    .filter((h) => h.km <= K.hospitalKm)
    .sort((a, b) => a.km - b.km);
}
