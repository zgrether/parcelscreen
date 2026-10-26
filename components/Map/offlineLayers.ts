/**
 * Which map requests the offline cache keeps (step 14e, docs/plans/step-14e-offline.md §2): one table, read by the
 * service worker (what it stores as you look) and by Save offline (what it downloads), so the two can't disagree. Each
 * layer's decision comes from its provider's terms (docs/commercial-review.md). Esri's are never kept.
 *
 * Kept beside the sources it describes: the URL templates are style.ts's, lidarStyle.ts's, terrainStyle.ts's and
 * roadsStyle.ts's own. Matching is by host and path, and Slope's by its rendering rule, so a grade's own requests (the
 * 3DEP elevation export, soils, flood, the atlas's binary tiles) never match.
 */
import { DEFAULT_USER_CONFIG } from "@/lib/screen/config";
import { ELEVATION_TILES_CACHED } from "@/lib/offline/config";
import { tileOfBbox, tileUrl, type LonLatBox } from "@/lib/offline/tiles";
import { RELIEF_MAX_ZOOM, RELIEF_TILES, LIDAR_MAX_ZOOM, LIDAR_MIN_ZOOM, slopeTiles } from "./lidarStyle";
import { ROADS_TILEJSON } from "./roadsStyle";
import {
  lightPollutionTiles,
  NC_ORTHO,
  STATE_ORTHO_BOUNDS,
  TN_ORTHO,
  USGS_IMAGERY,
  USGS_TOPO,
  VA_ORTHO,
} from "./style";
import { TERRARIUM_MAXZOOM, TERRARIUM_TILES } from "./terrainStyle";

export type OfflineLayerId =
  | "usgs-imagery"
  | "usgs-topo"
  | "esri"
  | "state-tn"
  | "state-nc"
  | "state-va"
  | "slope"
  | "relief"
  | "terrarium"
  | "roads-tilejson"
  | "roads"
  | "light-pollution"
  | "parcel-lines"
  | "places";

/** What a stored answer must be: an ArcGIS error comes back as JSON with a 200, and is never kept as a tile. */
export type Expect = "image" | "json" | "any";

export interface OfflineLayer {
  id: OfflineLayerId;
  /** Never kept when false (Esri's terms). */
  kept: boolean;
  /** An elevation raster (Mapterhorn, Terrarium): kept only once §12 Q1 allows it. */
  elevation: boolean;
  expect: Expect;
  /** The network first, the cache only when offline: the TileJSON (it names the week's tile set) and the places. */
  networkFirst: boolean;
  /** The URL template, for Save offline and for a box URL's key. */
  template: string | null;
  /** Save offline's zooms, or null when Save offline doesn't download it tile by tile. */
  save: { minZoom: number; maxZoom: number } | null;
  /** Only within this box (a state's ortho). */
  bounds: LonLatBox | null;
  /** A tile's usual weight, for Save offline's estimate until the device has its own average. */
  typicalBytes: number;
  match(url: URL, sameOrigin: boolean): boolean;
}

const KB = 1024;

const box = ([west, south, east, north]: [number, number, number, number]): LonLatBox => ({
  west,
  south,
  east,
  north,
});

const atPath =
  (host: string, path: string | RegExp) =>
  (url: URL): boolean =>
    url.host === host && (typeof path === "string" ? url.pathname.startsWith(path) : path.test(url.pathname));

/** A template's path up to its first placeholder: "/arcgis/rest/services/USGSTopo/MapServer/tile/". */
const prefix = (template: string): string => {
  const path = new URL(`${template.slice(0, template.indexOf("{"))}_`).pathname;
  return path.slice(0, -1);
};

const SLOPE = new URL(slopeTiles().replace("{bbox-epsg-3857}", "0"));
const SLOPE_RULE = SLOPE.searchParams.get("renderingRule");
const LP_TILES = lightPollutionTiles(
  DEFAULT_USER_CONFIG.endpoints.lpAtlasTiles,
  DEFAULT_USER_CONFIG.endpoints.lpAtlasYear,
);
const PARCEL_QUERIES = DEFAULT_USER_CONFIG.endpoints.parcels.map((s) => new URL(`${s}/query`));

const layer = (
  l: Partial<OfflineLayer> & Pick<OfflineLayer, "id" | "match" | "typicalBytes">,
): OfflineLayer => ({
  kept: true,
  elevation: false,
  expect: "image",
  networkFirst: false,
  template: null,
  save: null,
  bounds: null,
  ...l,
});

const xyz = (
  id: OfflineLayerId,
  template: string,
  save: OfflineLayer["save"],
  typicalBytes: number,
  extra: Partial<OfflineLayer> = {},
): OfflineLayer => {
  const host = new URL(template.replace(/\{[^}]+\}/g, "0")).host;
  return layer({ id, template, save, typicalBytes, match: atPath(host, prefix(template)), ...extra });
};

export const OFFLINE_LAYERS: readonly OfflineLayer[] = [
  xyz("usgs-imagery", USGS_IMAGERY, { minZoom: 12, maxZoom: 16 }, 25 * KB),
  xyz("usgs-topo", USGS_TOPO, { minZoom: 12, maxZoom: 16 }, 20 * KB),
  layer({
    id: "esri",
    kept: false,
    typicalBytes: 0,
    match: (u) => u.host === "server.arcgisonline.com" || u.host === "services.arcgisonline.com",
  }),
  xyz("state-tn", TN_ORTHO, { minZoom: 12, maxZoom: 18 }, 30 * KB, { bounds: box(STATE_ORTHO_BOUNDS.tn) }),
  xyz("state-nc", NC_ORTHO, { minZoom: 12, maxZoom: 18 }, 30 * KB, { bounds: box(STATE_ORTHO_BOUNDS.nc) }),
  layer({
    id: "state-va",
    template: VA_ORTHO,
    save: { minZoom: 12, maxZoom: 18 },
    bounds: box(STATE_ORTHO_BOUNDS.va),
    typicalBytes: 60 * KB,
    match: atPath(new URL(VA_ORTHO.replace(/\{[^}]+\}/g, "0")).host, "/arcgis/rest/services/VBMP_Imagery/"),
  }),
  layer({
    id: "slope",
    template: slopeTiles(),
    save: { minZoom: LIDAR_MIN_ZOOM, maxZoom: LIDAR_MAX_ZOOM },
    typicalBytes: 15 * KB,
    match: (u) =>
      u.host === SLOPE.host &&
      u.pathname === SLOPE.pathname &&
      u.searchParams.get("renderingRule") === SLOPE_RULE,
  }),
  xyz("relief", RELIEF_TILES, { minZoom: LIDAR_MIN_ZOOM, maxZoom: RELIEF_MAX_ZOOM }, 80 * KB, {
    elevation: true,
  }),
  xyz("terrarium", TERRARIUM_TILES, { minZoom: 12, maxZoom: TERRARIUM_MAXZOOM }, 100 * KB, {
    elevation: true,
  }),
  layer({
    id: "roads-tilejson",
    expect: "json",
    networkFirst: true,
    typicalBytes: 2 * KB,
    match: (u) => u.href === ROADS_TILEJSON,
  }),
  layer({
    id: "roads",
    expect: "any",
    typicalBytes: 40 * KB,
    match: atPath(new URL(ROADS_TILEJSON).host, "/planet/"),
  }),
  // Any year's image tiles (the map may fall back a year), never the grade's binary tiles beside them.
  xyz("light-pollution", LP_TILES, { minZoom: 8, maxZoom: 8 }, 300 * KB, {
    match: atPath(new URL(LP_TILES.replace(/\{[^}]+\}/g, "0")).host, "/astronomy/image_tiles/"),
  }),
  layer({
    id: "parcel-lines",
    expect: "json",
    typicalBytes: 150 * KB,
    match: (u) => PARCEL_QUERIES.some((q) => u.host === q.host && u.pathname === q.pathname),
  }),
  layer({
    id: "places",
    expect: "json",
    // The network first: a grade reads these too, and the monthly refresh rewrites them in place.
    networkFirst: true,
    typicalBytes: 30 * KB,
    match: (u, sameOrigin) => sameOrigin && u.pathname.startsWith("/places/"),
  }),
];

/** The basemaps whose tiles are never kept (Esri's); Map layers marks them "not kept offline". */
export const BASEMAPS_NOT_KEPT: ReadonlySet<string> = new Set(["esri", "streets"]);

/** The layer a request belongs to, or null when it isn't a map tile at all. */
export function offlineLayerFor(url: URL, sameOrigin: boolean): OfflineLayer | null {
  return OFFLINE_LAYERS.find((l) => l.match(url, sameOrigin)) ?? null;
}

/** Whether this layer's answers may be stored on the device now. */
export const isKept = (l: OfflineLayer): boolean => l.kept && (!l.elevation || ELEVATION_TILES_CACHED);

/**
 * A request's key in the cache, or null when it shouldn't be stored:
 * - a box URL by its tile (the canonical URL filled from the template);
 * - a parcel-line query (a POST) by its URL and its sorted form body, and only a tile's envelope query, never a grade's
 *   own lookups;
 * - anything else by its URL.
 */
export function tileCacheKey(l: OfflineLayer, url: URL, body?: string): string | null {
  if (l.template?.includes("{bbox-epsg-3857}")) {
    const bbox = url.searchParams.get("bbox");
    const t = bbox ? tileOfBbox(bbox) : null;
    return t ? tileUrl(l.template, t) : null;
  }
  if (l.id === "parcel-lines") {
    if (body === undefined) return null;
    const q = new URLSearchParams(body);
    if (q.get("geometryType") !== "esriGeometryEnvelope" || !q.has("maxAllowableOffset")) return null;
    q.sort();
    return `${url.origin}${url.pathname}?${q.toString()}`;
  }
  return url.href;
}
