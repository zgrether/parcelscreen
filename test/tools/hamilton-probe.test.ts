/**
 * Issue #432: a tap on Hamilton County's live parcel service opens no parcel (since about 2026-10-30). What the service
 * answers now, on CI's runners (hamilton.yml; this repo's cloud sessions can't reach the county host):
 *   1. the app's layer's metadata (since the fix, the county's new Parcels layer), its directory, and nearby hosts;
 *   2. the app's own query at Three Gorges Farms (lib/geo/parcels.ts pickParcelAt), sent with the production origin:
 *      status, CORS header, any token or rate-limit answer, error, feature count;
 *   3. the fallback: whether the Comptroller's statewide layer has Hamilton's parcels now.
 *
 *   pnpm exec vitest run test/tools/hamilton-probe.test.ts --mode hamilton-probe
 *
 * Read-only; nothing is written to the repo. No owner or address fields are printed.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_ENDPOINTS } from "../../lib/screen/config";

const live = () =>
  (globalThis as unknown as Record<symbol, typeof fetch>)[Symbol.for("parcelscreen.liveFetch")]!;

const UA = "parcelscreen-data/1 (Hamilton County parcels probe; https://github.com/zgrether/parcelscreen)";
const ORIGIN = "https://parcelscreen.vercel.app";

const out: string[] = ["# Hamilton County parcel service (probe, #432)", ""];
const say = (...l: string[]) => {
  out.push(...l);
  console.log(l.join("\n"));
};

interface Got {
  status: number;
  headers: Record<string, string>;
  text: string;
  ms: number;
}
async function get(url: string): Promise<Got> {
  const t = Date.now();
  try {
    const r = await live()(url, {
      headers: { "User-Agent": UA, Origin: ORIGIN },
      signal: AbortSignal.timeout(30_000),
    });
    const headers: Record<string, string> = {};
    for (const k of [
      "access-control-allow-origin",
      "content-type",
      "retry-after",
      "www-authenticate",
      "server",
      "location",
    ]) {
      const v = r.headers.get(k);
      if (v) headers[k] = v;
    }
    return { status: r.status, headers, text: await r.text(), ms: Date.now() - t };
  } catch (e) {
    return { status: 0, headers: {}, text: String((e as Error).cause ?? e), ms: Date.now() - t };
  }
}
const json = (t: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(t) as Record<string, unknown>;
  } catch {
    return null;
  }
};
const clip = (s: unknown, n = 300) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .slice(0, n);
const line = (label: string, g: Got) =>
  `- **${label}**: HTTP ${g.status} in ${g.ms} ms; ${JSON.stringify(g.headers)}; ${clip(g.text, 240)}`;

/** The app's Hamilton service, from its config (gis.hamiltontn.gov's Parcels since #432; mapsdev's Live_Parcels before). */
const HAMILTON_LAYER = DEFAULT_ENDPOINTS.parcels.find((u) => u.includes("hamiltontn.gov"))!;
const STATE_LAYER = DEFAULT_ENDPOINTS.parcels.find((u) => u.includes("Tennessee_Property_Boundaries"))!;
/** Inside Three Gorges Farms tract 1 (screenshots/tn-counties.spec.ts). */
const PT = { lat: 35.29479, lon: -85.20988 };
/** The app's query (lib/geo/parcels.ts pickParcelAt, lib/geo/parcelFields.ts) without the owner and address fields. */
const appQuery = (layer: string, where: string, f = "geojson") =>
  `${layer}/query?${new URLSearchParams({
    geometry: `${PT.lon},${PT.lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    where,
    outFields: "OBJECTID,GISLINK,MAP,GROUP_,PARCEL,PARCEL_TYPE",
    returnGeometry: "true",
    outSR: "4326",
    f,
  })}`;

describe.runIf(import.meta.env.MODE === "hamilton-probe")("Hamilton County's parcel service (#432)", () => {
  it("says what it answers now", async () => {
    say(`The app's layer: ${HAMILTON_LAYER}`, "");

    // 1. Metadata and directories.
    say("## 1. The service", "");
    const meta = await get(`${HAMILTON_LAYER}?f=json`);
    say(line("layer ?f=json", meta));
    const m = json(meta.text);
    if (m)
      say(
        `- name ${String(m.name)}; maxRecordCount ${String(m.maxRecordCount)}; currentVersion ${String(m.currentVersion)}; error ${clip(JSON.stringify(m.error))}`,
        `- fields: ${clip(((m.fields as { name: string }[] | undefined) ?? []).map((f) => f.name).join(", "), 1200)}`,
      );
    const service = HAMILTON_LAYER.replace(/\/\d+$/, "");
    const svc = await get(`${service}?f=json`);
    say(line("MapServer ?f=json", svc));
    const svcJ = json(svc.text);
    if (svcJ) say(`- layers: ${clip(JSON.stringify(svcJ.layers), 600)}`);
    const root = HAMILTON_LAYER.replace(/\/rest\/services\/.*$/, "/rest/services");
    const dir = await get(`${root}?f=json`);
    say(line("services directory", dir));
    const dirJ = json(dir.text);
    if (dirJ)
      say(`- folders ${JSON.stringify(dirJ.folders)}; services ${clip(JSON.stringify(dirJ.services), 1500)}`);
    // The county's other hosts: is Live_Parcels served from a production host now?
    for (const host of [
      "https://maps.hamiltontn.gov",
      "https://mapsprod.hamiltontn.gov",
      "https://gis.hamiltontn.gov",
      "https://mapsdev.hamiltontn.gov",
    ])
      for (const path of ["/hcwa03/rest/services?f=json", "/arcgis/rest/services?f=json"]) {
        const g = await get(`${host}${path}`);
        say(line(`${host}${path}`, { ...g, text: g.text.slice(0, 160) }));
      }
    say("");

    // 2. The app's query, as the browser sends it.
    say("## 2. The app's query at Three Gorges Farms", "");
    for (const [label, url] of [
      ["geojson, PARCEL_TYPE=1 (the app's)", appQuery(HAMILTON_LAYER, "PARCEL_TYPE=1")],
      ["geojson, 1=1", appQuery(HAMILTON_LAYER, "1=1")],
      ["json, PARCEL_TYPE=1", appQuery(HAMILTON_LAYER, "PARCEL_TYPE=1", "json")],
    ] as const) {
      const g = await get(url);
      const j = json(g.text);
      const n = (j?.features as unknown[] | undefined)?.length;
      say(
        line(label, { ...g, text: g.text.slice(0, 200) }),
        `  - features: ${n ?? "none"}; error ${clip(JSON.stringify(j?.error))}`,
      );
    }
    say("");

    // 3. The fallback.
    say("## 3. The Comptroller's statewide layer", "");
    const count = await get(
      `${STATE_LAYER}/query?${new URLSearchParams({ where: "COUNTY_NAME='Hamilton'", returnCountOnly: "true", f: "json" })}`,
    );
    say(line("COUNTY_NAME='Hamilton' count", count));
    const counties = await get(
      `${STATE_LAYER}/query?${new URLSearchParams({ where: "COUNTY_NAME LIKE 'Ham%'", outFields: "COUNTY_NAME", returnDistinctValues: "true", returnGeometry: "false", f: "json" })}`,
    );
    say(line("COUNTY_NAME LIKE 'Ham%'", counties));
    const atPt = await get(
      appQuery(STATE_LAYER, "1=1").replace("MAP%2CGROUP_%2CPARCEL%2CPARCEL_TYPE", "COUNTY_NAME"),
    );
    const atJ = json(atPt.text);
    say(
      line("at the Three Gorges point", { ...atPt, text: atPt.text.slice(0, 200) }),
      `  - features: ${(atJ?.features as unknown[] | undefined)?.length ?? "none"}`,
    );
    say("");

    // 4. Round 2: the county's ArcGIS Enterprise at gis.hamiltontn.gov/server (a web search found a Soddy-Daisy parcels
    //    layer there): every service whose name has "arcel" in it, its layers, and the app's query at the point.
    say("## 4. gis.hamiltontn.gov/server", "");
    const ENT = "https://gis.hamiltontn.gov/server/rest/services";
    const top = await get(`${ENT}?f=json`);
    say(line("directory", { ...top, text: top.text.slice(0, 120) }));
    const topJ = json(top.text);
    const services: { name: string; type: string }[] = [
      ...((topJ?.services as { name: string; type: string }[] | undefined) ?? []),
    ];
    for (const folder of (topJ?.folders as string[] | undefined) ?? []) {
      const fj = json((await get(`${ENT}/${folder}?f=json`)).text);
      services.push(...((fj?.services as { name: string; type: string }[] | undefined) ?? []));
    }
    say(
      `- ${services.length} services; parcel ones: ${
        services
          .filter((x) => /arcel|ax/i.test(x.name))
          .map((x) => `${x.name} (${x.type})`)
          .join(", ") || "none"
      }`,
    );
    for (const x of services.filter((v) => /arcel/i.test(v.name)).slice(0, 8)) {
      const base = `${ENT}/${x.name}/${x.type}`;
      const sj = json((await get(`${base}?f=json`)).text);
      const layers = ((sj?.layers as { id: number; name: string }[] | undefined) ?? []).slice(0, 6);
      say(`- **${x.name}** (${x.type}): layers ${layers.map((l) => `${l.id} ${l.name}`).join("; ")}`);
      for (const l of layers) {
        const lj = json((await get(`${base}/${l.id}?f=json`)).text);
        const fields = ((lj?.fields as { name: string }[] | undefined) ?? []).map((f) => f.name);
        const q = await get(
          `${base}/${l.id}/query?${new URLSearchParams({ geometry: `${PT.lon},${PT.lat}`, geometryType: "esriGeometryPoint", inSR: "4326", spatialRel: "esriSpatialRelIntersects", outFields: fields.filter((f) => /^(OBJECTID|GISLINK|MAP|GROUP_|PARCEL|PARCEL_TYP|TAX_MAP_NO|CALCACRES)$/i.test(f)).join(",") || "OBJECTID", returnGeometry: "false", f: "json" })}`,
        );
        const qj = json(q.text);
        const count = json(
          (
            await get(
              `${base}/${l.id}/query?${new URLSearchParams({ where: "1=1", returnCountOnly: "true", f: "json" })}`,
            )
          ).text,
        );
        say(
          `  - layer ${l.id} ${l.name}: geometry ${String(lj?.geometryType)}; count ${String(count?.count)}; fields ${clip(fields.join(","), 500)}`,
          `    - at Three Gorges: HTTP ${q.status}, acao ${q.headers["access-control-allow-origin"] ?? "none"}, ${clip(JSON.stringify(qj?.features ?? qj?.error), 400)}`,
        );
      }
    }
    say("");

    // 5. Round 3: the county's new Parcels layer, what the app needs from it.
    say("## 5. gis.hamiltontn.gov/server Parcels/MapServer/0, for the app", "");
    const NEW = "https://gis.hamiltontn.gov/server/rest/services/Parcels/MapServer/0";
    const nj = json((await get(`${NEW}?f=json`)).text);
    const nf = (nj?.fields as { name: string; type: string }[] | undefined) ?? [];
    say(
      `- maxRecordCount ${String(nj?.maxRecordCount)}; supportedQueryFormats ${String(nj?.supportedQueryFormats)}; capabilities ${String(nj?.capabilities)}`,
      `- the fields the app reads, as named now: ${nf
        .filter((f) =>
          /^(OBJECTID|GISLINK|MAP|GROUP_|PARCEL|PARCEL_TYPE|OWNERNAME1|ADDRESS|TAX_MAP_NO|CALCACRES)$|record|link/i.test(
            f.name,
          ),
        )
        .map((f) => `${f.name} (${f.type})`)
        .join(", ")}`,
    );
    const types = json(
      (
        await get(
          `${NEW}/query?${new URLSearchParams({ where: "1=1", groupByFieldsForStatistics: "PARCEL_TYPE", outStatistics: JSON.stringify([{ statisticType: "count", onStatisticField: "OBJECTID", outStatisticFieldName: "n" }]), f: "json" })}`,
        )
      ).text,
    );
    say(
      `- PARCEL_TYPE counts: ${clip(JSON.stringify((types?.features as { attributes: unknown }[] | undefined)?.map((f) => f.attributes) ?? types?.error), 600)}`,
    );
    const gj = await get(
      `${NEW}/query?${new URLSearchParams({ geometry: `${PT.lon},${PT.lat}`, geometryType: "esriGeometryPoint", inSR: "4326", spatialRel: "esriSpatialRelIntersects", where: "PARCEL_TYPE=1", outFields: "OBJECTID,GISLINK,MAP,GROUP_,PARCEL", returnGeometry: "true", outSR: "4326", f: "geojson" })}`,
    );
    say(line("geojson at Three Gorges, PARCEL_TYPE=1", { ...gj, text: gj.text.slice(0, 260) }));
    for (const origin of [
      "https://parcelscreen-git-hamilton-probe-zgrether-1030s-projects.vercel.app",
      "http://localhost:3000",
    ]) {
      const r = await live()(`${NEW}?f=json`, { headers: { "User-Agent": UA, Origin: origin } }).catch(
        () => null,
      );
      say(
        `- CORS for ${origin}: ${r ? `HTTP ${r.status}, acao ${r.headers.get("access-control-allow-origin") ?? "none"}` : "failed"}`,
      );
    }
    say("");

    mkdirSync(join(process.cwd(), "test-results"), { recursive: true });
    writeFileSync(join(process.cwd(), "test-results", "hamilton-probe.md"), out.join("\n") + "\n");
    expect(out.length).toBeGreaterThan(2);
  }, 600_000);
});
