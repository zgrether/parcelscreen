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

// Round 4: does the feature service clip a tile's geometry when asked as the ArcGIS map viewers ask (quantization in
// view mode, resultType tile)? The same z12 and z13 tiles over Pond Mountain, each way.
const POND = [-81.69, 36.56];
const MUD = [-81.62, 36.6];
const FIELDS =
  "OBJECTID,FeatClass,Category,Mang_Type,Mang_Name,Loc_Mang,Des_Tp,Loc_Ds,Unit_Nm,Pub_Access,Src_Date,GIS_Acres,EsmtHldr";
for (const [place, [lon, lat]] of [
  ["pond", POND],
  ["mud", MUD],
])
  for (const z of [10, 12, 13]) {
    const t = tile(z, lon, lat);
    const [w, s, e, n] = t.envelope.split(",").map(Number);
    const mercX = (lon) => (lon * 20037508.34) / 180;
    const mercY = (lat) => (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) * 20037508.34) / Math.PI;
    const ext = {
      xmin: mercX(w),
      ymin: mercY(s),
      xmax: mercX(e),
      ymax: mercY(n),
      spatialReference: { wkid: 102100 },
    };
    const res = (ext.xmax - ext.xmin) / 512;
    const base = {
      where: "FeatClass IN ('Fee','Easement')",
      geometry: JSON.stringify(ext),
      geometryType: "esriGeometryEnvelope",
      inSR: "102100",
      spatialRel: "esriSpatialRelIntersects",
      outFields: FIELDS,
      outSR: "102100",
      resultType: "tile",
      quantizationParameters: JSON.stringify({
        mode: "view",
        originPosition: "upperLeft",
        tolerance: res,
        extent: ext,
      }),
    };
    for (const f of ["geojson", "json"])
      await get(`clip-${place}-z${z}-${f}`, `${PADUS}/query?${q({ ...base, f })}`, { keep: 30_000 });
    await get(
      `noclip-${place}-z${z}-geojson`,
      `${PADUS}/query?${q({ ...base, f: "geojson", resultType: "standard", quantizationParameters: undefined, maxAllowableOffset: String(res) })}`.replace(
        /&quantizationParameters=undefined/,
        "",
      ),
      { keep: 30_000 },
    );
  }

console.log(JSON.stringify(summary, null, 2));
