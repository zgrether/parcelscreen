/**
 * The terrain surface image (proto L1208–1222; step 15 plan §1, §3): one pixel per fine-DEM cell inside the
 * parcel, coloured by house suitability, garden suitability or slope, with the house sites, shelves and
 * garden patches solid on top. Pure: it returns RGBA and the image's four corners; the map turns them into
 * an image source.
 *
 * Placed by its four UTM corners (deviation D1): the prototype stretched the UTM raster into a north-up
 * lat/lon box, a few metres off across a parcel.
 */
import { inv } from "../geo/utm";
import type { SessionView } from "../screen/worker-protocol";
import type { Dem } from "../screen/types";

export type SurfaceMode = "house" | "garden" | "slope";
export const SURFACE_MODES: readonly SurfaceMode[] = ["house", "garden", "slope"];

/** The map button's label, verbatim from the prototype (L1227). */
export const SURFACE_LABEL: Record<SurfaceMode | "off", string> = {
  house: "house suitability",
  garden: "garden suitability",
  slope: "slope",
  off: "off",
};

type Rgba = [number, number, number, number];
/** [lon, lat] corners in MapLibre's image-source order: top-left, top-right, bottom-right, bottom-left. */
export type Corners = [[number, number], [number, number], [number, number], [number, number]];

export interface SurfaceImage {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  corners: Corners;
}

/** 0–100 → RGBA (proto heat, L1209–1212): red-low to green-high for houses, a cooler ramp for gardens. */
export function heat(v: number, kind: "house" | "garden"): Rgba | null {
  if (Number.isNaN(v)) return null;
  const t = Math.max(0, Math.min(1, v / 100));
  if (kind === "garden")
    return [
      Math.round(150 - 110 * t),
      Math.round(110 + 60 * t),
      Math.round(70 + 90 * t),
      Math.round(60 + 130 * t),
    ];
  return [
    Math.round(200 - 160 * t),
    Math.round(60 + 120 * t),
    Math.round(60 - 20 * t),
    Math.round(60 + 140 * t),
  ];
}

/** The slope bands, by the tangent of the slope (proto L1221). */
function slopeColour(deg: number): Rgba {
  const g = Math.tan((deg * Math.PI) / 180);
  return g <= 0.15
    ? [140, 190, 120, 110]
    : g <= 0.25
      ? [224, 196, 60, 120]
      : g <= 0.4
        ? [222, 130, 46, 135]
        : [166, 58, 44, 150];
}

/** The grid's corners, cell edges included, from UTM 17N to [lon, lat]. */
export function surfaceCorners(d: Dem): Corners {
  const east = d.x0 + d.w * d.res,
    south = d.y0 - d.h * d.resY;
  const at = (x: number, y: number): [number, number] => {
    const [lat, lon] = inv(x, y);
    return [lon, lat];
  };
  return [at(d.x0, d.y0), at(east, d.y0), at(east, south), at(d.x0, south)];
}

/** The image for one mode, or null when the session has no surfaces (a run that stopped before them). */
export function surfaceImage(view: SessionView, mode: SurfaceMode): SurfaceImage | null {
  const { dFine: d, inside, slope, surfaces, labels } = view;
  if (!d || !inside || !slope || !surfaces || !labels) return null;
  const best = view.bestId;
  const colour: (i: number) => Rgba | null =
    mode === "house"
      ? (i) => {
          if (labels.house[i]! > 0) return labels.house[i] === best ? [20, 80, 45, 220] : [31, 110, 60, 190];
          if (labels.shelf[i]! > 0) return [70, 120, 150, 170];
          return heat(surfaces.house[i]!, "house");
        }
      : mode === "garden"
        ? (i) => (labels.garden[i]! > 0 ? [10, 120, 110, 220] : heat(surfaces.garden[i]!, "garden"))
        : (i) => slopeColour(slope[i]!);
  const rgba = new Uint8ClampedArray(d.w * d.h * 4);
  for (let i = 0; i < d.w * d.h; i++) {
    if (!inside[i] || Number.isNaN(slope[i]!)) continue;
    const c = colour(i);
    if (c) rgba.set(c, i * 4);
  }
  return { width: d.w, height: d.h, rgba, corners: surfaceCorners(d) };
}
