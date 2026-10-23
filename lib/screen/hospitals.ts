/**
 * Hospitals near the parcel from a committed OSM snapshot (Batch A A2c, owner 2026-10-09): every
 * amenity=hospital or healthcare=hospital in VA, NC and TN with its emergency tag, regenerated quarterly by
 * `pnpm data:hospitals` (scripts/data-hospitals.mts; phase-0.md §9.21). No runtime endpoint: Photon never
 * returns the emergency tag, and the OSM API isn't for this.
 *
 * If the snapshot can't be loaded, the places step falls back to Photon by tag, chooses by distance and
 * says nothing about an emergency department (`er` unknown).
 */
import { distance } from "@turf/turf";
import { z } from "zod";
import { SCREEN_CONSTANTS } from "./config";
import type { LatLon } from "./util";

const K = SCREEN_CONSTANTS.near;

const SnapshotSchema = z.object({
  generatedAt: z.string(),
  source: z.string(),
  hospitals: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        lat: z.number(),
        lon: z.number(),
        tags: z.object({
          amenity: z.string().optional(),
          healthcare: z.string().optional(),
          emergency: z.string().optional(),
          "healthcare:speciality": z.string().optional(),
        }),
      }),
    )
    .min(1),
});
export type HospitalSnapshot = z.infer<typeof SnapshotSchema>;

/** A hospital the drive step may route to. `er`: emergency=yes in the snapshot; undefined when not known. */
export interface HospitalCandidate {
  name: string;
  ll: LatLon;
  km: number;
  er?: boolean;
}

export type HospitalSource = () => Promise<HospitalSnapshot | null>;

/**
 * Hospitals the sources lag on, checked by hand (owner, #298 answers, 2026-10-23): a reopened ER the OSM snapshot or
 * CMS doesn't list yet, or one that closed. Each entry carries its source and the date it was checked.
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

/**
 * The snapshot with the hand-checked additions: an addition within ADDITION_MATCH_KM of a snapshot hospital
 * replaces its name and emergency tag; one with none is added.
 */
export function withAdditions(
  snapshot: HospitalSnapshot,
  additions: readonly ErAddition[],
): HospitalSnapshot {
  const hospitals = [...snapshot.hospitals];
  additions.forEach((a, i) => {
    const near = (h: { lat: number; lon: number }) =>
      distance([a.ll[1], a.ll[0]], [h.lon, h.lat], { units: "kilometers" }) <= ADDITION_MATCH_KM;
    const emergency = a.er ? "yes" : "no";
    const at = hospitals.findIndex(near);
    if (at >= 0)
      hospitals[at] = { ...hospitals[at]!, name: a.name, tags: { ...hospitals[at]!.tags, emergency } };
    else
      hospitals.push({
        id: `addition/${i}`,
        name: a.name,
        lat: a.ll[0],
        lon: a.ll[1],
        tags: { amenity: "hospital", emergency },
      });
  });
  return { ...snapshot, hospitals };
}

let loaded: Promise<HospitalSnapshot | null> | null = null;

/**
 * The committed snapshot with the hand-checked additions, loaded once per session (separate chunks in the browser)
 * and checked; null when the snapshot can't be loaded or doesn't parse, so the step falls back rather than fails. The
 * additions failing to load leave the snapshot as it is.
 */
export const loadHospitalSnapshot: HospitalSource = () =>
  (loaded ??= Promise.all([
    import("./data/hospitals.json").then((m) => SnapshotSchema.parse((m as { default: unknown }).default)),
    import("./data/er-additions.json")
      .then((m) => ErAdditionsSchema.parse((m as { default: unknown }).default).hospitals)
      .catch(() => [] as ErAddition[]),
  ])
    .then(([snapshot, additions]) => withAdditions(snapshot, additions))
    .catch(() => {
      loaded = null; // try again next run
      return null;
    }));

/**
 * The snapshot's hospitals within near.hospitalKm, nearest first (straight line). Left out: the prototype's name
 * filter, and psychiatric or rehabilitation hospitals by their healthcare:speciality tag (owner, #82).
 */
export function hospitalCandidates(snapshot: HospitalSnapshot, centre: LatLon): HospitalCandidate[] {
  const [lat, lon] = centre;
  return snapshot.hospitals
    .filter((h) => !K.excludeHospital.test(h.name))
    .filter((h) => !K.excludeHospitalSpeciality.test(h.tags["healthcare:speciality"] ?? ""))
    .map((h) => ({
      name: h.name || "Hospital",
      ll: [h.lat, h.lon] as LatLon,
      km: distance([lon, lat], [h.lon, h.lat], { units: "kilometers" }),
      er: h.tags.emergency === "yes",
    }))
    .filter((h) => h.km <= K.hospitalKm)
    .sort((a, b) => a.km - b.km);
}
