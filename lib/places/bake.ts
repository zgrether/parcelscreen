/**
 * The places bake (roadmap step 14d, docs/plans/step-14d-places.md §2, §7): every grocery, trailhead and trailhead
 * parking lot in VA, NC and TN plus 60 km, from the sources a grade asked live before (places.ts, trailheads.ts,
 * trailheadParking.ts), written as 1° cells (lib/screen/placeData.ts).
 * - OpenStreetMap through Overpass: one query per cell (supermarkets, trailheads), then the parking within
 *   drive.parkingWithinM of every trailhead, a batch of points per query.
 * - USFS INFRA trailheads, the three states' park points and TDEC's TREC trails: each layer once over the area, paged.
 * A source that doesn't answer keeps the previous bake's places, dated as fetched then; with no previous bake, the bake
 * fails. Run by `pnpm data:places` (test/tools/places-bake.test.ts) from the places workflow and the monthly refresh.
 */
import { point, pointToLineDistance, pointToPolygonDistance } from "@turf/turf";
import type { LineString, MultiLineString, MultiPolygon, Polygon } from "geojson";
import type { HttpClient } from "../http";
import { DEFAULT_ENDPOINTS, SCREEN_CONSTANTS } from "../screen/config";
import {
  FOLDER_OF,
  PLACE_FOLDERS,
  PLACES_VERSION,
  cellOf,
  type BakedLaunch,
  type BakedParking,
  type BakedTrailhead,
  type Grocer,
  type Place,
  type PlaceCell,
  type PlaceSource,
  type PlacesIndex,
} from "../screen/placeData";
import { kmToState, outlineOf, type StateCode } from "../screen/states";
import { hikingTagged, parkingQuery } from "../screen/trailheadParking";
import { STATE_SOURCES, readableName } from "../screen/trailheads";
import type { LatLon } from "../screen/util";
import { flatwaterByName } from "./flatwater";
import { RIDB_EXPORT, RIDB_LAUNCHES } from "./ridb";

/** The baked area: within this of VA, NC or TN (the brief: "plus 60 km"). */
export const MARGIN_KM = 60;
const STATES: readonly StateCode[] = ["VA", "NC", "TN"];
/** Trailheads per parking query: each is one `around` clause. */
const PARKING_BATCH = 150;
const PAGE = 1000;
const MAX_PAGES = 50;

export interface BakeDeps {
  http: HttpClient;
  /** Overpass mirrors, tried in order for each query. */
  overpass?: readonly string[];
  /** YYYY-MM-DD. */
  today: string;
  /** The previous bake, for a source that doesn't answer. */
  previous?: { index: PlacesIndex; places: Place[] };
  log?: (line: string) => void;
  /** Waits between retries (tests pass a no-op). */
  sleep?: (ms: number) => Promise<void>;
  /** The clock for the classification's time budget, in ms (Date.now; tests pass their own). */
  now?: () => number;
}

export interface Bake {
  index: PlacesIndex;
  cells: PlaceCell[];
  /** What kept the previous bake's places this time, as the refresh summary says it: "usfs", "osm towns", … */
  kept: string[];
}

const round6 = ([lat, lon]: LatLon): LatLon => [+lat.toFixed(6), +lon.toFixed(6)];

/** Within MARGIN_KM of one of the three states (inside one counts). */
export function inArea(ll: LatLon): boolean {
  return STATES.some((s) => kmToState(s, ll) <= MARGIN_KM);
}

let AREA_CELLS: string[] | null = null;

/** The states' outline points, every DENSE_KM or closer along each edge: for a quick nearest-point test per cell. */
const DENSE_KM = 5;

function densePoints(): LatLon[] {
  const out: LatLon[] = [];
  for (const s of STATES)
    for (const ring of outlineOf(s).coordinates)
      for (let i = 1; i < ring.length; i++) {
        const [x0, y0] = ring[i - 1] as [number, number];
        const [x1, y1] = ring[i] as [number, number];
        const steps = Math.max(1, Math.ceil(Math.hypot((x1 - x0) * 89, (y1 - y0) * 111) / DENSE_KM));
        for (let k = 0; k < steps; k++)
          out.push([y0 + ((y1 - y0) * k) / steps, x0 + ((x1 - x0) * k) / steps]);
      }
  return out;
}

/**
 * The cells the bake covers, "34_-84" …, south to north and west to east: each cell with a state's outline within
 * MARGIN_KM (plus the outline points' spacing, so none is missed), or a state around its centre. A superset of the
 * area: `inArea` decides each place.
 */
export function areaCells(): string[] {
  if (AREA_CELLS) return AREA_CELLS;
  const pts = densePoints();
  const reach = MARGIN_KM + DENSE_KM;
  const out: string[] = [];
  for (let lat = 33; lat <= 40; lat++)
    for (let lon = -92; lon <= -75; lon++) {
      const kmPerLon = 111.32 * Math.cos(((lat + 0.5) * Math.PI) / 180);
      const near = pts.some(([y, x]) => {
        const dy = (y < lat ? lat - y : y > lat + 1 ? y - lat - 1 : 0) * 111.32;
        const dx = (x < lon ? lon - x : x > lon + 1 ? x - lon - 1 : 0) * kmPerLon;
        return Math.hypot(dx, dy) <= reach;
      });
      if (near || STATES.some((s) => kmToState(s, [lat + 0.5, lon + 0.5]) <= 0)) out.push(`${lat}_${lon}`);
    }
  return (AREA_CELLS = out);
}

const cellBox = (cell: string): [number, number, number, number] => {
  const [lat, lon] = cell.split("_").map(Number) as [number, number];
  return [lon, lat, lon + 1, lat + 1];
};

// ---------- OpenStreetMap ----------

interface OsmElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
  /** A relation's members (`out body`). */
  members?: { type: string; ref: number; role?: string }[];
}

/** One Overpass query, each mirror in turn (POST, as the area profiler sends it). */
async function overpass(ql: string, deps: BakeDeps): Promise<OsmElement[]> {
  const errs: string[] = [];
  for (const m of deps.overpass ?? DEFAULT_ENDPOINTS.overpass) {
    try {
      const r = await deps.http.fetch(m, {
        method: "POST",
        body: new URLSearchParams({ data: ql }),
        timeoutMs: 200_000,
      });
      if (!r.ok) throw new Error(`${new URL(m).host} ${r.status}`);
      return ((await r.json()) as { elements?: OsmElement[] }).elements ?? [];
    } catch (e) {
      errs.push(String(e));
    }
  }
  throw new Error(`Overpass unreachable (${errs.join("; ")})`);
}

const at = (e: OsmElement): LatLon | null =>
  e.center ? [e.center.lat, e.center.lon] : e.lat != null && e.lon != null ? [e.lat, e.lon] : null;

/**
 * One cell's supermarkets and trailheads (as the near step read them from Photon, places.ts), and its paddle launches
 * (step 14d plan §2.4) with the canoe routes they're on (`out body`: a route's members, not its geometry).
 */
export function osmCellQuery(cell: string): string {
  const [w, s, e, n] = cellBox(cell);
  return (
    `[out:json][timeout:180][bbox:${s},${w},${n},${e}];` +
    `(nwr["shop"="supermarket"];nwr["highway"="trailhead"];nwr["information"="trailhead"];)->.p;` +
    `(nwr["leisure"="slipway"];nwr["canoe"~"^(put_in|egress|put_in;egress)$"];` +
    `nwr["whitewater"~"^(put_in|egress|put_in;egress)$"];nwr["waterway"="access_point"];)->.l;` +
    `(.p;.l;);out center tags;rel(bn.l)["route"="canoe"];out body;`
  );
}

/** Overpass's answer for a cell as places: supermarkets as grocers (named "Supermarket" when unnamed), trailheads. */
export function osmPlaces(elements: readonly OsmElement[]): (Grocer | BakedTrailhead)[] {
  const out: (Grocer | BakedTrailhead)[] = [];
  for (const e of elements) {
    if (e.type === "relation") continue; // the canoe routes (osmLaunches)
    const ll = at(e);
    if (!ll || !inArea(ll)) continue;
    const id = `osm:${e.type}/${e.id}`;
    const t = e.tags ?? {};
    if (t.shop === "supermarket") {
      const name = t.name || "Supermarket";
      out.push({
        kind: "grocer",
        id,
        name,
        ll: round6(ll),
        src: "osm",
        big: SCREEN_CONSTANTS.near.bigGrocer.test(name),
      });
    } else if (t.highway === "trailhead" || t.information === "trailhead")
      out.push({ kind: "trailhead", id, name: t.name || "Trailhead", ll: round6(ll), src: "osm" });
  }
  return out;
}

/** A launch before its water is known (classifyLaunches). */
export interface RawLaunch {
  id: string;
  ll: LatLon;
  src: "osm" | "usfs";
  name?: string;
  /** Tagged whitewater=*: a river launch whatever water it's near. */
  whitewater?: true;
  trail?: string;
}

const PUT_IN = /^(put_in|egress|put_in;egress)$/;

/**
 * A cell's paddle launches from Overpass's answer (step 14d plan §2.4): slipways, canoe and whitewater put-ins and
 * egresses, and waterway access points; not a slipway tagged canoe=no, nor anything private. A launch on a canoe route
 * takes the route's name as its paddle trail.
 */
export function osmLaunches(elements: readonly OsmElement[]): RawLaunch[] {
  const trailOf = new Map<string, string>();
  for (const r of elements)
    if (r.type === "relation" && r.tags?.route === "canoe" && r.tags.name)
      for (const m of r.members ?? []) if (m.type === "node") trailOf.set(`node/${m.ref}`, r.tags.name);
  const out: RawLaunch[] = [];
  for (const e of elements) {
    if (e.type === "relation" && e.tags?.route === "canoe") continue;
    const t = e.tags ?? {};
    const launch =
      t.leisure === "slipway" ||
      PUT_IN.test(t.canoe ?? "") ||
      PUT_IN.test(t.whitewater ?? "") ||
      t.waterway === "access_point";
    if (!launch || t.canoe === "no" || t.access === "private" || t.access === "no") continue;
    const ll = at(e);
    if (!ll || !inArea(ll)) continue;
    const trail = trailOf.get(`${e.type}/${e.id}`);
    out.push({
      id: `osm:${e.type}/${e.id}`,
      ll: round6(ll),
      src: "osm",
      ...(t.name ? { name: t.name } : {}),
      ...(PUT_IN.test(t.whitewater ?? "") ? { whitewater: true as const } : {}),
      ...(trail ? { trail } : {}),
    });
  }
  return out;
}

// ---------- NHD: flatwater or river ----------

interface NhdFeature {
  type: "Feature";
  properties: Record<string, unknown> | null;
  geometry: Polygon | MultiPolygon | LineString | MultiLineString | null;
}

/** NHD features within `distanceM` of any of the points: one query, GeoJSON out. */
async function nhdNear(
  url: string,
  points: readonly LatLon[],
  distanceM: number,
  outFields: string,
  deps: BakeDeps,
): Promise<NhdFeature[]> {
  const q = new URLSearchParams({
    geometry: JSON.stringify({
      points: points.map(([lat, lon]) => [lon, lat]),
      spatialReference: { wkid: 4326 },
    }),
    geometryType: "esriGeometryMultipoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    distance: String(distanceM),
    units: "esriSRUnit_Meter",
    outFields,
    returnGeometry: "true",
    outSR: "4326",
    maxAllowableOffset: "0.0001",
    geometryPrecision: "6",
    f: "geojson",
  });
  const r = await deps.http.fetch(`${url}/query`, { method: "POST", body: q, timeoutMs: 180_000 });
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
  const j = (await r.json()) as { features?: NhdFeature[]; error?: { message?: string } };
  if (j.error) throw new Error(`${new URL(url).host}: ${j.error.message ?? "error"}`);
  return j.features ?? [];
}

const ACRES_PER_KM2 = 247.105;
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/**
 * Each launch on its water (step 14d plan §2.4): flatwater when within paddling.flatwaterWithinM of an NHD lake, pond
 * or reservoir (FTYPE 390, 436) of at least paddling.flatwaterMinAc, the nearest such; else a river, named by the
 * nearest named flowline within paddling.riverWithinM; still flatwater when its name or a known pool says so
 * (flatwaterByName, #350), unless it's below a dam (tailwaterOf). Whitewater put-ins are rivers whatever they're near. Named
 * "<water> access" when unnamed, else "Boat launch". Pure: the NHD features are given.
 */
export function classifyLaunches(
  launches: readonly RawLaunch[],
  waterbodies: readonly NhdFeature[],
  flowlines: readonly NhdFeature[],
): BakedLaunch[] {
  const P = SCREEN_CONSTANTS.paddling;
  const lakes = waterbodies.flatMap((f) => {
    const p = f.properties ?? {};
    const ftype = Number(p.FTYPE ?? p.ftype);
    const ac = Number(p.AREASQKM ?? p.areasqkm) * ACRES_PER_KM2;
    if (!f.geometry || (f.geometry.type !== "Polygon" && f.geometry.type !== "MultiPolygon")) return [];
    if (!(SCREEN_CONSTANTS.streams.ponds as readonly number[]).includes(ftype) || !(ac >= P.flatwaterMinAc))
      return [];
    return [{ geo: f.geometry, name: str(p.GNIS_NAME ?? p.gnis_name), ac }];
  });
  const rivers = flowlines.flatMap((f) => {
    const name = str(f.properties?.GNIS_NAME ?? f.properties?.gnis_name);
    if (!name || !f.geometry || (f.geometry.type !== "LineString" && f.geometry.type !== "MultiLineString"))
      return [];
    return [{ geo: f.geometry, name }];
  });
  return launches.map((l) => {
    const pt = point([l.ll[1], l.ll[0]]);
    let lake: (typeof lakes)[number] | undefined;
    let lakeM = Infinity;
    if (!l.whitewater)
      for (const k of lakes) {
        const m = Math.max(0, pointToPolygonDistance(pt, k.geo, { units: "meters" }));
        if (m <= P.flatwaterWithinM && m < lakeM) [lake, lakeM] = [k, m];
      }
    // NHD's lakes stop short of some dam pools; the launch's own name or a known pool still says flatwater (#350).
    const still = lake ? null : flatwaterByName(l);
    let river: string | undefined;
    if (!lake && !still) {
      let best = Infinity;
      for (const r of rivers) {
        const m = pointToLineDistance(pt, r.geo.type === "LineString" ? r.geo : lineOfMulti(r.geo), {
          units: "meters",
        });
        if (m <= P.riverWithinM && m < best) [river, best] = [r.name, m];
      }
    }
    const waterName = lake ? lake.name : still ? still.waterName : river;
    const name = l.name ?? (waterName ? `${waterName} access` : "Boat launch");
    return {
      kind: "launch" as const,
      id: l.id,
      name,
      ll: l.ll,
      src: l.src,
      water: lake || still ? ("flat" as const) : ("river" as const),
      ...(waterName ? { waterName } : {}),
      ...(lake ? { waterAc: Math.round(lake.ac) } : {}),
      ...(l.trail ? { trail: l.trail } : {}),
    };
  });
}

/** A multi-line's parts as one line, for the distance to it (its nearest part is all that matters). */
function lineOfMulti(g: MultiLineString): LineString {
  return { type: "LineString", coordinates: g.coordinates.flat() };
}

/** Launches per pair of NHD queries: a whole cell's buffers at once timed NHD out (a 504, 10/25). */
const NHD_BATCH = 25;
/** The waits before each retry of an NHD query that failed (a 5xx or a timeout). */
const NHD_RETRY_MS = [15_000, 45_000, 90_000];
/**
 * The classification's whole time: past it, every batch left keeps the previous bake's launches. The second bake took
 * 5 h 46 min of a runner's 6 h, nearly all of it NHD's 504s retried (10/26); the monthly refresh also profiles the areas.
 */
const NHD_BUDGET_MS = 90 * 60_000;

/** `nhdNear`, retried on a failure after each of NHD_RETRY_MS. */
async function nhdNearRetried(...args: Parameters<typeof nhdNear>): Promise<NhdFeature[]> {
  const deps = args[4];
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let attempt = 0; ; attempt++) {
    try {
      return await nhdNear(...args);
    } catch (e) {
      if (attempt >= NHD_RETRY_MS.length) throw e;
      deps.log?.(`launches: ${String(e)}; again in ${NHD_RETRY_MS[attempt]! / 1000} s`);
      await sleep(NHD_RETRY_MS[attempt]!);
    }
  }
}

/**
 * Every launch classified, NHD_BATCH launches per pair of NHD queries. A batch NHD won't answer keeps the previous
 * bake's launches of the same ids, and is otherwise left out until the next bake; the cells it was in are returned.
 */
async function classifyAll(
  raw: readonly RawLaunch[],
  deps: BakeDeps,
): Promise<{ launches: BakedLaunch[]; unanswered: string[] }> {
  const P = SCREEN_CONSTANTS.paddling;
  const byCell = new Map<string, RawLaunch[]>();
  for (const l of raw) byCell.set(cellOf(l.ll), [...(byCell.get(cellOf(l.ll)) ?? []), l]);
  const before = new Map(
    (deps.previous?.places ?? []).flatMap((p) => (p.kind === "launch" ? [[p.id, p] as const] : [])),
  );
  const launches: BakedLaunch[] = [];
  const unanswered = new Set<string>();
  const now = deps.now ?? Date.now;
  const deadline = now() + NHD_BUDGET_MS;
  let n = 0;
  for (const [cell, inCell] of byCell) {
    for (let i = 0; i < inCell.length; i += NHD_BATCH) {
      const batch = inCell.slice(i, i + NHD_BATCH);
      const pts = batch.map((l) => l.ll);
      try {
        if (now() > deadline) throw new Error(`out of time (${NHD_BUDGET_MS / 60_000} min)`);
        const [bodies, lines] = await Promise.all([
          nhdNearRetried(
            DEFAULT_ENDPOINTS.nhdWaterbody,
            pts,
            P.flatwaterWithinM,
            "GNIS_NAME,FTYPE,AREASQKM",
            deps,
          ),
          nhdNearRetried(DEFAULT_ENDPOINTS.nhd, pts, P.riverWithinM, "GNIS_NAME", deps),
        ]);
        launches.push(...classifyLaunches(batch, bodies, lines));
      } catch (e) {
        unanswered.add(cell);
        const kept = batch.flatMap((l) => (before.has(l.id) ? [before.get(l.id)!] : []));
        launches.push(...kept);
        deps.log?.(
          `launches: cell ${cell}: ${String(e)}; ${kept.length} of ${batch.length} kept from the previous bake`,
        );
      }
    }
    deps.log?.(`launches: cell ${cell} (${++n} of ${byCell.size}), ${inCell.length} classified`);
  }
  return { launches, unanswered: [...unanswered] };
}

/** The lots within drive.parkingWithinM of any of the trailheads, deduplicated, each with what parkingFor reads. */
async function parkingNear(trailheads: readonly BakedTrailhead[], deps: BakeDeps): Promise<BakedParking[]> {
  const lots = new Map<string, BakedParking>();
  for (let i = 0; i < trailheads.length; i += PARKING_BATCH) {
    const batch = trailheads.slice(i, i + PARKING_BATCH).map((t) => t.ll);
    // parkingQuery's own timeout is a grade's; a batch of 150 needs longer.
    const ql = parkingQuery(batch).replace("[timeout:25]", "[timeout:180]");
    for (const e of await overpass(ql, deps)) {
      const ll = at(e);
      if (!ll) continue;
      const tags = e.tags ?? {};
      const id = `osm:${e.type}/${e.id}`;
      lots.set(id, {
        kind: "parking",
        id,
        ll: round6(ll),
        src: "osm",
        ...(tags.name ? { name: tags.name } : {}),
        ...(hikingTagged(tags) ? { hiking: true as const } : {}),
      });
    }
    deps.log?.(
      `parking: ${Math.min(i + PARKING_BATCH, trailheads.length)} of ${trailheads.length} trailheads`,
    );
  }
  return [...lots.values()];
}

// ---------- the official layers ----------

interface ArcFeature {
  attributes: Record<string, unknown>;
  geometry?: { x: number; y: number };
}

/** Every feature of an ArcGIS layer in the area's box, paged by resultOffset in OBJECTID order. */
async function arcgisAll(
  url: string,
  where: string,
  fields: readonly string[],
  geometry: boolean,
  box: [number, number, number, number],
  deps: BakeDeps,
): Promise<{ oid: string; features: ArcFeature[] }> {
  const meta = (await (await deps.http.fetch(`${url}?f=json`, { timeoutMs: 60_000 })).json()) as {
    objectIdField?: string;
    fields?: { name: string; type: string }[];
  };
  const oid =
    meta.objectIdField ?? meta.fields?.find((f) => f.type === "esriFieldTypeOID")?.name ?? "OBJECTID";
  const [w, s, e, n] = box;
  const out: ArcFeature[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const q = new URLSearchParams({
      where,
      geometry: JSON.stringify({ xmin: w, ymin: s, xmax: e, ymax: n, spatialReference: { wkid: 4326 } }),
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: [oid, ...fields].join(","),
      returnGeometry: String(geometry),
      outSR: "4326",
      orderByFields: oid,
      resultOffset: String(page * PAGE),
      resultRecordCount: String(PAGE),
      f: "json",
    });
    const r = await deps.http.fetch(`${url}/query`, { method: "POST", body: q, timeoutMs: 120_000 });
    if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
    const j = (await r.json()) as {
      features?: ArcFeature[];
      exceededTransferLimit?: boolean;
      error?: { message?: string };
    };
    if (j.error) throw new Error(`${new URL(url).host}: ${j.error.message ?? "error"}`);
    out.push(...(j.features ?? []));
    if (!j.exceededTransferLimit) return { oid, features: out };
  }
  throw new Error(`${new URL(url).host}: more than ${MAX_PAGES * PAGE} features`);
}

/** A layer's points as trailheads named by `nameField`, in the area. */
async function pointLayer(
  src: PlaceSource,
  url: string,
  nameField: string,
  where: string,
  box: [number, number, number, number],
  deps: BakeDeps,
): Promise<BakedTrailhead[]> {
  const { oid, features } = await arcgisAll(url, where, [nameField], true, box, deps);
  return features.flatMap((f) => {
    const name = f.attributes[nameField];
    if (!f.geometry || typeof name !== "string" || !name.trim()) return [];
    const ll: LatLon = [f.geometry.y, f.geometry.x];
    if (!inArea(ll)) return [];
    return [
      {
        kind: "trailhead" as const,
        id: `${src}:${String(f.attributes[oid])}`,
        name: readableName(name),
        ll: round6(ll),
        src,
      },
    ];
  });
}

/** TREC's trails' primary and secondary trailheads (trailheads.ts reads the same fields per grade), 0,0 dropped. */
async function trecLayer(
  url: string,
  box: [number, number, number, number],
  deps: BakeDeps,
): Promise<BakedTrailhead[]> {
  const fields = [
    "Trail_Name",
    "PrimaryTrailhead_Latitude",
    "PrimaryTrailhead_Longitude",
    "SecondaryTrailhead_Latitude",
    "SecondaryTrailhead_Longitude",
  ];
  const { oid, features } = await arcgisAll(url, "1=1", fields, false, box, deps);
  const out: BakedTrailhead[] = [];
  for (const { attributes: a } of features) {
    const name = typeof a.Trail_Name === "string" ? readableName(a.Trail_Name) : "";
    if (!name) continue;
    const heads: [string, unknown, unknown][] = [
      ["p", a.PrimaryTrailhead_Latitude, a.PrimaryTrailhead_Longitude],
      ["s", a.SecondaryTrailhead_Latitude, a.SecondaryTrailhead_Longitude],
    ];
    for (const [which, lat, lon] of heads) {
      if (lat == null || lon == null) continue;
      const ll: LatLon = [Number(lat), Number(lon)];
      if (!Number.isFinite(ll[0]) || !Number.isFinite(ll[1]) || (ll[0] === 0 && ll[1] === 0) || !inArea(ll))
        continue;
      out.push({
        kind: "trailhead",
        id: `tn-trec:${String(a[oid])}:${which}`,
        name,
        ll: round6(ll),
        src: "tn-trec",
        trec: true,
      });
    }
  }
  return out;
}

// ---------- the sources, and the bake ----------

interface SourceDef {
  id: PlaceSource;
  name: string;
  licence: string;
  attribution: string;
  url: string;
  /** A fixed list's date (RIDB_LAUNCHES): the bake doesn't fetch it. */
  fetched?: string;
}

const STATE_SRC: Record<string, PlaceSource> = {
  "VA:parks": "va-parks",
  "NC:parks": "nc-parks",
  "TN:parks": "tn-parks",
  "TN:trails": "tn-trec",
};

/** What index.json says of each source; the licences as commercial-review.md records them. */
export const SOURCE_DEFS: readonly SourceDef[] = [
  {
    id: "osm",
    name: "OpenStreetMap (supermarkets, trailheads, parking)",
    licence: "ODbL 1.0",
    attribution: "© OpenStreetMap contributors",
    url: "https://www.openstreetmap.org/copyright",
  },
  {
    id: "usfs",
    name: "US Forest Service INFRA recreation sites (trailheads)",
    licence: "Public domain (US government work)",
    attribution: "USDA Forest Service",
    url: DEFAULT_ENDPOINTS.usfsRecSites,
  },
  {
    id: "ridb",
    name: "Recreation.gov (RIDB): the Corps' and the Forest Service's boating sites missing from the others",
    licence: "Public domain (US government work: the Corps' and the Forest Service's records)",
    attribution: "Recreation.gov",
    url: RIDB_EXPORT,
    fetched: "2026-10-26",
  },
  ...STATE_SOURCES.map((s): SourceDef => ({
    id: STATE_SRC[`${s.state}:${s.kind}`]!,
    name: s.label,
    licence:
      "Published by the state for public use; redistribution terms to confirm (docs/commercial-review.md)",
    attribution: s.label,
    url: DEFAULT_ENDPOINTS.stateParks.find((u) => u.startsWith(s.prefix)) ?? s.prefix,
  })),
];

const BOX: [number, number, number, number] = [-92, 33, -74, 41];

/**
 * Bakes every source. Each official layer and each OSM cell is asked once; parking is asked around every trailhead
 * (OSM and official). A source that throws keeps its previous places.
 */
export async function bakePlaces(deps: BakeDeps): Promise<Bake> {
  const log = deps.log ?? (() => {});
  const cells = areaCells();
  log(`${cells.length} cells`);
  const got = new Map<PlaceSource, Place[]>();
  const failed: string[] = [];
  const keep = (src: PlaceSource, why: unknown) => {
    const prev = deps.previous;
    if (!prev) throw new Error(`${src} didn't answer and there's no previous bake: ${String(why)}`);
    failed.push(src);
    log(`${src}: ${String(why)}; keeping the previous bake's`);
    got.set(
      src,
      prev.places.filter((p) => p.src === src && p.kind !== "parking"),
    );
  };

  // Launches found this bake, classified once every source has answered (classifyAll).
  const raw: RawLaunch[] = [];

  // The towns, for the refresh summary only: kept from the previous bake when Overpass won't say.
  let towns = deps.previous?.index.towns;
  try {
    towns = townsOf(await overpass(TOWNS_QUERY, deps));
  } catch (e) {
    failed.push("osm towns");
    log(`towns: ${String(e)}; keeping the previous bake's`);
  }

  // OSM, a cell at a time; one cell failing fails the source (a partial OSM would read as places closing).
  try {
    const osm: Place[] = [];
    const launches: RawLaunch[] = [];
    for (const [i, cell] of cells.entries()) {
      const elements = await overpass(osmCellQuery(cell), deps);
      osm.push(...osmPlaces(elements));
      launches.push(...osmLaunches(elements));
      log(
        `osm: cell ${cell} (${i + 1} of ${cells.length}), ${osm.length} places and ${launches.length} launches so far`,
      );
    }
    got.set("osm", osm);
    raw.push(...launches);
  } catch (e) {
    keep("osm", e);
  }

  // USFS: its trailheads, and its boating sites as launches (the subtype's value as the layer has it: BOATING SITE).
  try {
    const [trailheads, boating] = await Promise.all([
      pointLayer("usfs", DEFAULT_ENDPOINTS.usfsRecSites, "site_name", "site_subtype='TRAILHEAD'", BOX, deps),
      pointLayer(
        "usfs",
        DEFAULT_ENDPOINTS.usfsRecSites,
        "site_name",
        "site_subtype LIKE '%BOAT%'",
        BOX,
        deps,
      ),
    ]);
    got.set("usfs", trailheads);
    // Their own ids: a boating site and a trailhead never share a place's id, whatever the layer's.
    raw.push(
      ...boating.map((b): RawLaunch => ({
        id: b.id.replace(/^usfs:/, "usfs:boat:"),
        ll: b.ll,
        src: "usfs",
        name: b.name,
      })),
    );
  } catch (e) {
    keep("usfs", e);
  }
  for (const s of STATE_SOURCES) {
    const src = STATE_SRC[`${s.state}:${s.kind}`]!;
    const url = DEFAULT_ENDPOINTS.stateParks.find((u) => u.startsWith(s.prefix));
    try {
      if (!url) throw new Error(`no endpoint for ${s.prefix}`);
      got.set(
        src,
        s.kind === "trails"
          ? await trecLayer(url, BOX, deps)
          : await pointLayer(src, url, s.name, s.where ?? "1=1", BOX, deps),
      );
    } catch (e) {
      keep(src, e);
    }
    log(`${src}: ${got.get(src)?.length ?? 0}`);
  }

  // Parking around every trailhead, whichever source: kept with OSM (it is OSM's).
  const trailheads = [...got.values()].flat().filter((p): p is BakedTrailhead => p.kind === "trailhead");
  let parking: BakedParking[];
  try {
    parking = await parkingNear(trailheads, deps);
  } catch (e) {
    if (!deps.previous) throw e;
    failed.push("osm parking");
    log(`parking: ${String(e)}; keeping the previous bake's`);
    parking = deps.previous.places.filter((p): p is BakedParking => p.kind === "parking");
  }

  // Each launch on its water (NHD), a batch at a time; a batch NHD won't answer keeps the previous bake's.
  const classified = await classifyAll(raw, deps);
  const launches = classified.launches;
  if (classified.unanswered.length)
    failed.push(`launch classification (NHD) in ${classified.unanswered.length} cells`);

  const all: Place[] = [...[...got.values()].flat(), ...parking, ...launches, ...RIDB_LAUNCHES];
  const byFile = new Map<string, Place[]>();
  for (const p of all) {
    const key = `${FOLDER_OF[p.src]}/${cellOf(p.ll)}`;
    byFile.set(key, [...(byFile.get(key) ?? []), p]);
  }
  const cellFiles: PlaceCell[] = [...byFile.entries()]
    .map(([key, places]) => {
      const [folder, cell] = key.split("/") as [PlaceCell["folder"], string];
      // The same place can come twice (an OSM element in two cells' boxes, on their shared edge): kept once.
      const unique = [...new Map(places.map((p) => [p.id, p])).values()].sort((a, b) =>
        a.id < b.id ? -1 : 1,
      );
      return { version: PLACES_VERSION, folder, cell, baked: deps.today, places: unique };
    })
    .sort((a, b) => (a.folder + a.cell < b.folder + b.cell ? -1 : 1));

  const fetchedOf = (id: PlaceSource) =>
    failed.includes(id)
      ? (deps.previous?.index.sources.find((s) => s.id === id)?.fetched ?? deps.today)
      : deps.today;
  const index: PlacesIndex = {
    version: PLACES_VERSION,
    baked: deps.today,
    bounds: boundsOf(cells),
    marginKm: MARGIN_KM,
    ...(towns?.length ? { towns } : {}),
    sources: SOURCE_DEFS.map((d) => ({
      ...d,
      folder: FOLDER_OF[d.id],
      fetched: d.fetched ?? fetchedOf(d.id),
      count: cellFiles.reduce(
        (t, c) => t + c.places.filter((p) => p.src === d.id && p.kind !== "parking").length,
        0,
      ),
    })),
    cells: Object.fromEntries(
      PLACE_FOLDERS.map((f) => [
        f,
        Object.fromEntries(cellFiles.filter((c) => c.folder === f).map((c) => [c.cell, c.places.length])),
      ]),
    ) as PlacesIndex["cells"],
  };
  if (failed.length) log(`kept the previous bake's: ${failed.join(", ")}`);
  return { index, cells: cellFiles, kept: failed };
}

/** OSM's named towns and cities over the baked box. */
export const TOWNS_QUERY = `[out:json][timeout:180][bbox:${BOX[1]},${BOX[0]},${BOX[3]},${BOX[2]}];node[place~"^(town|city)$"][name];out;`;

export function townsOf(elements: readonly OsmElement[]): NonNullable<PlacesIndex["towns"]> {
  return elements
    .flatMap((e) => {
      const ll = at(e);
      const name = e.tags?.name;
      return ll && name && inArea(ll) ? [{ name, ll: round6(ll) }] : [];
    })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.ll[0] - b.ll[0]));
}

function boundsOf(cells: readonly string[]): [number, number, number, number] {
  const boxes = cells.map(cellBox);
  return [
    Math.min(...boxes.map((b) => b[0])),
    Math.min(...boxes.map((b) => b[1])),
    Math.max(...boxes.map((b) => b[2])),
    Math.max(...boxes.map((b) => b[3])),
  ];
}
