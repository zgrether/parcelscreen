/**
 * Step 16's probe (docs/plans/step-16-public-lands.md §0): the services' own descriptions, their items' terms, CORS,
 * and what one map tile's query weighs, near Mud Creek and Pond Mountain Game Land, written to `out/` for the plan.
 * The cloud sessions can't reach these hosts; CI's runners can (`.github/workflows/public-lands.yml`). Read-only, about
 * 40 requests, one at a time.
 *
 *   node scripts/probe-public-lands.mjs out/
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = process.argv[2] ?? "out";
mkdirSync(OUT, { recursive: true });

const UA = "ParcelScreen/0.1 (personal land-screening tool; step 16 probe)";
const ORIGIN = "https://parcelscreen.vercel.app";

const PADUS_ORG = "https://services.arcgis.com/v01gqwM5QqNysAAi/ArcGIS/rest/services";
const PADUS = `${PADUS_ORG}/Manager_Name_PADUS/FeatureServer/0`;
const EDW = "https://apps.fs.usda.gov/arcx/rest/services/EDW";
const MVUM = `${EDW}/EDW_MVUM_01/MapServer`;
const ITEM = "https://www.arcgis.com/sharing/rest/content/items";

const summary = [];

async function get(name, url, { keep = 200_000, save = true } = {}) {
  const started = Date.now();
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, Origin: ORIGIN },
      signal: AbortSignal.timeout(25_000),
    });
    const text = await r.text();
    const ms = Date.now() - started;
    const headers = Object.fromEntries(
      ["content-type", "cache-control", "access-control-allow-origin", "content-encoding"]
        .map((h) => [h, r.headers.get(h)])
        .filter(([, v]) => v !== null),
    );
    let features = null;
    try {
      features = JSON.parse(text).features?.length ?? null;
    } catch {
      /* not JSON */
    }
    summary.push({ name, status: r.status, ms, bytes: text.length, features, headers, url });
    if (save) writeFileSync(join(OUT, `${name}.json`), text.slice(0, keep));
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  } catch (e) {
    summary.push({ name, url, error: String(e), ms: Date.now() - started });
    return null;
  } finally {
    writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
  }
}

const q = (params) => new URLSearchParams({ f: "json", ...params }).toString();

/** A Web Mercator tile's box in degrees, and one screen pixel at its zoom in degrees of longitude. */
function tile(z, lon, lat) {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2) * n);
  const lonOf = (x) => (x / n) * 360 - 180;
  const latOf = (y) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return {
    z,
    x,
    y,
    envelope: `${lonOf(x)},${latOf(y + 1)},${lonOf(x + 1)},${latOf(y)}`,
    px: 360 / n / 256,
  };
}

// 1. The items' terms (licenceInfo, accessInformation), from each service's item.
for (const [name, url] of [
  ["padus-manager-name", `${PADUS_ORG}/Manager_Name_PADUS/FeatureServer?f=json`],
  ["padus-fee", `${PADUS_ORG}/Fee_Managers_PADUS/FeatureServer?f=json`],
  ["mvum", `${MVUM}?f=json`],
]) {
  const svc = await get(`svc-${name}`, url, { save: false });
  const id = svc?.serviceItemId;
  if (id) await get(`item-${name}`, `${ITEM}/${id}?f=json`);
}
// MVUM's AGOL items (USFSEnterpriseContent), found by the first probe.
await get(
  "item-search-mvum",
  `https://www.arcgis.com/sharing/rest/search?${q({ q: 'owner:USFSEnterpriseContent "Motor Vehicle Use Map"', num: "20" })}`,
);
// PAD-US's items in the USGS org: is there a vector tile service?
await get(
  "item-search-padus-vts",
  `https://www.arcgis.com/sharing/rest/search?${q({ q: 'PAD-US type:"Vector Tile Service"', num: "50" })}`,
);

// 2. The Forest Service's EDW services: anything with dispersed camping or MVUM in it.
const edw = await get("edw-services", `${EDW}?f=json`);
for (const s of (edw?.services ?? []).filter((s) => /MVUM|Camp|Dispers|Corridor/i.test(s.name)))
  await get(
    `edw-${s.name.replace(/\W/g, "_")}`,
    `https://apps.fs.usda.gov/arcx/rest/services/${s.name}/${s.type}?f=json`,
  );

// 3. One tile's query at each zoom the layer would ask: bytes, time, features.
const WHERE = "FeatClass IN ('Fee','Easement')";
const PADUS_FIELDS =
  "OBJECTID,FeatClass,Category,Mang_Type,Mang_Name,Loc_Mang,Des_Tp,Loc_Ds,Unit_Nm,Pub_Access,Src_Date,GIS_Acres,EsmtHldr";
const MUD = [-81.56, 36.58];
const POND = [-81.69, 36.56];
for (const [place, [lon, lat]] of [
  ["mud", MUD],
  ["pond", POND],
]) {
  for (const z of [9, 11, 13]) {
    const t = tile(z, lon, lat);
    await get(
      `tile-padus-${place}-z${z}`,
      `${PADUS}/query?${q({
        f: "geojson",
        where: WHERE,
        geometry: t.envelope,
        geometryType: "esriGeometryEnvelope",
        inSR: "4326",
        spatialRel: "esriSpatialRelIntersects",
        outFields: PADUS_FIELDS,
        outSR: "4326",
        maxAllowableOffset: String(t.px),
        geometryPrecision: z >= 13 ? "6" : z >= 11 ? "5" : "4",
      })}`,
      { keep: 20_000 },
    );
  }
  for (const z of [11, 13]) {
    const t = tile(z, lon, lat);
    for (const layer of [1, 2])
      await get(
        `tile-mvum${layer}-${place}-z${z}`,
        `${MVUM}/${layer}/query?${q({
          f: "geojson",
          where: "1=1",
          geometry: t.envelope,
          geometryType: "esriGeometryEnvelope",
          inSR: "4326",
          spatialRel: "esriSpatialRelIntersects",
          outFields:
            "objectid,id,name,symbol,mvum_symbol_name,seasonal,passengervehicle_datesopen,highclearancevehicle_datesopen,atv_datesopen,motorcycle_datesopen,other_ohv_lt50_datesopen,fourwd_gt50_datesopen,forestname,districtname",
          outSR: "4326",
          maxAllowableOffset: String(t.px),
          geometryPrecision: "5",
        })}`,
        { keep: 20_000 },
      );
  }
}

console.log(JSON.stringify(summary, null, 2));
