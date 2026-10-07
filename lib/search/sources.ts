/**
 * The two network sources of map search: parcel numbers within the counties in view (each state service),
 * and places from Photon. External JSON is parsed with Zod (CLAUDE.md); requests go through lib/http.
 */
import { z } from "zod";
import { CancelledError, type HttpClient } from "../http";
import { fieldsFor } from "../geo/parcelTiles";
import type { LatLon } from "../geo/types";
import { PARCEL_SERVICE_TIMEOUTS } from "@/lib/geo/serviceStatus";
import { idPattern, matchesId, parcelNumberWhere } from "./query";

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
 * Parcel numbers starting with the query (separators ignored) in the given counties: one query per county
 * per service, run in parallel. A county that fails is skipped. Sorted by number, at most MAX_PARCEL_HITS.
 */
export async function searchParcelNumbers(
  http: HttpClient,
  counties: ReadonlyMap<string, ReadonlySet<string>>,
  query: string,
  signal?: AbortSignal,
): Promise<ParcelHit[]> {
  const pattern = idPattern(query);
  if (!pattern) return [];
  const jobs = [...counties].flatMap(([source, codes]) =>
    [...codes].map(async (code): Promise<ParcelHit[]> => {
      const f = fieldsFor(source);
      const q = new URLSearchParams({
        where: parcelNumberWhere(f, code, pattern),
        outFields: [f.oid, f.id, f.county].join(","),
        returnGeometry: "true",
        outSR: "4326",
        maxAllowableOffset: "0.0002",
        geometryPrecision: "5",
        orderByFields: f.id,
        resultRecordCount: "25",
        f: "geojson",
      });
      try {
        const r = await http.fetch(`${source}/query`, {
          method: "POST",
          body: q,
          ...PARCEL_SERVICE_TIMEOUTS,
          ...(signal ? { signal } : {}),
        });
        if (!r.ok) return [];
        const page = ParcelPage.safeParse(await r.json());
        if (!page.success || page.data.error) return [];
        return (page.data.features ?? []).flatMap((ft) => {
          const props = ft.properties ?? {};
          const id = String(props[f.id] ?? "");
          const centre = middle(ft.geometry?.coordinates);
          if (!id || !centre || !matchesId(id, query)) return [];
          return [{ source, props, id, county: String(props[f.county] ?? code), centre }];
        });
      } catch (e) {
        if (e instanceof CancelledError) throw e;
        return [];
      }
    }),
  );
  const hits = (await Promise.all(jobs)).flat();
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
): Promise<PlaceHit[]> {
  const u = `${photonUrl}?q=${encodeURIComponent(query)}&lat=${near[0]}&lon=${near[1]}&limit=5&lang=en`;
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
