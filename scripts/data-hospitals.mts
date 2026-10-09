/**
 * Regenerates lib/screen/data/hospitals.json: every OSM hospital (amenity=hospital or healthcare=hospital) in the
 * bounding box of Virginia, North Carolina and Tennessee widened by near.hospitalKm, so a parcel near a state
 * line sees the hospitals across it (owner, #82 review). With the tags the screen reads. Batch A A2c (owner,
 * 2026-10-09); regenerated quarterly (docs/plans/phase-0.md §9.21).
 *
 *   pnpm data:hospitals
 *
 * One Overpass query, run by hand, never in CI. The screen never calls Overpass for hospitals: it reads this
 * snapshot, so there's no runtime endpoint and an emergency department's status comes with it.
 */
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(import.meta.dirname, "..");
export const OUT = join(ROOT, "lib", "screen", "data", "hospitals.json");

const MIRRORS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const UA =
  "parcelscreen-data/1 (hospital snapshot, run by hand quarterly; https://github.com/zgrether/parcelscreen)";

/** near.hospitalKm (lib/screen/config.ts); a test holds the two equal. */
export const HOSPITAL_KM = 60;

/**
 * The three states' extents (US Census Bureau, TIGER state boundaries): VA 36.54–39.47 N, 83.68–75.24 W;
 * NC 33.84–36.59 N, 84.32–75.46 W; TN 34.98–36.68 N, 90.31–81.65 W. Their union, as [south, west, north, east].
 */
export const STATES_BOX = [33.84, -90.31, 39.47, -75.24] as const;

/**
 * The union widened by HOSPITAL_KM on every side: 1° of latitude is 111.2 km; a degree of longitude is taken at
 * the box's southern edge, where it's shortest, so the margin is at least HOSPITAL_KM everywhere.
 */
export function searchBox(km: number = HOSPITAL_KM): [number, number, number, number] {
  const [s, w, n, e] = STATES_BOX;
  const dLat = km / 111.2;
  const dLon = km / (111.32 * Math.cos((s * Math.PI) / 180));
  const r = (x: number) => +x.toFixed(3);
  return [r(s - dLat), r(w - dLon), r(n + dLat), r(e + dLon)];
}

export const QUERY = `[out:json][timeout:300][bbox:${searchBox().join(",")}];
(nwr["amenity"="hospital"]; nwr["healthcare"="hospital"];);
out center tags;`;

/** Two copies of one hospital are one when this close and same-named (a campus area and its node). */
const SAME_PLACE_M = 300;

interface Element {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export interface Hospital {
  /** "node/123", "way/456" or "relation/789". */
  id: string;
  name: string;
  lat: number;
  lon: number;
  tags: { amenity?: string; healthcare?: string; emergency?: string; "healthcare:speciality"?: string };
}

export interface HospitalSnapshot {
  generatedAt: string;
  source: string;
  hospitals: Hospital[];
}

const metres = (a: Hospital, b: Hospital): number => {
  const k = Math.PI / 180;
  const x = (b.lon - a.lon) * k * Math.cos(((a.lat + b.lat) / 2) * k);
  const y = (b.lat - a.lat) * k;
  return Math.hypot(x, y) * 6_371_000;
};
const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
/** Which copy of a duplicate to keep: an emergency=yes one, then an area (its tags are usually the fuller). */
const rank = (h: Hospital): number =>
  (h.tags.emergency === "yes" ? 0 : 2) + (h.id.startsWith("node/") ? 1 : 0);

/** Overpass elements → the snapshot's hospitals: one per OSM id, then one per same-named place. */
export function shapeHospitals(elements: readonly Element[]): Hospital[] {
  const byId = new Map<string, Hospital>();
  for (const e of elements) {
    const at = e.type === "node" ? { lat: e.lat, lon: e.lon } : e.center;
    if (!at || at.lat === undefined || at.lon === undefined) continue;
    const t = e.tags ?? {};
    const tags: Hospital["tags"] = {};
    if (t.amenity) tags.amenity = t.amenity;
    if (t.healthcare) tags.healthcare = t.healthcare;
    if (t.emergency) tags.emergency = t.emergency;
    // The speciality, for the screen's psychiatric / rehabilitation exclusion (owner, #82). The older
    // health_specialty:<x>=yes keys say the same thing; they're folded in.
    const spec = [
      ...(t["healthcare:speciality"] ?? "").split(";"),
      ...["psychiatry", "rehabilitation"].filter((x) => t[`health_specialty:${x}`] === "yes"),
    ]
      .map((x) => x.trim())
      .filter((x, i, a) => x && a.indexOf(x) === i);
    if (spec.length) tags["healthcare:speciality"] = spec.join(";");
    byId.set(`${e.type}/${e.id}`, {
      id: `${e.type}/${e.id}`,
      name: (t.name ?? "").trim(),
      lat: +at.lat.toFixed(6),
      lon: +at.lon.toFixed(6),
      tags,
    });
  }
  const kept: Hospital[] = [];
  for (const h of [...byId.values()].sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id))) {
    const dup =
      h.name && kept.some((k) => k.name && norm(k.name) === norm(h.name) && metres(k, h) <= SAME_PLACE_M);
    if (!dup) kept.push(h);
  }
  return kept.sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
}

/** One hospital per line: small, and a quarterly regeneration diffs line by line. */
export function serialize(snapshot: HospitalSnapshot): string {
  const { hospitals, ...head } = snapshot;
  const top = JSON.stringify(head).slice(0, -1);
  return `${top},"hospitals":[\n${hospitals.map((h) => JSON.stringify(h)).join(",\n")}\n]}\n`;
}

async function main(): Promise<void> {
  let lastErr: unknown;
  for (const url of MIRRORS) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "user-agent": UA, "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: QUERY }),
        signal: AbortSignal.timeout(330_000),
      });
      if (!r.ok) throw new Error(`${url} ${r.status}`);
      const j = (await r.json()) as { elements?: Element[] };
      const hospitals = shapeHospitals(j.elements ?? []);
      if (hospitals.length < 100)
        throw new Error(`${url}: only ${hospitals.length} hospitals; refusing to write`);
      const snapshot: HospitalSnapshot = {
        generatedAt: new Date().toISOString().slice(0, 10),
        source: `OpenStreetMap contributors (ODbL), via ${new URL(url).host}: amenity=hospital or healthcare=hospital in ${searchBox().join(",")} (VA, NC and TN widened by ${HOSPITAL_KM} km)`,
        hospitals,
      };
      writeFileSync(OUT, serialize(snapshot));
      const er = hospitals.filter((h) => h.tags.emergency === "yes").length;
      console.log(
        `${hospitals.length} hospitals (${j.elements?.length} elements; emergency=yes ${er}) → ${OUT}`,
      );
      return;
    } catch (e) {
      lastErr = e;
      console.error(String(e));
    }
  }
  throw lastErr;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
