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

let loaded: Promise<HospitalSnapshot | null> | null = null;

/**
 * The committed snapshot, loaded once per session (a separate chunk in the browser) and checked; null when
 * it can't be loaded or doesn't parse, so the step falls back rather than fails.
 */
export const loadHospitalSnapshot: HospitalSource = () =>
  (loaded ??= import("./data/hospitals.json")
    .then((m) => SnapshotSchema.parse((m as { default: unknown }).default))
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
