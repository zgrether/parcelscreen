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

// Round 3: USGS's PAD-US vector tile services (found by round 2's search): their descriptions, styles and a few tiles,
// saved raw for decoding where the plan is written.
const VTS = "https://tiles.arcgis.com/tiles/v01gqwM5QqNysAAi/arcgis/rest/services";
const MUD = [-81.56, 36.58];
const POND = [-81.69, 36.56];
for (const svc of ["PADUS_Management_Areas_Manager_Type", "PADUS_Management_Areas_Designation_Type"]) {
  const base = `${VTS}/${svc}/VectorTileServer`;
  const meta = await get(`vts-${svc}`, `${base}?f=json`);
  await get(`vts-${svc}-style`, `${base}/resources/styles/root.json?f=json`);
  if (meta?.serviceItemId)
    await get(
      `vts-${svc}-item`,
      `https://www.arcgis.com/sharing/rest/content/items/${meta.serviceItemId}?f=json`,
    );
  const template = meta?.tiles?.[0] ?? "tile/{z}/{y}/{x}.pbf";
  for (const [place, [lon, lat]] of [
    ["mud", MUD],
    ["pond", POND],
  ])
    for (const z of [9, 12, 14]) {
      const t = tile(z, lon, lat);
      const url = `${base}/${template.replace("{z}", z).replace("{y}", t.y).replace("{x}", t.x)}`;
      const started = Date.now();
      try {
        const r = await fetch(url, {
          headers: { "User-Agent": UA, Origin: ORIGIN },
          signal: AbortSignal.timeout(25_000),
        });
        const buf = Buffer.from(await r.arrayBuffer());
        writeFileSync(join(OUT, `vts-${svc}-${place}-z${z}.pbf`), buf);
        summary.push({
          name: `vts-${svc}-${place}-z${z}`,
          status: r.status,
          ms: Date.now() - started,
          bytes: buf.length,
          headers: Object.fromEntries(
            ["content-type", "cache-control", "access-control-allow-origin", "content-encoding"]
              .map((h) => [h, r.headers.get(h)])
              .filter(([, v]) => v !== null),
          ),
          url,
        });
      } catch (e) {
        summary.push({ name: `vts-${svc}-${place}-z${z}`, url, error: String(e) });
      }
      writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
    }
}
// The tap's own query: one point, attributes only.
for (const [place, [lon, lat]] of [
  ["mud", MUD],
  ["pond", POND],
])
  await get(
    `tap-padus-${place}`,
    `${PADUS}/query?${q({
      geometry: `${lon},${lat}`,
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      where: "FeatClass IN ('Fee','Easement')",
      outFields:
        "OBJECTID,FeatClass,Category,Mang_Type,Mang_Name,Loc_Mang,Des_Tp,Loc_Ds,Unit_Nm,Pub_Access,Src_Date,GIS_Acres,EsmtHldr",
      returnGeometry: "false",
    })}`,
  );
console.log(JSON.stringify(summary, null, 2));
