"use client";
/**
 * One tooltip for the result overlays (step 15 plan §4): the prototype's hover text in a small popup. On a
 * desktop it follows the pointer; on a touch screen there's no hover, so a tap shows it instead (ResultTips).
 * Lines and dots (fan rays, the driveway, culverts, trailheads) answer within 12 px, the nearest winning; an
 * area (a soil unit) answers only when no line or dot is that close. Such a tap is the tooltip's alone: the
 * map's own tap (select or close a parcel) skips it.
 */
import { Popup, type LngLatLike, type Map as MlMap, type PointLike } from "maplibre-gl";

/** Line and point layers whose features carry a `tip`. */
export const TIP_LAYERS = new Set<string>();
/** Area layers whose features carry a `tip`: they answer only where nothing in TIP_LAYERS is near. */
export const TIP_AREAS = new Set<string>();
const TAP_PX = 12;

const popups = new WeakMap<MlMap, Popup>();

/** A mouse (or pen) that hovers; touch screens show the tips on a tap instead. */
export const canHover = (): boolean => window.matchMedia("(hover: hover)").matches;

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

const present = (map: MlMap, ids: Set<string>) => [...ids].filter((id) => map.getLayer(id));

/** The tip of the result feature nearest a screen point, if any (see above for the rules). */
export function tipAt(map: MlMap, point: { x: number; y: number }, px = TAP_PX): string | null {
  const lines = present(map, TIP_LAYERS);
  if (lines.length) {
    const box: [PointLike, PointLike] = [
      [point.x - px, point.y - px],
      [point.x + px, point.y + px],
    ];
    let best: { tip: string; d: number } | null = null;
    for (const f of map.queryRenderedFeatures(box, { layers: lines })) {
      const tip = f.properties?.tip as string | undefined;
      if (!tip) continue;
      const g = f.geometry;
      const d =
        g.type === "LineString"
          ? lineDistance(map, g.coordinates, point)
          : g.type === "Point"
            ? screenDistance(map, g.coordinates, point)
            : px;
      if (!best || d < best.d) best = { tip, d };
    }
    if (best) return best.tip;
  }
  const areas = present(map, TIP_AREAS);
  if (!areas.length) return null;
  const hit = map.queryRenderedFeatures([point.x, point.y], { layers: areas })[0];
  return (hit?.properties?.tip as string | undefined) ?? null;
}

function screenDistance(map: MlMap, c: number[], p: { x: number; y: number }): number {
  const q = map.project([c[0]!, c[1]!]);
  return Math.hypot(q.x - p.x, q.y - p.y);
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
