/**
 * The shaded-relief candidates for Lidar terrain (step 14c plan §3; owner, 10/25: judge them on detail, first-view
 * speed, terms and coverage). Shared by the timing tool (test/tools/lidar-tiles.test.ts) and the comparison shots
 * (screenshots/lidar-compare.spec.ts), so both judge the same services. Every request goes through the `fetch` given:
 * the tool's live one, or Node's in the screenshot runner.
 *
 * Kinds:
 * - "raster": image tiles drawn as they come (USGS 3DEP's exportImage with its hillshade rule, as built; Esri's and
 *   USGS's cached hillshades; a state's relief service, when it has one);
 * - "dem": elevation tiles the app would shade itself with MapLibre's hillshade (USGS 3DEP's own elevation through
 *   exportImage, decoded from 32-bit GeoTIFF to Terrarium; Mapterhorn's Terrarium tiles, built from 3DEP).
 */
import { LIDAR_SERVICE, lidarTiles } from "@/components/Map/lidarStyle";

/** The 3DEP image service itself (LIDAR_SERVICE is its exportImage). */
const DEP_SERVICE = LIDAR_SERVICE.replace(/\/exportImage$/, "");

export const ORIGIN = 20037508.342789244;

/** A tile's box in Web Mercator metres, as MapLibre writes {bbox-epsg-3857}. */
export function tileBox(x: number, y: number, z: number): string {
  const size = (2 * ORIGIN) / 2 ** z;
  const minX = -ORIGIN + x * size,
    maxY = ORIGIN - y * size;
  return [minX, maxY - size, minX + size, maxY].join(",");
}

export function tileOf(lat: number, lon: number, z: number): [number, number] {
  const n = 2 ** z;
  const r = (lat * Math.PI) / 180;
  return [
    Math.floor(((lon + 180) / 360) * n),
    Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n),
  ];
}

export interface Candidate {
  id: string;
  label: string;
  kind: "raster" | "dem";
  /** A tile's URL; for exportImage services, built from the tile's box. */
  url: (z: number, x: number, y: number) => string;
  size: 256 | 512;
  /** The deepest zoom it has tiles for; MapLibre overzooms past it. */
  maxzoom: number;
  /** Rendered on request (exportImage), so a first view is the server's work, not a cache's. */
  dynamic: boolean;
  /** Where its tiles exist: "all" or a state's code. */
  covers: "all" | "VA" | "NC" | "TN";
  /** The service's description (`?f=json`), for its levels, copyright and export rule. */
  about?: string;
  /** What it's built from, as its publisher says (filled in from the probes where they can say more). */
  source: string;
}

const ESRI_HILLSHADE =
  "https://services.arcgisonline.com/arcgis/rest/services/Elevation/World_Hillshade/MapServer";
const USGS_SHADED = "https://basemap.nationalmap.gov/arcgis/rest/services/USGSShadedReliefOnly/MapServer";

/** USGS 3DEP's raw elevation for a tile: 32-bit floats, metres, as a GeoTIFF (the app would shade it). */
export function demTileUrl(z: number, x: number, y: number, extra = ""): string {
  const q = new URLSearchParams({
    bbox: tileBox(x, y, z),
    bboxSR: "3857",
    imageSR: "3857",
    size: "256,256",
    format: "tiff",
    pixelType: "F32",
    interpolation: "RSP_BilinearInterpolation",
    f: "image",
  });
  return `${LIDAR_SERVICE}?${q}${extra}`;
}

export const BASE_CANDIDATES: readonly Candidate[] = [
  {
    id: "3dep-relief",
    label: "USGS 3DEP exportImage, shaded (as built)",
    kind: "raster",
    url: (z, x, y) => lidarTiles("relief").replace("{bbox-epsg-3857}", tileBox(x, y, z)),
    size: 256,
    maxzoom: 18,
    dynamic: true,
    covers: "all",
    about: DEP_SERVICE,
    source: "3DEP best available: 1 m lidar DEM where flown, else 1/3 arc-second (10 m)",
  },
  {
    id: "esri-hillshade",
    label: "Esri World Hillshade (cached)",
    kind: "raster",
    url: (z, x, y) => `${ESRI_HILLSHADE}/tile/${z}/${y}/${x}`,
    size: 256,
    maxzoom: 16,
    dynamic: false,
    covers: "all",
    about: ESRI_HILLSHADE,
    source: "Esri's compilation; 3DEP 1 m lidar in select US areas, to about 1:9k (zoom 16)",
  },
  {
    id: "usgs-shaded",
    label: "USGS Shaded Relief (cached)",
    kind: "raster",
    url: (z, x, y) => `${USGS_SHADED}/tile/${z}/${y}/${x}`,
    size: 256,
    maxzoom: 16,
    dynamic: false,
    covers: "all",
    about: USGS_SHADED,
    source: "3DEP at large and medium scales (1:9,028 and smaller), resolution not stated",
  },
  {
    id: "3dep-dem",
    label: "In the app, from USGS 3DEP elevation (exportImage, 32-bit)",
    kind: "dem",
    url: (z, x, y) => demTileUrl(z, x, y),
    size: 256,
    maxzoom: 18,
    dynamic: true,
    covers: "all",
    about: DEP_SERVICE,
    source: "3DEP best available: 1 m lidar DEM where flown",
  },
  {
    id: "mapterhorn",
    label: "In the app, from Mapterhorn's elevation tiles (Terrarium, from 3DEP)",
    kind: "dem",
    url: (z, x, y) => `https://tiles.mapterhorn.com/${z}/${x}/${y}.webp`,
    size: 512,
    maxzoom: 16,
    dynamic: false,
    covers: "all",
    source:
      "3DEP (USA: 10 m countrywide, 1 m in part), resampled to 512 px tiles to zoom 16 (1.2 m at 36° N)",
  },
];

/** The states' GIS servers, searched for a lidar relief service (owner: "VGIN's and NC OneMap's, if they exist"). */
export const STATE_SERVERS: readonly { state: "VA" | "NC" | "TN"; name: string; root: string }[] = [
  { state: "VA", name: "VGIN", root: "https://vginmaps.vdem.virginia.gov/arcgis/rest/services" },
  { state: "NC", name: "NC OneMap", root: "https://services.nconemap.gov/secure/rest/services" },
  { state: "TN", name: "TNMap", root: "https://tnmap.tn.gov/arcgis/rest/services" },
];

const RELIEF = /hillshade|shaded|relief|lidar|elev|\bdem|terrain/i;

export interface FoundService {
  state: "VA" | "NC" | "TN";
  server: string;
  url: string;
  type: string;
  cached: boolean;
  wkid: number | null;
  maxLevel: number | null;
  pixelSize: number | null;
  functions: string[];
  copyright: string;
  exportTiles: boolean | null;
  description: string;
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

async function json(f: Fetch, url: string): Promise<Record<string, unknown> | null> {
  try {
    const r = await f(`${url}${url.includes("?") ? "&" : "?"}f=json`, {
      signal: AbortSignal.timeout(60_000),
    });
    if (!r.ok) return null;
    return (await r.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const plain = (s: unknown) =>
  String(s ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Every MapServer and ImageServer whose name says relief, lidar or elevation, in a server's root and its folders. */
export async function findStateServices(f: Fetch, log: string[] = []): Promise<FoundService[]> {
  const found: FoundService[] = [];
  for (const s of STATE_SERVERS) {
    const root = await json(f, s.root);
    if (!root) {
      log.push(`${s.name}: the services directory didn't answer`);
      continue;
    }
    const folders = ((root.folders as string[] | undefined) ?? []).filter(
      (x) => RELIEF.test(x) || /base|imagery/i.test(x),
    );
    const services: { name: string; type: string }[] = [
      ...((root.services as { name: string; type: string }[]) ?? []),
    ];
    for (const folder of folders) {
      const j = await json(f, `${s.root}/${folder}`);
      services.push(...((j?.services as { name: string; type: string }[]) ?? []));
    }
    const relief = services.filter((x) => RELIEF.test(x.name) && /MapServer|ImageServer/.test(x.type));
    log.push(
      `${s.name}: ${services.length} services in the root and ${folders.length} folders; relief-named: ${relief.map((x) => `${x.name} (${x.type})`).join(", ") || "none"}`,
    );
    for (const svc of relief) {
      const url = `${s.root}/${svc.name}/${svc.type}`;
      const j = await json(f, url);
      if (!j) continue;
      const sr = (j.spatialReference ??
        (j.tileInfo as Record<string, unknown> | undefined)?.spatialReference) as
        { latestWkid?: number; wkid?: number } | undefined;
      const lods = ((j.tileInfo as { lods?: { level: number }[] } | undefined)?.lods ?? []).map(
        (l) => l.level,
      );
      found.push({
        state: s.state,
        server: s.name,
        url,
        type: svc.type,
        cached: j.singleFusedMapCache === true,
        wkid: sr?.latestWkid ?? sr?.wkid ?? null,
        maxLevel: lods.length ? Math.max(...lods) : null,
        pixelSize: typeof j.pixelSizeX === "number" ? j.pixelSizeX : null,
        functions: ((j.rasterFunctionInfos as { name: string }[] | undefined) ?? []).map((r) => r.name),
        copyright: plain(j.copyrightText),
        exportTiles: typeof j.exportTilesAllowed === "boolean" ? j.exportTilesAllowed : null,
        description: plain(j.description ?? j.serviceDescription).slice(0, 300),
      });
    }
  }
  return found;
}

/**
 * A state's service as a candidate, when it can be drawn on the map: a cached Web Mercator hillshade (its tiles), or an
 * image service with a hillshade raster function, or one that is itself a hillshade (exportImage per tile).
 */
export function stateCandidate(s: FoundService): Candidate | null {
  const mercator = s.wkid === 3857 || s.wkid === 102100;
  const name = s.url.split("/rest/services/")[1]!;
  const base = { covers: s.state, about: s.url, size: 256 as const };
  if (s.type === "MapServer" && s.cached && mercator && /hillshade|shaded|relief/i.test(s.url))
    return {
      ...base,
      id: `${s.state.toLowerCase()}-${name.replace(/\W+/g, "-").toLowerCase()}`,
      label: `${s.server} ${name} (cached)`,
      kind: "raster",
      url: (z, x, y) => `${s.url}/tile/${z}/${y}/${x}`,
      maxzoom: s.maxLevel ?? 18,
      dynamic: false,
      source: s.description || s.copyright || "not stated",
    };
  if (s.type === "ImageServer") {
    const fn = s.functions.find((f) => /hillshade/i.test(f));
    const isShade = /hillshade|shaded|relief/i.test(s.url);
    if (!fn && !isShade) return null;
    return {
      ...base,
      id: `${s.state.toLowerCase()}-${name.replace(/\W+/g, "-").toLowerCase()}`,
      label: `${s.server} ${name}${fn ? `, ${fn}` : ""} (exportImage)`,
      kind: "raster",
      url: (z, x, y) => {
        const q = new URLSearchParams({
          bbox: tileBox(x, y, z),
          bboxSR: "3857",
          imageSR: "3857",
          size: "256,256",
          format: "png",
          f: "image",
          ...(fn ? { renderingRule: JSON.stringify({ rasterFunction: fn }) } : {}),
        });
        return `${s.url}/exportImage?${q}`;
      },
      maxzoom: 18,
      dynamic: true,
      source: `${s.pixelSize ? `${s.pixelSize} map units a pixel; ` : ""}${s.description || s.copyright || "not stated"}`,
    };
  }
  return null;
}

/** The comparison's spots: the red-gate line on Mud Creek (VA), Roan's parcel (TN), and a spot in NC for its service. */
export const SPOTS = [
  {
    id: "mud-creek-red-gate",
    label: "Mud Creek's red-gate line, VA",
    ll: [36.5836, -81.5615] as [number, number],
    state: "VA",
  },
  { id: "roan", label: "Roan, TN", ll: [36.1867, -82.0752] as [number, number], state: "TN" },
  {
    id: "nc-bakersville",
    label: "Near Bakersville, NC (for NC OneMap)",
    ll: [36.0156, -82.159] as [number, number],
    state: "NC",
  },
] as const;

/** Points across the three states for the coverage check. */
export const COVERAGE_POINTS: readonly { label: string; state: "VA" | "NC" | "TN"; ll: [number, number] }[] =
  [
    { label: "Mud Creek (Grayson)", state: "VA", ll: [36.5836, -81.5615] },
    { label: "Macks Mountain (Floyd)", state: "VA", ll: [36.93492, -80.63139] },
    { label: "Shenandoah Valley", state: "VA", ll: [38.5, -78.85] },
    { label: "Richmond", state: "VA", ll: [37.54, -77.43] },
    { label: "Bakersville", state: "NC", ll: [36.0156, -82.159] },
    { label: "Asheville", state: "NC", ll: [35.6, -82.55] },
    { label: "Raleigh", state: "NC", ll: [35.78, -78.64] },
    { label: "Roan (Carter)", state: "TN", ll: [36.1867, -82.0752] },
    { label: "Knoxville", state: "TN", ll: [35.96, -83.92] },
    { label: "Memphis", state: "TN", ll: [35.15, -90.05] },
  ];

/** 3DEP's own index of what it holds: which layers say 1 m. */
export const DEP_INDEX = "https://index.nationalmap.gov/arcgis/rest/services/3DEPElevationIndex/MapServer";

/** Terrarium encoding of metres, as MapLibre's raster-dem reads it: (R × 256 + G + B / 256) − 32768. */
export function terrarium(heights: ArrayLike<number>, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const v = Number.isFinite(heights[i]!) && heights[i]! > -1000 ? heights[i]! + 32768 : 32768;
    out[i * 3] = Math.floor(v / 256);
    out[i * 3 + 1] = Math.floor(v) % 256;
    out[i * 3 + 2] = Math.floor((v - Math.floor(v)) * 256);
  }
  return out;
}
