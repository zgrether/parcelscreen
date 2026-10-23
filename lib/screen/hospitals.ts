/**
 * The emergency departments the drive step times (the ER follow-up, owner 2026-10-23; phase-0.md §9.69): one list for
 * parcel screens and the area catalog.
 * - CMS Hospital General Information's hospitals with Emergency Services "Yes", geocoded (lib/screen/data/er.json,
 *   `pnpm data:er`, refreshed monthly; a change is a numbers change);
 * - with the hand-checked additions (lib/screen/data/er-additions.json): an ER CMS doesn't list yet, or one that
 *   closed.
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

/**
 * Hospitals the sources lag on, checked by hand (owner, #298 answers, 2026-10-23): a reopened ER CMS doesn't list yet,
 * or one that closed. Each entry carries its source and the date it was checked.
 */
export const ErAdditionsSchema = z.strictObject({
  about: z.string(),
  hospitals: z.array(
    z.strictObject({
      name: z.string(),
      ll: z.tuple([z.number(), z.number()]),
      /** Whether it has an emergency department now. */
      er: z.boolean(),
      source: z.string().url(),
      checked: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  ),
});
export type ErAdditions = z.infer<typeof ErAdditionsSchema>;
export type ErAddition = ErAdditions["hospitals"][number];

/** An addition stands for any hospital this close to it: the same place, under another name or position. */
export const ADDITION_MATCH_KM = 1;

/** An emergency department the drive step may time. */
export interface ErPlace {
  name: string;
  ll: LatLon;
}

const km = ([a, b]: LatLon, [c, d]: LatLon) => distance([b, a], [d, c], { units: "kilometers" });

/**
 * The ERs: CMS's, less any an addition within ADDITION_MATCH_KM says has none, plus the additions with an ER that CMS
 * has nothing near.
 */
export function erPlaces(list: ErList, additions: readonly ErAddition[]): ErPlace[] {
  const near = (a: LatLon, b: LatLon) => km(a, b) <= ADDITION_MATCH_KM;
  const closed = additions.filter((a) => !a.er);
  const cms = list.hospitals
    .filter((h) => !closed.some((a) => near(a.ll, h.ll)))
    .map((h) => ({ name: h.name, ll: h.ll }));
  const added = additions
    .filter((a) => a.er && !cms.some((h) => near(a.ll, h.ll)))
    .map((a) => ({ name: a.name, ll: a.ll }));
  return [...cms, ...added];
}

/** A hospital the drive step may route to; every one an ER since §9.69. Stored results before it may say otherwise. */
export interface HospitalCandidate {
  name: string;
  ll: LatLon;
  km: number;
  er?: boolean;
}

export type HospitalSource = () => Promise<readonly ErPlace[] | null>;

let lists: Promise<[ErList, ErAddition[]]> | null = null;

/**
 * CMS's list and the additions, loaded once per process (separate chunks in the browser) and checked. The additions
 * failing to load leave CMS's list as it is.
 */
export const loadErLists = (): Promise<[ErList, ErAddition[]]> =>
  (lists ??= Promise.all([
    import("./data/er.json").then((m) => ErListSchema.parse((m as { default: unknown }).default)),
    import("./data/er-additions.json")
      .then((m) => ErAdditionsSchema.parse((m as { default: unknown }).default).hospitals)
      .catch(() => [] as ErAddition[]),
  ]).catch((e: unknown) => {
    lists = null; // try again next run
    throw e;
  }));

/** The ERs, loaded once per session; null when the list can't be loaded or doesn't parse. */
export const loadHospitals: HospitalSource = () =>
  loadErLists().then(
    ([list, additions]) => erPlaces(list, additions),
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
