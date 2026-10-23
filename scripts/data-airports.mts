/**
 * Regenerates lib/areas/data/airports.json (step 13, docs/plans/step-13-area-catalog.md §3.4): the commercial
 * airports the area profiler times drives to. From the Bureau of Transportation Statistics' National Transportation
 * Atlas Database, Aviation Facilities (the FAA's airport records, a U.S. government work): every airport certificated
 * under 14 CFR Part 139 as Class I (scheduled large air carrier service) with scheduled carrier service, within
 * MARGIN_DEG of the catalog's extent.
 *
 *   pnpm data:airports
 *
 * One query, run by hand and by the monthly refresh (.github/workflows/areas-refresh.yml). The parcel screen's
 * Airport row doesn't read it: it times the user's own airports (Settings).
 */
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
export const OUT = join(ROOT, "lib", "areas", "data", "airports.json");
const UA =
  "parcelscreen-data/1 (airport snapshot for the area catalog; https://github.com/zgrether/parcelscreen)";
const LAYER =
  "https://services.arcgis.com/xOi1kZaI0eWDREZv/arcgis/rest/services/NTAD_Aviation_Facilities/FeatureServer/0";

/** The catalog's extent, [south, west, north, east] (lib/areas/extent.ts; a test holds the two equal). */
export const CATALOG_BOX = [34.9, -83.8, 38.6, -78.6] as const;
/** About 150 miles. */
const MARGIN_DEG = 2.2;

const [s, w, n, e] = CATALOG_BOX;
const where = [
  `LAT_DECIMAL > ${s - MARGIN_DEG}`,
  `LAT_DECIMAL < ${n + MARGIN_DEG}`,
  `LONG_DECIMAL > ${w - MARGIN_DEG}`,
  `LONG_DECIMAL < ${e + MARGIN_DEG}`,
  // Class I: scheduled large air carrier service; "S": the carrier service is scheduled.
  `FAR_139_TYPE_CODE LIKE 'I %'`,
  `FAR_139_CARRIER_SER_CODE = 'S'`,
].join(" AND ");
const url =
  `${LAYER}/query?where=${encodeURIComponent(where)}` +
  "&outFields=ARPT_ID,ARPT_NAME,CITY,STATE_CODE,LAT_DECIMAL,LONG_DECIMAL,EFF_DATE&returnGeometry=false&f=json";
const res = await fetch(url, { headers: { "User-Agent": UA } });
if (!res.ok) throw new Error(`NTAD answered ${res.status}`);
const body = (await res.json()) as {
  error?: unknown;
  exceededTransferLimit?: boolean;
  features?: { attributes: Record<string, string | number> }[];
};
if (body.error || !body.features) throw new Error(`NTAD: ${JSON.stringify(body.error ?? body)}`);
if (body.exceededTransferLimit) throw new Error("NTAD truncated the answer");

/** "ROANOKE/BLACKSBURG RGNL (WOODRUM FLD)" → "Roanoke/Blacksburg Rgnl (Woodrum Fld)". */
const title = (x: string) => x.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());

const airports = body.features
  .map(({ attributes: a }) => ({
    code: String(a.ARPT_ID),
    name: title(String(a.ARPT_NAME)),
    city: title(String(a.CITY)),
    state: String(a.STATE_CODE),
    ll: [+Number(a.LAT_DECIMAL).toFixed(5), +Number(a.LONG_DECIMAL).toFixed(5)] as [number, number],
  }))
  .sort((a, b) => a.code.localeCompare(b.code));
const effective = String(body.features[0]?.attributes.EFF_DATE ?? "").replaceAll("/", "-");

writeFileSync(
  OUT,
  JSON.stringify(
    {
      source: "BTS NTAD Aviation Facilities (FAA), Part 139 Class I with scheduled service",
      effective,
      checked: new Date().toLocaleDateString("en-CA"),
      airports,
    },
    null,
    1,
  ) + "\n",
);
console.log(`${OUT}: ${airports.length} airports, effective ${effective}`);
