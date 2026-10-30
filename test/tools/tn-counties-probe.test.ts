/**
 * Tennessee's own-records counties (the parcels mission, docs/plans/tn-counties.md §0): what Hamilton's and Knox's
 * public parcel services are, live, on the runners (tn-counties.yml; this repo's cloud sessions can't reach them).
 *
 *   pnpm exec vitest run test/tools/tn-counties-probe.test.ts --mode tn-counties-probe
 *
 * For each candidate it reports the service directory, each parcel layer's fields, record limit, query formats,
 * description and copyright, and the CORS header a browser would see; a parcel at Worley Road, Soddy-Daisy; and the
 * terms pages' lines on use. Read-only; nothing is written to the repo. Its findings go into the plan's §0.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const live = () =>
  (globalThis as unknown as Record<symbol, typeof fetch>)[Symbol.for("parcelscreen.liveFetch")]!;

const UA = "parcelscreen-data/1 (Tennessee county parcels probe; https://github.com/zgrether/parcelscreen)";
const ORIGIN = "https://parcelscreen.vercel.app";

/** Service directories to list; any service whose name says parcel is opened. */
const DIRECTORIES = [
  "https://mapsdev.hamiltontn.gov/hcwa03/rest/services",
  "https://mapsdev.hamiltontn.gov/hcwa/rest/services",
  "https://gismaps.hamiltontn.gov/arcgis/rest/services",
  "https://www.kgis.org/arcgis/rest/services",
  "https://kgis.org/arcgis/rest/services",
  "https://maps.kgis.org/arcgis/rest/services",
];
/** Layers named in the research, opened whatever the directories say. */
const LAYERS = [
  "https://mapsdev.hamiltontn.gov/hcwa03/rest/services/Live_Parcels/MapServer/0",
  "https://mapsdev.hamiltontn.gov/hcwa03/rest/services/OpenGov/OpenGov_HamiltonTN/MapServer/2",
];
/** Pages whose lines on use, licence or copyright are quoted. */
const TERMS = [
  "https://gis.hamiltontn.gov/gishome.html",
  "https://assessor.hamiltontn.gov/",
  "https://www.kgis.org/kgismaps/",
  "https://www.kgis.org/portal/Products/DigitalData/PurchaseInformation.aspx",
];

const out: string[] = ["# Tennessee county parcel services (probe)", ""];
const say = (...l: string[]) => {
  out.push(...l);
  console.log(l.join("\n"));
};

async function get(url: string): Promise<{ status: number; acao: string | null; text: string }> {
  try {
    const r = await live()(url, { headers: { "User-Agent": UA, Origin: ORIGIN } });
    return { status: r.status, acao: r.headers.get("access-control-allow-origin"), text: await r.text() };
  } catch (e) {
    return { status: 0, acao: null, text: String(e) };
  }
}
const json = (t: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(t) as Record<string, unknown>;
  } catch {
    return null;
  }
};
const clip = (s: unknown, n = 400) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .slice(0, n);

async function layer(url: string): Promise<void> {
  const r = await get(`${url}?f=pjson`);
  const j = json(r.text);
  say(`### ${url}`, "", `- HTTP ${r.status}, Access-Control-Allow-Origin: ${r.acao ?? "(none)"}`);
  if (!j) return say(`- not JSON: ${clip(r.text, 200)}`, "");
  if (j.error) return say(`- error: ${clip(JSON.stringify(j.error))}`, "");
  const fields = (j.fields as { name: string; type: string; alias?: string }[] | undefined) ?? [];
  say(
    `- name ${clip(j.name, 80)}, type ${clip(j.type, 40)}, geometry ${clip(j.geometryType, 40)}`,
    `- maxRecordCount ${String(j.maxRecordCount)}, supportedQueryFormats ${clip(j.supportedQueryFormats, 80)}, capabilities ${clip(j.capabilities, 120)}`,
    `- description: ${clip(j.description)}`,
    `- copyrightText: ${clip(j.copyrightText)}`,
    `- fields (${fields.length}): ${fields.map((f) => `${f.name}${f.alias && f.alias !== f.name ? ` "${f.alias}"` : ""}`).join(", ")}`,
    "",
  );
}

async function directory(root: string): Promise<string[]> {
  const r = await get(`${root}?f=pjson`);
  const j = json(r.text);
  say(`## ${root}`, "", `- HTTP ${r.status}, Access-Control-Allow-Origin: ${r.acao ?? "(none)"}`);
  if (!j) {
    say(`- not JSON: ${clip(r.text, 200)}`, "");
    return [];
  }
  const folders = (j.folders as string[] | undefined) ?? [];
  const services = (j.services as { name: string; type: string }[] | undefined) ?? [];
  say(
    `- folders: ${folders.join(", ") || "(none)"}`,
    `- services: ${services.map((s) => `${s.name} (${s.type})`).join(", ") || "(none)"}`,
  );
  const parcelServices = services.filter((s) => /parcel|property|cadast/i.test(s.name));
  // One level into folders, for parcel services only.
  for (const f of folders) {
    const fj = json((await get(`${root}/${f}?f=pjson`)).text);
    const fs = (fj?.services as { name: string; type: string }[] | undefined) ?? [];
    const hits = fs.filter((s) => /parcel|property|cadast/i.test(s.name));
    if (hits.length) say(`- in ${f}: ${hits.map((s) => `${s.name} (${s.type})`).join(", ")}`);
    parcelServices.push(...hits);
  }
  say("");
  const layers: string[] = [];
  for (const s of parcelServices) {
    const base = `${root}/${s.name}/${s.type}`;
    const sj = json((await get(`${base}?f=pjson`)).text);
    const ls = (sj?.layers as { id: number; name: string }[] | undefined) ?? [];
    say(
      `### ${base}`,
      "",
      `- layers: ${ls.map((l) => `${l.id} ${l.name}`).join(", ") || "(none)"}`,
      `- description: ${clip(sj?.serviceDescription ?? sj?.description)}`,
      `- copyrightText: ${clip(sj?.copyrightText)}`,
      "",
    );
    for (const l of ls.filter((x) => /parcel|property|tax/i.test(x.name)).slice(0, 2))
      layers.push(`${base}/${l.id}`);
  }
  return layers;
}

describe.runIf(import.meta.env.MODE === "tn-counties-probe")("Tennessee county parcel services", () => {
  it("probes Hamilton's and Knox's services", async () => {
    const found: string[] = [];
    for (const d of DIRECTORIES) found.push(...(await directory(d)));
    const layers = [...new Set([...LAYERS, ...found])];
    say("## Parcel layers", "");
    for (const l of layers) await layer(l);

    // Worley Road, Soddy-Daisy (the brief's Three Gorges lot): Nominatim, then each Hamilton layer around it.
    say("## Worley Road, Soddy-Daisy", "");
    const geo = json(
      `{"r":${(await get("https://nominatim.openstreetmap.org/search?q=Worley+Road,+Soddy-Daisy,+Tennessee&format=json&limit=3")).text}}`,
    );
    const hits = ((geo?.r as { lat: string; lon: string; display_name: string }[] | undefined) ?? []).slice(
      0,
      3,
    );
    say(...hits.map((h) => `- ${h.lat}, ${h.lon}: ${clip(h.display_name, 160)}`), "");
    const at = hits[0];
    if (at) {
      const [lat, lon] = [Number(at.lat), Number(at.lon)];
      const env = `${lon - 0.004},${lat - 0.003},${lon + 0.004},${lat + 0.003}`;
      for (const l of layers.filter((x) => x.includes("hamiltontn"))) {
        const q = new URLSearchParams({
          geometry: env,
          geometryType: "esriGeometryEnvelope",
          inSR: "4326",
          spatialRel: "esriSpatialRelIntersects",
          outFields: "*",
          returnGeometry: "false",
          resultRecordCount: "40",
          f: "json",
        });
        const r = await get(`${l}/query?${q}`);
        const j = json(r.text);
        const feats = (j?.features as { attributes: Record<string, unknown> }[] | undefined) ?? [];
        say(
          `### ${l}`,
          "",
          `- HTTP ${r.status}, ACAO ${r.acao ?? "(none)"}, ${feats.length} features${j?.error ? `, error ${clip(JSON.stringify(j.error))}` : ""}`,
        );
        for (const f of feats.slice(0, 2)) say(`- ${clip(JSON.stringify(f.attributes), 900)}`);
        const gorges = feats.filter((f) => /gorge/i.test(JSON.stringify(f.attributes)));
        say(
          `- ${gorges.length} mention "gorge"`,
          ...gorges.slice(0, 3).map((f) => `  - ${clip(JSON.stringify(f.attributes), 600)}`),
          "",
        );
        // GeoJSON answered? (the app asks f=geojson)
        q.set("f", "geojson");
        q.set("resultRecordCount", "1");
        q.set("returnGeometry", "true");
        q.set("outSR", "4326");
        const g = await get(`${l}/query?${q}`);
        say(`- f=geojson: HTTP ${g.status}, ${clip(g.text, 160)}`, "");
      }
    }

    say("## Terms", "");
    for (const t of TERMS) {
      const r = await get(t);
      const text = r.text
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ");
      const lines = text
        .split(/(?<=[.!?])\s+/)
        .filter((s) =>
          /licen|copyright|disclaim|commercial|permission|reproduc|terms|agreement|not intended|internal/i.test(
            s,
          ),
        );
      say(`### ${t}`, "", `- HTTP ${r.status}`, ...lines.slice(0, 12).map((s) => `- "${clip(s, 300)}"`), "");
    }

    mkdirSync(join(process.cwd(), "test-results"), { recursive: true });
    writeFileSync(join(process.cwd(), "test-results", "tn-counties-probe.md"), out.join("\n") + "\n");
    expect(out.length).toBeGreaterThan(2);
  }, 600_000);
});
