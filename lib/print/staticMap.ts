/**
 * The report card's print map (step 9 plan §4): a static render, not a capture of the live map. The aerial imagery's
 * Web Mercator tiles laid out as images in a clipped box, with the boundary, the sites and the lines drawn over them in
 * one SVG. This is the pure part: which tiles, where each one goes, and where a lat/lon falls on the box. Each 256 px
 * tile is drawn at 128 CSS px (DENSITY 2), so the imagery is twice the screen's resolution on paper.
 */
import type { LatLon } from "../geo/types";

export const TILE = 256;
/** Image pixels per CSS pixel: 2, so a 7.5 in map is about 190 dpi on paper. */
export const DENSITY = 2;
/** The highest zoom asked for (USGS imagery has data to 19 in most places; deeper tiles are blank). */
export const MAX_ZOOM = 19;
/** The parcel's share of the box at most, so its edges and the sites near them have room. */
export const FILL = 0.8;

/** USGS's national imagery (public domain), and Esri's for a tile it doesn't have (plan §9 Q2). */
export const IMAGERY = {
  usgs: {
    url: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}",
    credit: "Imagery: USGS (public domain)",
  },
  esri: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    credit: "Imagery: Esri, Maxar, Earthstar Geographics",
  },
} as const;
export type ImagerySource = keyof typeof IMAGERY;

export const tileUrl = (source: ImagerySource, z: number, x: number, y: number): string =>
  IMAGERY[source].url.replace("{z}", String(z)).replace("{y}", String(y)).replace("{x}", String(x));

/** World pixels at zoom z (Web Mercator, TILE px per tile). */
export const worldX = (lon: number, z: number): number => ((lon + 180) / 360) * TILE * 2 ** z;
export function worldY(lat: number, z: number): number {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE * 2 ** z;
}

export interface MapView {
  z: number;
  width: number;
  height: number;
  /** Each tile to show: its indices and its top-left corner on the box, in CSS px. */
  tiles: { x: number; y: number; left: number; top: number }[];
  /** A lat/lon on the box, in CSS px. */
  at(ll: LatLon): [number, number];
  /** Metres on the ground per CSS px at the box's centre. */
  metresPerPx: number;
}

/** The bounding box of some [lat, lon] points: [south, west, north, east]. */
export function boundsOf(points: readonly LatLon[]): [number, number, number, number] {
  let s = Infinity,
    w = Infinity,
    n = -Infinity,
    e = -Infinity;
  for (const [lat, lon] of points) {
    s = Math.min(s, lat);
    n = Math.max(n, lat);
    w = Math.min(w, lon);
    e = Math.max(e, lon);
  }
  return [s, w, n, e];
}

/**
 * The view for a box `width` × `height` CSS px around `bounds`: the deepest zoom at which the bounds fill no more than
 * FILL of the box, centred, and the tiles that cover the box.
 */
export function mapView(bounds: [number, number, number, number], width: number, height: number): MapView {
  const [s, w, n, e] = bounds;
  let z = MAX_ZOOM;
  while (z > 1) {
    const bw = (worldX(e, z) - worldX(w, z)) / DENSITY;
    const bh = (worldY(s, z) - worldY(n, z)) / DENSITY;
    if (bw <= width * FILL && bh <= height * FILL) break;
    z -= 1;
  }
  const cx = (worldX(w, z) + worldX(e, z)) / 2;
  const cy = (worldY(n, z) + worldY(s, z)) / 2;
  // The box's top-left corner in world px.
  const x0 = cx - (width / 2) * DENSITY;
  const y0 = cy - (height / 2) * DENSITY;
  const max = 2 ** z - 1;
  const tiles: MapView["tiles"] = [];
  for (let ty = Math.floor(y0 / TILE); ty <= Math.floor((y0 + height * DENSITY) / TILE); ty++)
    for (let tx = Math.floor(x0 / TILE); tx <= Math.floor((x0 + width * DENSITY) / TILE); tx++) {
      if (ty < 0 || ty > max) continue;
      tiles.push({
        x: ((tx % (max + 1)) + max + 1) % (max + 1),
        y: ty,
        left: (tx * TILE - x0) / DENSITY,
        top: (ty * TILE - y0) / DENSITY,
      });
    }
  const lat = (s + n) / 2;
  const metresPerPx = ((Math.cos((lat * Math.PI) / 180) * 2 * Math.PI * 6378137) / (TILE * 2 ** z)) * DENSITY;
  return {
    z,
    width,
    height,
    tiles,
    at: ([la, lo]) => [(worldX(lo, z) - x0) / DENSITY, (worldY(la, z) - y0) / DENSITY],
    metresPerPx,
  };
}

const FT_PER_M = 3.28084;
const FT_PER_MI = 5280;

/**
 * A scale bar no longer than `maxPx`: a round length in feet (under half a mile) or miles, and its width in CSS px.
 */
export function scaleBar(metresPerPx: number, maxPx = 120): { label: string; px: number } {
  const maxFt = maxPx * metresPerPx * FT_PER_M;
  const nice = (v: number) => {
    const p = 10 ** Math.floor(Math.log10(v));
    const m = v / p;
    return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p;
  };
  if (maxFt < FT_PER_MI / 2) {
    const ft = nice(maxFt);
    return { label: `${ft.toLocaleString("en-US")} ft`, px: ft / FT_PER_M / metresPerPx };
  }
  const mi = nice(maxFt / FT_PER_MI);
  return { label: `${mi} mi`, px: (mi * FT_PER_MI) / FT_PER_M / metresPerPx };
}
