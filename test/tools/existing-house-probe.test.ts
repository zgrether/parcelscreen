/**
 * The existing-house mission's probe (docs/plans/existing-house.md §2, §5 PR 1), live on the runners
 * (existing-house.yml; this repo's cloud sessions can't reach these hosts):
 *   - parcel 010-A-10 (Washington Co., VA) from VGIN's parcels, graded live with no house mark: its trailheads, its
 *     elevation source, and the default rubric's verdict and rows (the "before");
 *   - why the trailhead at Hayters Gap (the Brumley Mountain Trail, to The Channels) isn't among the baked places: what
 *     OpenStreetMap has there, VGIN's landmark types, and whether Virginia publishes state forest access points.
 *
 *   pnpm exec vitest run test/tools/existing-house-probe.test.ts --mode existing-house-probe
 *
 * Round 1 (#417) found the trailhead lot at Hayters Gap tagged only amenity=parking, and VGIN's "State Forest Points";
 * its parcel lookup matched nothing. Round 2, kept here, finds the parcel and tries the bake rule the plan proposes.
 * Read-only; nothing is written to the repo. No owner or address field is asked for (CLAUDE.md, owner fields).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Feature, Polygon } from "geojson";
import { describe, expect, it } from "vitest";
import { createHttpClient } from "@/lib/http";
import { reportCard } from "@/lib/report/card";
import { defaultNamedRubric } from "@/lib/rubric/default";
import { screen } from "@/lib/screen";
import { DEFAULT_ENDPOINTS, DEFAULT_USER_CONFIG } from "@/lib/screen/config";
import type { ProgressEvent } from "@/lib/screen/types";

const live = () =>
  (globalThis as unknown as Record<symbol, typeof fetch>)[Symbol.for("parcelscreen.liveFetch")]!;

const UA = "parcelscreen-data/1 (existing-house probe; https://github.com/zgrether/parcelscreen)";

const out: string[] = ["# The existing-house mission's probe", ""];
const say = (...l: string[]) => {
  out.push(...l);
  console.log(l.join("\n"));
};
const write = () => {
  mkdirSync(join(process.cwd(), "test-results"), { recursive: true });
  writeFileSync(join(process.cwd(), "test-results", "existing-house-probe.md"), out.join("\n") + "\n");
};

async function get(url: string, init?: RequestInit): Promise<{ status: number; text: string }> {
  try {
    const r = await live()(url, { ...init, headers: { "User-Agent": UA, ...(init?.headers ?? {}) } });
    return { status: r.status, text: await r.text() };
  } catch (e) {
    return { status: 0, text: String(e) };
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

const VA_PARCELS = DEFAULT_ENDPOINTS.parcels[1]!;
/** Only these fields: no owner, mailing or site address. */
const PARCEL_FIELDS = "OBJECTID,PARCELID,PTM_ID,FIPS,LOCALITY";
/** Around Hayters Gap, where VA-80 crosses Clinch Mountain: generous, since the gap's exact point isn't known here. */
const GAP_BOX = { s: 36.74, w: -82.1, n: 36.9, e: -81.85 };
/** How near a lot must be to the trail for the proposed rule (round 2). */
const RULE_M = 60;
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

async function overpass(q: string): Promise<Record<string, unknown> | null> {
  for (const url of OVERPASS) {
    const r = await get(url, {
      method: "POST",
      body: new URLSearchParams({ data: q }).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    const j = r.status === 200 ? json(r.text) : null;
    if (j) return j;
    say(`- Overpass ${new URL(url).host}: HTTP ${r.status} ${clip(r.text, 120)}`);
  }
  return null;
}

type OsmEl = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
  members?: { type: string; ref: number; role: string }[];
};

describe.runIf(import.meta.env.MODE === "existing-house-probe")("the existing-house probe", () => {
  it("round 2: 010-A-10 found and graded live; the trailhead rule tried at Hayters Gap", async () => {
    // ---------- 010-A-10: round 1's LIKE matched nothing, so the format is read from the parcels near the gap ----------
    const sample = json(
      (
        await get(
          `${VA_PARCELS}/query?${new URLSearchParams({
            f: "json",
            where: "1=1",
            geometry: "-81.97,36.80,-81.90,36.87",
            geometryType: "esriGeometryEnvelope",
            inSR: "4326",
            spatialRel: "esriSpatialRelIntersects",
            outFields: "PTM_ID,LOCALITY,FIPS",
            returnGeometry: "false",
            resultRecordCount: "60",
          })}`,
        )
      ).text,
    );
    const ids = ((sample?.features as { attributes: Record<string, unknown> }[] | undefined) ?? []).map(
      (f) => f.attributes,
    );
    say(
      "## Parcel 010-A-10 (VGIN parcels)",
      "",
      `- Near Hayters Gap: ${ids.length} records${sample?.error ? `; error ${clip(JSON.stringify(sample.error))}` : ""}`,
      `- Their ids: ${clip(ids.map((a) => `${String(a.PTM_ID)} (${String(a.LOCALITY)}, ${String(a.FIPS)})`).join("; "), 1500)}`,
      "",
    );
    const want = (id: unknown) =>
      String(id ?? "")
        .replace(/[^0-9A-Z]/gi, "")
        .toUpperCase();
    const hit = ids.find((a) => want(a.PTM_ID) === "010A10" || want(a.PTM_ID) === "10A10");
    const locality = String(hit?.LOCALITY ?? ids[0]?.LOCALITY ?? "");
    const tries = [
      ...(hit ? [`PTM_ID='${String(hit.PTM_ID)}' AND LOCALITY='${locality}'`] : []),
      `PTM_ID='010-A-10' AND LOCALITY='${locality}'`,
      `PTM_ID='010 A 10' AND LOCALITY='${locality}'`,
      `PTM_ID LIKE '010%A%10%' AND LOCALITY='${locality}'`,
    ];
    let feats: Feature<Polygon>[] = [];
    for (const where of tries) {
      const pr = await get(
        `${VA_PARCELS}/query?${new URLSearchParams({
          f: "geojson",
          where,
          outFields: PARCEL_FIELDS,
          returnGeometry: "true",
          outSR: "4326",
        })}`,
      );
      const fc = json(pr.text) as { features?: Feature<Polygon>[]; error?: unknown } | null;
      feats = fc?.features ?? [];
      say(
        `- \`${where}\`: HTTP ${pr.status}, ${feats.length} match(es)${fc?.error ? `, error ${clip(JSON.stringify(fc.error))}` : ""}`,
        ...feats.map((f) => `  - ${clip(JSON.stringify(f.properties), 200)}; ${f.geometry?.type}`),
      );
      if (feats.length) break;
    }
    say("");
    const parcel = feats[0];

    if (parcel?.geometry) {
      const ring = parcel.geometry.coordinates[0]!;
      const cx = ring.reduce((a, p) => a + p[0]!, 0) / ring.length,
        cy = ring.reduce((a, p) => a + p[1]!, 0) / ring.length;
      say(`- Its outline's mean vertex: ${cy.toFixed(3)}, ${cx.toFixed(3)}`, "");
      const steps = new Map<string, string>();
      const t0 = performance.now();
      const { result } = await screen(
        { polygon: parcel.geometry, config: DEFAULT_USER_CONFIG },
        (e: ProgressEvent) => {
          if (e.status !== "run") steps.set(e.step, e.status);
        },
        {
          http: createHttpClient({
            env: "node",
            fetchImpl: live(),
            userAgent: "ParcelScreen/1.0 (existing-house probe)",
          }),
        } as Parameters<typeof screen>[2],
      );
      const card = reportCard(result, defaultNamedRubric());
      const th = result.near?.trailheads ?? [];
      say(
        `## 010-A-10 graded live, no house mark (${((performance.now() - t0) / 1000).toFixed(0)} s)`,
        "",
        `- Steps: ${[...steps].map(([s, st]) => `${s} ${st}`).join(", ")}`,
        `- Failed: ${JSON.stringify(result.failed)}; no response: ${JSON.stringify(result.noResponse)}`,
        `- Elevation: ${result.demSource ?? "?"} at ${result.demResM ?? "?"} m`,
        `- ${result.acres.toFixed(2)} ac; house sites ${result.sites?.length ?? 0}, benches ${result.benches?.length ?? 0}`,
        `- Trailheads (${result.near?.trailheadCount ?? 0}): ${
          th
            .slice(0, 6)
            .map((t) => `${t.name} (${t.source}, ${t.drive ? `${Math.round(t.drive.min)} min` : "no drive"})`)
            .join("; ") || "none"
        }`,
        "",
        "### The default rubric's card",
        "",
        `- ${card.verdict} · ${card.grade ?? "–"}: ${clip(card.reason, 300)}`,
        ...card.gates.map((g) => `- Must ${g.label}: ${g.status}: ${clip(g.reason, 200)}`),
        ...card.rows.map((r) => `- ${r.label}: ${r.grade ?? "–"}: ${clip(r.detail, 160)}`),
        "",
      );
    } else say("- No parcel found: the grade is skipped.", "");
    write();

    // ---------- The proposed rule: a parking lot by a hiking route, or by a named path an agency runs ----------
    const bb = `${GAP_BOX.s},${GAP_BOX.w},${GAP_BOX.n},${GAP_BOX.e}`;
    const rule = await overpass(
      `[out:json][timeout:120][bbox:${bb}];` +
        `(rel["route"~"^(hiking|foot)$"];)->.hr;way(r.hr)->.rw;` +
        `way["highway"~"^(path|footway)$"]["name"]["operator"~"forest|park|conservation|wildlife",i]->.aw;` +
        `(.rw;.aw;)->.tw;node(w.tw)->.tn;` +
        `nwr["amenity"="parking"](around.tn:${RULE_M})->.p;` +
        `.p foreach{out center tags;(way.tw(around._:${RULE_M});)->.near;rel(bw.near)["route"~"^(hiking|foot)$"]->.nr;.nr out tags;.near out tags 3;}`,
    );
    const rel = (rule?.elements as OsmEl[] | undefined) ?? [];
    say(
      `## The rule at Hayters Gap: parking within ${RULE_M} m of a hiking route or an agency's named path`,
      "",
      `Box ${bb}: ${rel.filter((e) => e.tags?.amenity === "parking").length} lots.`,
      "",
      ...rel.map((e) => {
        const c = e.center ?? (e.lat != null ? { lat: e.lat, lon: e.lon! } : null);
        return `${e.tags?.amenity === "parking" ? "- " : "  - "}${e.type}/${e.id} ${c ? `${c.lat.toFixed(4)}, ${c.lon.toFixed(4)}` : ""}: ${clip(JSON.stringify(e.tags), 200)}`;
      }),
      "",
    );
    write();
    expect(out.length).toBeGreaterThan(4);
  }, 1_800_000);
});
