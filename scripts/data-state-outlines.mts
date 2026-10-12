/**
 * Regenerates lib/screen/data/state-outlines.json: Virginia's, North Carolina's and Tennessee's outlines (US Census
 * Bureau, TIGERweb States), simplified. The screen asks a state's parks service for trailheads only when the state
 * comes within the search distance of the parcel (follow-up 53, #122 review). A bounding box was too coarse: North
 * Carolina's reaches 33 km from Ferney Creek, its border 37 km, with the search at 36 km.
 *
 *   pnpm data:states
 *
 * Run by hand, never in CI: state lines don't move. The simplification (SIMPLIFY_DEG) can move a line by about that
 * much, so the screen widens its search by `near.stateOutlineMarginKm` (lib/screen/config.ts) to make up for it.
 */
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = join(ROOT, "lib", "screen", "data", "state-outlines.json");
const URL_STATES =
  "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/0/query";
const UA = "parcelscreen-data/1 (state outlines, run by hand; https://github.com/zgrether/parcelscreen)";
/** About 550 m north–south, 450 m east–west here. */
export const SIMPLIFY_DEG = 0.005;
const STATES = ["VA", "NC", "TN"] as const;

const q = new URLSearchParams({
  where: `STUSAB IN (${STATES.map((s) => `'${s}'`).join(",")})`,
  outFields: "STUSAB",
  outSR: "4326",
  maxAllowableOffset: String(SIMPLIFY_DEG),
  geometryPrecision: "4",
  f: "geojson",
});
const r = await fetch(`${URL_STATES}?${q}`, { headers: { "User-Agent": UA } });
if (!r.ok) throw new Error(`TIGERweb ${r.status}`);
const fc = (await r.json()) as {
  features: { properties: { STUSAB: string }; geometry: { type: string; coordinates: unknown } }[];
};
const byState = Object.fromEntries(fc.features.map((f) => [f.properties.STUSAB, f.geometry]));
for (const s of STATES) if (!byState[s]) throw new Error(`TIGERweb: no outline for ${s}`);

const out = {
  source: "US Census Bureau, TIGERweb State_County/MapServer/0 (States)",
  fetched: new Date().toISOString().slice(0, 10),
  simplifyDeg: SIMPLIFY_DEG,
  // In a fixed order, so a re-run that changes nothing writes the same file.
  states: Object.fromEntries(STATES.map((s) => [s, byState[s]])),
};
writeFileSync(OUT, JSON.stringify(out) + "\n");
console.log(`wrote ${OUT}: ${STATES.map((s) => `${s} ${byState[s]!.type}`).join(", ")}`);
