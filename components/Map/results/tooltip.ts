"use client";
/**
 * One tooltip for the result overlays (step 15 plan §4): the prototype's hover text in a small popup. On a
 * desktop it follows the pointer over a fan ray (or sits on a pin while hovered); on a touch screen there's no
 * hover, so a tap within 12 px of a ray shows it instead. Such a tap is the tooltip's alone: the map's own tap
 * (select or close a parcel) skips it (tipAt).
 */
import { Popup, type LngLatLike, type Map as MlMap, type PointLike } from "maplibre-gl";

/** Layers whose features carry a `tip` and answer to hover and tap. 15c adds the soils, driveway, trailheads. */
export const TIP_LAYERS = new Set<string>();
const TAP_PX = 12;

const popups = new WeakMap<MlMap, Popup>();

export function showTip(map: MlMap, at: LngLatLike, text: string): void {
  let p = popups.get(map);
  if (!p) {
    p = new Popup({
      closeButton: false,
      closeOnClick: false,
      className: "result-tip",
      offset: 14,
      maxWidth: "280px",
    });
    popups.set(map, p);
  }
  p.setLngLat(at).setText(text).addTo(map);
}

export function hideTip(map: MlMap): void {
  popups.get(map)?.remove();
}

/**
 * The tip of the result feature nearest a screen point (within 12 px), if any. Rays fan out from one point,
 * so several can be within reach of a finger: the nearest line wins (areas, 15c, count as distance 0).
 */
export function tipAt(map: MlMap, point: { x: number; y: number }, px = TAP_PX): string | null {
  const layers = [...TIP_LAYERS].filter((id) => map.getLayer(id));
  if (!layers.length) return null;
  const box: [PointLike, PointLike] = [
    [point.x - px, point.y - px],
    [point.x + px, point.y + px],
  ];
  let best: { tip: string; d: number } | null = null;
  for (const f of map.queryRenderedFeatures(box, { layers })) {
    const tip = f.properties?.tip as string | undefined;
    if (!tip) continue;
    const d = f.geometry.type === "LineString" ? lineDistance(map, f.geometry.coordinates, point) : 0;
    if (!best || d < best.d) best = { tip, d };
  }
  return best?.tip ?? null;
}

/** Screen distance from a point to a line given in [lon, lat]. */
function lineDistance(map: MlMap, coords: number[][], p: { x: number; y: number }): number {
  let min = Infinity;
  const pts = coords.map((c) => map.project([c[0]!, c[1]!]));
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!,
      b = pts[i]!;
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    min = Math.min(min, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return min;
}
