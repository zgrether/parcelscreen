/**
 * Regenerates lib/geo/data/tn-own-records.json: the outlines of the nine Tennessee counties that keep their own
 * assessment systems, so the Comptroller's public-use parcel layer has no lines there (step 2 plan §6.4). The map
 * says "No Tennessee parcel lines here; this county keeps its own records" over them (US Census Bureau, TIGERweb
 * Counties), simplified: the hint only needs the county a view is in.
 *
 *   pnpm data:tn-counties
 *
 * Run by hand, never in CI. The list is the layer's own (its description, checked 2026-10-17): re-run if it changes.
 */
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = join(ROOT, "lib", "geo", "data", "tn-own-records.json");
const URL_COUNTIES =
  "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1/query";
const UA = "parcelscreen-data/1 (TN county outlines, run by hand; https://github.com/zgrether/parcelscreen)";
/** About 110 m north–south. */
const SIMPLIFY_DEG = 0.001;
export const COUNTIES = [
  "Chester",
  "Davidson",
  "Hamilton",
  "Hickman",
  "Knox",
  "Montgomery",
  "Rutherford",
  "Shelby",
  "Williamson",
] as const;

const q = new URLSearchParams({
  where: `STATE='47' AND BASENAME IN (${COUNTIES.map((c) => `'${c}'`).join(",")})`,
  outFields: "BASENAME",
  outSR: "4326",
  maxAllowableOffset: String(SIMPLIFY_DEG),
  geometryPrecision: "4",
  f: "geojson",
});
const r = await fetch(`${URL_COUNTIES}?${q}`, { headers: { "User-Agent": UA } });
if (!r.ok) throw new Error(`TIGERweb ${r.status}`);
const fc = (await r.json()) as {
  features: { properties: { BASENAME: string }; geometry: { type: string; coordinates: unknown } }[];
};
const byName = Object.fromEntries(fc.features.map((f) => [f.properties.BASENAME, f.geometry]));
for (const c of COUNTIES) if (!byName[c]) throw new Error(`TIGERweb: no outline for ${c} County`);

const out = {
  source: "US Census Bureau, TIGERweb State_County/MapServer/1 (Counties)",
  fetched: new Date().toISOString().slice(0, 10),
  simplifyDeg: SIMPLIFY_DEG,
  // In a fixed order, so a re-run that changes nothing writes the same file.
  counties: Object.fromEntries(COUNTIES.map((c) => [c, byName[c]])),
};
writeFileSync(OUT, JSON.stringify(out) + "\n");
console.log(`wrote ${OUT}: ${COUNTIES.map((c) => `${c} ${byName[c]!.type}`).join(", ")}`);
