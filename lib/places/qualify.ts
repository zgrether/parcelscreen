/**
 * Which trail lots are trailheads (Zach, #425, after bake 5's report): a parking lot by a trail counts only when it's on
 * a hiking route of some length (SCREEN_CONSTANTS.near.trailLotRouteMi) or near public land of some size (trailLotPublicM,
 * trailLotPublicAc). A town greenway's lot or a shopping centre's drops out; the Brumley Mountain Trail's lot at Hayters
 * Gap stays on both counts (a 13.5 mi route; The Channels State Forest, 4,836 ac). A lot OSM tags as a trailhead isn't
 * judged. Evidence that doesn't load keeps the lot: a short answer never takes lots away.
 */
import type { HttpClient } from "../http";
import { DEFAULT_ENDPOINTS, SCREEN_CONSTANTS } from "../screen/config";
import type { LatLon } from "../geo/types";
import type { OsmElement } from "./bake";

const K = SCREEN_CONSTANTS.near;
const M_PER_MI = 1609.344;

/** The ways a lot is measured to, as the bake's trailLots measures them (paths, footways, tracks, bridleways, service). */
const TRAIL = "^(path|footway|track|bridleway|service)$";

/** Lots asked of Overpass at once. */
export const QUALIFY_BATCH = 40;

/** What decided a lot. */
export interface LotEvidence {
  /** OSM tags it as a trailhead: not judged. */
  tagged: boolean;
  /** The longest hiking or foot route on the trails beside it, if any. */
  route: { name: string; mi: number } | null;
  /** The largest public land within trailLotPublicM, when it was asked (only when the route didn't decide). */
  publicLand: { name: string; ac: number } | null;
}

export interface LotVerdict<T> {
  lot: T;
  keep: boolean;
  /** Why, in the report's words. */
  why: string;
}

const parse = (id: string): { type: "node" | "way" | "relation"; ref: number } | null => {
  const m = /^osm:(node|way|relation)\/(\d+)$/.exec(id);
  return m ? { type: m[1] as "node" | "way" | "relation", ref: Number(m[2]) } : null;
};

/**
 * One Overpass query for a batch of lots: each lot's tags, then the hiking and foot routes on the trails within
 * trailLotM of it, with their lengths (length() on a relation: its members' sum; probe round 10, 11/12).
 */
export function evidenceQuery(ids: readonly string[]): string {
  const by: Record<"node" | "way" | "relation", number[]> = { node: [], way: [], relation: [] };
  for (const id of ids) {
    const p = parse(id);
    if (p) by[p.type].push(p.ref);
  }
  const sets = (["node", "way", "relation"] as const)
    .filter((t) => by[t].length)
    .map((t) => `${t === "relation" ? "rel" : t}(id:${by[t].join(",")});`)
    .join("");
  return (
    `[out:json][timeout:180];(${sets})->.l;` +
    `foreach.l->.x(.x out tags;` +
    `way(around.x:${K.trailLotM})["highway"~"${TRAIL}"]->.n;` +
    `rel(bw.n)["route"~"^(hiking|foot)$"]->.r;` +
    `.r convert route ::id=id(),name=t["name"],len=length();out;);`
  );
}

/** evidenceQuery's answer: each lot's tags and its longest route, by id ("osm:way/1"). */
export function evidenceOf(
  elements: readonly OsmElement[],
): Map<string, { tagged: boolean; route: LotEvidence["route"] }> {
  const out = new Map<string, { tagged: boolean; route: LotEvidence["route"] }>();
  let at: string | null = null;
  for (const e of elements) {
    if (e.type === "node" || e.type === "way" || e.type === "relation") {
      at = `osm:${e.type}/${e.id}`;
      const t = e.tags ?? {};
      out.set(at, { tagged: t.highway === "trailhead" || t.information === "trailhead", route: null });
    } else if (e.type === "route" && at) {
      const lot = out.get(at)!;
      const mi = Number(e.tags?.len) / M_PER_MI;
      if (Number.isFinite(mi) && (!lot.route || mi > lot.route.mi))
        lot.route = { name: e.tags?.name || "a hiking route", mi };
    }
  }
  return out;
}

/** The largest public land (PAD-US, any access but closed) within trailLotPublicM of a place; null when there's none. */
export async function publicLandNear(
  ll: LatLon,
  http: HttpClient,
): Promise<{ name: string; ac: number } | null> {
  const r = await http.fetch(`${DEFAULT_ENDPOINTS.padus[0]}/query`, {
    method: "POST",
    body: new URLSearchParams({
      f: "json",
      geometry: `${ll[1]},${ll[0]}`,
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      distance: String(K.trailLotPublicM),
      units: "esriSRUnit_Meter",
      where: "Pub_Access <> 'XA'",
      outFields: "Unit_Nm,GIS_Acres",
      returnGeometry: "false",
    }),
  });
  if (!r.ok) throw new Error(`PAD-US: HTTP ${r.status}`);
  const j = (await r.json()) as {
    features?: { attributes: { Unit_Nm?: string | null; GIS_Acres?: number | null } }[];
    error?: unknown;
  };
  if (j.error) throw new Error(`PAD-US: ${JSON.stringify(j.error)}`);
  let best: { name: string; ac: number } | null = null;
  for (const f of j.features ?? []) {
    const ac = Number(f.attributes.GIS_Acres);
    if (Number.isFinite(ac) && (!best || ac > best.ac))
      best = { name: f.attributes.Unit_Nm || "public land", ac };
  }
  return best;
}

const mi1 = (n: number) => n.toFixed(1);
const acres = (n: number) => Math.round(n).toLocaleString("en-US");

/** The verdict from the evidence: a tagged trailhead, a long enough route, or large enough public land. */
export function verdictOf(ev: LotEvidence): { keep: boolean; why: string } {
  if (ev.tagged) return { keep: true, why: "tagged as a trailhead" };
  if (ev.route && ev.route.mi >= K.trailLotRouteMi)
    return { keep: true, why: `on ${ev.route.name}, ${mi1(ev.route.mi)} mi` };
  if (ev.publicLand && ev.publicLand.ac >= K.trailLotPublicAc)
    return {
      keep: true,
      why: `${ev.publicLand.name}, ${acres(ev.publicLand.ac)} ac, within ${K.trailLotPublicM} m`,
    };
  const route = ev.route ? `${ev.route.name}, ${mi1(ev.route.mi)} mi` : "no hiking route";
  const land = ev.publicLand ? `${ev.publicLand.name}, ${acres(ev.publicLand.ac)} ac` : "no public land";
  return { keep: false, why: `${route}; ${land} within ${K.trailLotPublicM} m` };
}

/**
 * Judges trail lots (Zach, #425), Overpass a batch at a time, PAD-US a lot at a time when its route didn't decide. A
 * batch or a lot whose evidence won't load is kept, and said so.
 */
export async function qualifyTrailLots<T extends { id: string; ll: LatLon }>(
  lots: readonly T[],
  deps: {
    http: HttpClient;
    /** One Overpass query, retried as the bake retries (overpassRetried). */
    ask: (ql: string, what: string) => Promise<OsmElement[]>;
    log?: (line: string) => void;
  },
): Promise<LotVerdict<T>[]> {
  const log = deps.log ?? (() => {});
  const out: LotVerdict<T>[] = [];
  for (let i = 0; i < lots.length; i += QUALIFY_BATCH) {
    const batch = lots.slice(i, i + QUALIFY_BATCH);
    let ev: ReturnType<typeof evidenceOf> | null = null;
    try {
      ev = evidenceOf(
        await deps.ask(evidenceQuery(batch.map((l) => l.id)), `trail-lot evidence ${i / QUALIFY_BATCH + 1}`),
      );
    } catch (e) {
      log(`trail-lot evidence: lots ${i + 1}–${i + batch.length}: ${String(e)}; kept unchecked`);
    }
    for (const lot of batch) {
      const got = ev?.get(lot.id);
      if (!got) {
        out.push({
          lot,
          keep: true,
          why: ev ? "not in OSM's answer; kept unchecked" : "evidence didn't load; kept unchecked",
        });
        continue;
      }
      let publicLand: LotEvidence["publicLand"] = null;
      if (!got.tagged && !(got.route && got.route.mi >= K.trailLotRouteMi)) {
        try {
          publicLand = await publicLandNear(lot.ll, deps.http);
        } catch (e) {
          out.push({ lot, keep: true, why: `public land didn't load (${String(e)}); kept unchecked` });
          continue;
        }
      }
      out.push({ lot, ...verdictOf({ ...got, publicLand }) });
    }
  }
  const dropped = out.filter((v) => !v.keep).length;
  log(`trail-lot evidence: ${out.length} lots judged, ${out.length - dropped} kept, ${dropped} dropped`);
  return out;
}
