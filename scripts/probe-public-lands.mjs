/**
 * Step 16's probe (docs/plans/step-16-public-lands.md §0): the services' own descriptions and a few records near Mud
 * Creek and Pond Mountain Game Land, written to `out/` for the plan. The cloud sessions can't reach these hosts; CI's
 * runners can (`.github/workflows/public-lands.yml`). Read-only, about 30 requests, one at a time.
 *
 *   node scripts/probe-public-lands.mjs out/
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = process.argv[2] ?? "out";
mkdirSync(OUT, { recursive: true });

const UA = "ParcelScreen/0.1 (personal land-screening tool; step 16 probe)";
// Mud Creek (Grayson, VA) and Mount Rogers NRA to its west; Pond Mountain Game Land (Ashe, NC) to its south-west.
const BOX = { west: -81.75, south: 36.5, east: -81.4, north: 36.7 };
const ENVELOPE = `${BOX.west},${BOX.south},${BOX.east},${BOX.north}`;

const PADUS_ORG = "https://services.arcgis.com/v01gqwM5QqNysAAi/ArcGIS/rest/services";
const PADUS_TILES = "https://tiles.arcgis.com/tiles/v01gqwM5QqNysAAi/arcgis/rest/services";
const MVUM = "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_01/MapServer";
const AGOL_SEARCH = "https://www.arcgis.com/sharing/rest/search";

const summary = [];

async function get(name, url, { json = true, keep = 200_000 } = {}) {
  const started = Date.now();
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(25_000) });
    const text = await r.text();
    const ms = Date.now() - started;
    const headers = Object.fromEntries(
      ["content-type", "cache-control", "expires", "last-modified", "etag", "access-control-allow-origin"]
        .map((h) => [h, r.headers.get(h)])
        .filter(([, v]) => v !== null),
    );
    summary.push({ name, url, status: r.status, ms, bytes: text.length, headers });
    writeFileSync(join(OUT, `${name}.${json ? "json" : "txt"}`), text.slice(0, keep));
    return json ? JSON.parse(text) : text;
  } catch (e) {
    summary.push({ name, url, error: String(e), ms: Date.now() - started });
    return null;
  } finally {
    writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
  }
}

const q = (params) => new URLSearchParams({ f: "json", ...params }).toString();
const search = (name, query) =>
  get(name, `${AGOL_SEARCH}?${q({ q: query, num: "50", sortField: "numviews", sortOrder: "desc" })}`);

// 1. PAD-US: the org's services and tile services, the engine's layer, and ArcGIS Online's PAD-US items.
const services = await get("padus-services", `${PADUS_ORG}?f=json`);
await get("padus-tiles", `${PADUS_TILES}?f=json`);
await search(
  "agol-padus",
  'PAD-US (type:"Vector Tile Service" OR type:"Feature Service" OR type:"Map Service")',
);
const names = (services?.services ?? []).map((s) => s.name);
const padusNames = names.filter((n) => /PAD|Manager|Access|Easement|Fee|Designation|Proclamation/i.test(n));
for (const n of padusNames.slice(0, 12)) {
  const meta = await get(`padus-${n}`, `${PADUS_ORG}/${n}/FeatureServer?f=json`);
  for (const l of (meta?.layers ?? []).slice(0, 3)) {
    await get(`padus-${n}-${l.id}`, `${PADUS_ORG}/${n}/FeatureServer/${l.id}?f=json`);
    await get(
      `padus-${n}-${l.id}-sample`,
      `${PADUS_ORG}/${n}/FeatureServer/${l.id}/query?${q({
        geometry: ENVELOPE,
        geometryType: "esriGeometryEnvelope",
        inSR: "4326",
        spatialRel: "esriSpatialRelIntersects",
        outFields: "*",
        returnGeometry: "false",
        resultRecordCount: "40",
      })}`,
    );
  }
}
// The same box as PBF with geometry, to weigh a tile's size and time.
await get(
  "padus-fee-box-geojson",
  `${PADUS_ORG}/Fee_Managers_PADUS/FeatureServer/0/query?${q({
    f: "geojson",
    geometry: ENVELOPE,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "Unit_Nm,Mang_Name,Mang_Type,Pub_Access,Des_Tp,Loc_Mang",
    outSR: "4326",
    maxAllowableOffset: "0.0002",
    geometryPrecision: "5",
  })}`,
  { keep: 50_000 },
);

// 2. MVUM: the service, its layers in full (fields, domains, drawing), and records in the box.
const mvum = await get("mvum-service", `${MVUM}?f=json`);
await get("mvum-layers", `${MVUM}/layers?f=json`, { keep: 2_000_000 });
for (const l of mvum?.layers ?? []) {
  await get(
    `mvum-${l.id}-sample`,
    `${MVUM}/${l.id}/query?${q({
      geometry: ENVELOPE,
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "*",
      returnGeometry: "false",
      resultRecordCount: "40",
    })}`,
  );
}
await search(
  "agol-mvum",
  '"Motor Vehicle Use Map" (type:"Feature Service" OR type:"Vector Tile Service" OR type:"Map Service")',
);
await search("agol-dispersed", '"dispersed camping" MVUM');
await search("agol-spearhead", "Spearhead Trails");

writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
