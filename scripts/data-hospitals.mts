/**
 * Regenerates lib/screen/data/hospitals.json: every OSM hospital in Virginia, North Carolina and Tennessee
 * (amenity=hospital or healthcare=hospital), with the tags the screen reads. Batch A A2c (owner, 2026-10-09);
 * regenerated quarterly (docs/plans/phase-0.md §9.21).
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

export const QUERY = `[out:json][timeout:300];
(area["ISO3166-2"="US-VA"]; area["ISO3166-2"="US-NC"]; area["ISO3166-2"="US-TN"];)->.s;
(nwr["amenity"="hospital"](area.s); nwr["healthcare"="hospital"](area.s););
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
  tags: { amenity?: string; healthcare?: string; emergency?: string };
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
        source: `OpenStreetMap contributors (ODbL), via ${new URL(url).host}: amenity=hospital or healthcare=hospital in VA, NC and TN`,
        hospitals,
      };
      writeFileSync(OUT, JSON.stringify(snapshot, null, 1) + "\n");
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
