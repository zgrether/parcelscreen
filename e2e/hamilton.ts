/**
 * Hamilton County's parcel service in the e2e (the Tennessee counties mission): answered from its unit-test recording
 * (test/fixtures/tn-hamilton/parcels.har, `pnpm record:tn-hamilton`) by kind of request, not by exact request. Which
 * tiles the map asks depends on the viewport, and the recording holds the one tile around the Three Gorges lot: every
 * tile is answered with it, so the lot and its neighbours draw wherever the map stands nearby.
 */
import { readFileSync } from "node:fs";
import { pointOnFeature } from "@turf/turf";
import type { Feature, Polygon } from "geojson";
import type { BrowserContext } from "@playwright/test";
import type { HarEntry } from "../test/support/replayFetch";
import { HAMILTON_HAR, HAMILTON_HOST } from "../test/support/tnHamilton";

type Kind = "count" | "record" | "point" | "tile" | "search";

/** What a query to the layer asks for, from its parameters (a GET's query or a POST's form body). */
function kindOf(p: URLSearchParams): Kind | null {
  if (p.get("returnCountOnly") === "true") return "count";
  if (p.has("objectIds")) return "record";
  if (p.get("geometryType") === "esriGeometryPoint") return "point";
  if (p.has("maxAllowableOffset") && p.get("orderByFields") === "OBJECTID") return "tile";
  if (/\bMAP=/.test(p.get("where") ?? "")) return "search";
  return null;
}

const paramsOf = (url: string, body: string | null | undefined): URLSearchParams => {
  const p = new URLSearchParams(new URL(url).search);
  for (const [k, v] of new URLSearchParams(body ?? "")) p.set(k, v);
  return p;
};

const entries = (): HarEntry[] =>
  (JSON.parse(readFileSync(HAMILTON_HAR, "utf8")) as { log: { entries: HarEntry[] } }).log.entries.filter(
    (e) => new URL(e.request.url).host === HAMILTON_HOST,
  );

/** The recorded answers, by kind. */
function recorded(): Map<Kind, string> {
  const out = new Map<Kind, string>();
  for (const e of entries()) {
    const kind = kindOf(paramsOf(e.request.url, e.request.postData?.text));
    if (kind && e.response.status === 200 && !out.has(kind)) out.set(kind, e.response.content.text ?? "");
  }
  return out;
}

/** A point inside the Three Gorges lot, from its recorded record. */
export function threeGorgesPoint(): { lat: number; lon: number } {
  const record = recorded().get("record")!;
  const f = (JSON.parse(record) as { features: Feature<Polygon>[] }).features[0]!;
  const [lon, lat] = pointOnFeature(f).geometry.coordinates as [number, number];
  return { lat, lon };
}

/** Routes Hamilton's layer to the recording. Call after replayHar: the route added last is asked first. */
export async function replayHamilton(context: BrowserContext): Promise<void> {
  const answers = recorded();
  await context.route(/^https:\/\/mapsdev\.hamiltontn\.gov\/.*\/query/, (route) => {
    const req = route.request();
    const kind = kindOf(paramsOf(req.url(), req.postData()));
    const body = (kind && answers.get(kind)) ?? JSON.stringify({ type: "FeatureCollection", features: [] });
    return route.fulfill({
      status: 200,
      headers: {
        "content-type": kind === "count" ? "application/json" : "application/geo+json",
        "access-control-allow-origin": req.headers()["origin"] ?? "*",
      },
      body,
    });
  });
}
