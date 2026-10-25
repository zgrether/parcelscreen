/**
 * The two network sources of map search: parcel numbers within the region (each state service; UX part 2 PR 4, it
 * was the counties in view), and places from Photon, within the region too. External JSON is parsed with Zod (CLAUDE.md); requests go through lib/http.
 */
import { z } from "zod";
import { CancelledError, type HttpClient } from "../http";
import { stateOf, whereFor } from "../geo/parcelFields";
import { envelopeParams, type Bbox } from "./region";
import { taxCardId } from "../geo/parcels";
import { fieldsFor } from "../geo/parcelTiles";
import type { LatLon } from "../geo/types";
import { PARCEL_SERVICE_TIMEOUTS } from "@/lib/geo/serviceStatus";
import { idPattern, matchesId, parcelNumberWhere, taxCardQuery, taxCardWhere } from "./query";

export interface ParcelHit {
  source: string;
  /** The outline's fields (object id, parcel number, county): enough to fetch the full record. */
  props: Record<string, unknown>;
  id: string;
  county: string;
  /** Where to look: the middle of its (simplified) outline. */
  centre: LatLon;
}

/** At most this many parcel numbers are listed. */
export const MAX_PARCEL_HITS = 8;

const Position = z.array(z.number());
const ParcelPage = z.object({
  features: z
    .array(
      z.object({
        properties: z.record(z.string(), z.unknown()).nullable(),
        geometry: z
          .object({
            type: z.string(),
            coordinates: z.union([z.array(z.array(Position)), z.array(z.array(z.array(Position)))]),
          })
          .nullable(),
      }),
    )
    .optional(),
  error: z.object({ message: z.string().optional() }).optional(),
});

/** The middle of a geometry's bounding box (outlines are simplified; this only aims the map). */
function middle(coords: unknown): LatLon | null {
  const pts: number[][] = [];
  const walk = (c: unknown) => {
    if (Array.isArray(c) && typeof c[0] === "number") pts.push(c as number[]);
    else if (Array.isArray(c)) c.forEach(walk);
  };
  walk(coords);
  if (!pts.length) return null;
  const xs = pts.map((p) => p[0]!),
    ys = pts.map((p) => p[1]!);
  return [(Math.min(...ys) + Math.max(...ys)) / 2, (Math.min(...xs) + Math.max(...xs)) / 2];
}

/**
 * Where parcel numbers are asked: per county per service (the counties a map draws), or (UX part 2 PR 4) per service
 * within a box, one ask each, which is what the map's search does now.
 */
export type ParcelScope =
  ReadonlyMap<string, ReadonlySet<string>> | { readonly sources: readonly string[]; readonly bbox: Bbox };

/** "Grayson Co., VA" (the audit's P-1): the county's name as the service gives it, and the state. */
export function countyLabel(source: string, name: string): string {
  const state = stateOf(source);
  if (!name || /^\d+$/.test(name)) return name;
  const base = name
    .replace(/\s+county$/i, "")
    .toLowerCase()
    .replace(/(^|[\s-])\p{L}/gu, (c) => c.toUpperCase());
  return `${base} Co.${state ? `, ${state}` : ""}`;
}

/**
 * Parcel numbers starting with the query (separators ignored) in the given scope: one query per county per service,
 * or one per service within the region's box, run in parallel. Tennessee's are asked by control map, group and parcel (taxCardQuery) and named in
 * the tax card's form; a parcel drawn as several features is listed once. A county that fails is skipped. Sorted by
 * number, at most MAX_PARCEL_HITS.
 */
export async function searchParcelNumbers(
  http: HttpClient,
  scope: ParcelScope,
  query: string,
  signal?: AbortSignal,
): Promise<ParcelHit[]> {
  const pattern = idPattern(query);
  if (!pattern) return [];
  const taxCard = taxCardQuery(query);
  const box = scope instanceof Map ? null : (scope as { bbox: Bbox }).bbox;
  const within = box ? envelopeParams(box) : {};
  const ask = async (source: string, q: URLSearchParams) => {
    const r = await http.fetch(`${source}/query`, {
      method: "POST",
      body: q,
      ...PARCEL_SERVICE_TIMEOUTS,
      ...(signal ? { signal } : {}),
    });
    if (!r.ok) return [];
    const page = ParcelPage.safeParse(await r.json());
    return !page.success || page.data.error ? [] : (page.data.features ?? []);
  };
  const outline = {
    returnGeometry: "true",
    outSR: "4326",
    maxAllowableOffset: "0.0002",
    geometryPrecision: "5",
  };

  // Tennessee's where clause is exact: one ask, outlines and all.
  const byTaxCard = async (source: string, code: string | null): Promise<ParcelHit[]> => {
    const f = fieldsFor(source);
    const features = await ask(
      source,
      new URLSearchParams({
        where: whereFor(source, taxCardWhere(f.county, code, taxCard!)),
        outFields: [f.oid, f.id, f.county, "CMAP", "GP", "PARCEL"].join(","),
        ...within,
        ...outline,
        orderByFields: f.id,
        resultRecordCount: "25",
        f: "geojson",
      }),
    );
    return features.flatMap((ft) => {
      const props = ft.properties ?? {};
      const id = taxCardId(props) ?? "";
      const centre = middle(ft.geometry?.coordinates);
      return id && centre
        ? [{ source, props, id, county: countyLabel(source, String(props[f.county] ?? code ?? "")), centre }]
        : [];
    });
  };

  // The others' LIKE pattern over-matches, many times over ("35-3" asks for '3%5%3%': 3-153, 30-35, 31-53… sort ahead
  // of it). The UX audit's B-3: 25 outlines held only those, the filter dropped them all, and "35-3" wasn't found with
  // Floyd in view. So first the numbers alone, as many as the service gives; the true matches kept; then their
  // outlines, by object id.
  const byPrefix = async (source: string, code: string | null): Promise<ParcelHit[]> => {
    const f = fieldsFor(source);
    const fields = [
      f.oid,
      f.id,
      f.county,
      ...(f.altId ? [f.altId] : []),
      ...(f.countyName ? [f.countyName] : []),
    ];
    const numbers = await ask(
      source,
      new URLSearchParams({
        where: whereFor(source, parcelNumberWhere(f, code, pattern)),
        outFields: fields.join(","),
        ...within,
        returnGeometry: "false",
        orderByFields: f.id,
        resultRecordCount: String(f.maxRecords),
        f: "geojson",
      }),
    );
    const found = numbers
      .flatMap((ft) => {
        const props = ft.properties ?? {};
        const id = String(props[f.id] ?? "");
        const alt = f.altId ? String(props[f.altId] ?? "") : "";
        // The listing's number when that's what matched: "63-A-62 (6273)".
        if (id && matchesId(id, query)) return [{ props, id }];
        if (alt && matchesId(alt, query)) return [{ props, id: id ? `${alt} (${id})` : alt }];
        return [];
      })
      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
      .slice(0, MAX_PARCEL_HITS);
    if (!found.length) return [];
    const oids = found.map((x) => Number(x.props[f.oid])).filter(Number.isFinite);
    const outlines = await ask(
      source,
      new URLSearchParams({
        where: whereFor(source, `${f.oid} IN (${oids.join(",")})`),
        outFields: f.oid,
        ...outline,
        f: "geojson",
      }),
    );
    const centres = new Map(
      outlines.map((ft) => [Number(ft.properties?.[f.oid]), middle(ft.geometry?.coordinates)]),
    );
    return found.flatMap(({ props, id }) => {
      const centre = centres.get(Number(props[f.oid]));
      const county = countyLabel(
        source,
        String((f.countyName && props[f.countyName]) || props[f.county] || code || ""),
      );
      return centre ? [{ source, props, id, county, centre }] : [];
    });
  };

  const asks: [string, string | null][] =
    scope instanceof Map
      ? [...scope].flatMap(([source, codes]) => [...codes].map((code): [string, string] => [source, code]))
      : (scope as { sources: readonly string[] }).sources.map((source): [string, null] => [source, null]);
  const jobs = asks.map(([source, code]) =>
    (async (): Promise<ParcelHit[]> => {
      const byMap = fieldsFor(source).search === "mapGroupParcel";
      if (byMap && !taxCard) return [];
      try {
        return await (byMap ? byTaxCard(source, code) : byPrefix(source, code));
      } catch (e) {
        if (e instanceof CancelledError) throw e;
        return [];
      }
    })(),
  );
  // A parcel drawn as several features (Tennessee, step 2) is one hit: the first by object id.
  const seen = new Set<string>();
  const hits = (await Promise.all(jobs)).flat().filter((h) => {
    const k = `${h.source}|${String(h.props[fieldsFor(h.source).id] ?? h.id)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return hits
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
    .slice(0, MAX_PARCEL_HITS);
}

export interface PlaceHit {
  label: string;
  /** "Floyd, Virginia" */
  detail: string;
  ll: LatLon;
  /** [west, north, east, south], when Photon gives an extent. */
  extent?: [number, number, number, number];
}

const PhotonResponse = z.object({
  features: z.array(
    z.object({
      geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
      properties: z
        .object({
          name: z.string().optional(),
          street: z.string().optional(),
          city: z.string().optional(),
          county: z.string().optional(),
          state: z.string().optional(),
          extent: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
        })
        .passthrough(),
    }),
  ),
});

/** Places matching the query from Photon, nearest the map's centre first (Photon's own location bias). */
export async function searchPlaces(
  http: HttpClient,
  photonUrl: string,
  query: string,
  near: LatLon,
  signal?: AbortSignal,
  /** Places within this box only (UX part 2 PR 4: the region, so "Floyd" doesn't find Poland). */
  bbox?: Bbox,
): Promise<PlaceHit[]> {
  const within = bbox ? `&bbox=${bbox.join(",")}` : "";
  const u = `${photonUrl}?q=${encodeURIComponent(query)}&lat=${near[0]}&lon=${near[1]}&limit=5&lang=en${within}`;
  const r = await http.fetch(u, signal ? { signal } : {});
  if (!r.ok) throw new Error(`Photon ${r.status}`);
  const page = PhotonResponse.safeParse(await r.json());
  if (!page.success) throw new Error("Photon: unexpected response");
  return page.data.features.flatMap((f) => {
    const p = f.properties;
    const label = p.name ?? p.street;
    if (!label) return [];
    const [lon, lat] = f.geometry.coordinates;
    return [
      {
        label,
        detail: [p.city, p.county, p.state].filter((x, i, a) => x && a.indexOf(x) === i).join(", "),
        ll: [lat, lon] as LatLon,
        ...(p.extent ? { extent: p.extent } : {}),
      },
    ];
  });
}
