/**
 * Point markers in 3D (owner, map UX 2026-10-10). Flat, a point is today's dot. Tilted past FLAG_PITCH, it stands
 * up as a flag on a pole, anchored at the ground point, facing the viewer and drawn over labels:
 * - the symbol layers' points (trailheads, the evaluation point) switch from their flat circle layer to a flag
 *   symbol layer on the same source (so the overlay switches in Info › Layers still apply: they empty the source);
 * - the DOM pins (site pins, driveway entrances) restyle through a class on the map's container (globals.css).
 * Lines and polygons stay draped on the ground.
 */
import type { Map as MlMap } from "maplibre-gl";
import { LAYER } from "./style";

/** Below this pitch the map counts as flat (owner: "pitch under ~15°"). */
export const FLAG_PITCH = 15;

/** Each flat point layer and the flag layer that replaces it when tilted. */
export const FLAG_LAYERS: readonly (readonly [flat: string, flag: string])[] = [
  [LAYER.trailheads, LAYER.trailheadFlags],
  [LAYER.evalRing, LAYER.evalFlag],
];

/** The flag images, by category colour: the trailheads' green, the evaluation point's ink. */
export const FLAG_IMAGES: Record<string, string> = {
  "flag-trailhead": "#2f7a46",
  "flag-eval": "#0b1410",
};

/** The class on the map's container while tilted: the DOM pins become flags (globals.css). */
export const TILTED_CLASS = "map-tilted";

/** Size in CSS pixels: a 16 × 12 flag at the top of a 44 px pole. */
const W = 22,
  H = 46,
  RATIO = 2;

/** A flag on a pole, the pole's foot at the bottom centre of the image (the symbol's anchor). */
export function flagImage(colour: string): { width: number; height: number; data: Uint8ClampedArray } {
  const c = document.createElement("canvas");
  c.width = W * RATIO;
  c.height = H * RATIO;
  const g = c.getContext("2d")!;
  g.scale(RATIO, RATIO);
  const x = W / 2;
  // The pole, dark with a pale edge so it reads on dark ground and light.
  g.fillStyle = "rgba(255,255,255,0.85)";
  g.fillRect(x - 1.5, 1, 3, H - 2);
  g.fillStyle = "#1c2620";
  g.fillRect(x - 0.75, 1, 1.5, H - 2);
  // The flag, to the right of the pole's top.
  g.fillStyle = colour;
  g.strokeStyle = "#ffffff";
  g.lineWidth = 1.5;
  g.beginPath();
  g.rect(x + 0.75, 1.5, W / 2 - 2, 11);
  g.fill();
  g.stroke();
  // The foot: a small dot on the ground point.
  g.fillStyle = "#1c2620";
  g.beginPath();
  g.arc(x, H - 2.5, 2, 0, Math.PI * 2);
  g.fill();
  const img = g.getImageData(0, 0, c.width, c.height);
  return { width: img.width, height: img.height, data: img.data };
}

/** Adds the flag images (again after a style change drops them), and switches the look with the pitch. */
export function installFlags(map: MlMap): () => void {
  const add = (id: string) => {
    const colour = FLAG_IMAGES[id];
    if (colour && !map.hasImage(id)) map.addImage(id, flagImage(colour), { pixelRatio: RATIO });
  };
  Object.keys(FLAG_IMAGES).forEach(add);
  const missing = (e: { id: string }) => add(e.id);

  let tilted: boolean | null = null;
  const apply = () => {
    const now = map.getPitch() >= FLAG_PITCH;
    if (now === tilted) return;
    tilted = now;
    map.getContainer().classList.toggle(TILTED_CLASS, now);
    for (const [flat, flag] of FLAG_LAYERS) {
      if (map.getLayer(flat)) map.setLayoutProperty(flat, "visibility", now ? "none" : "visible");
      if (map.getLayer(flag)) map.setLayoutProperty(flag, "visibility", now ? "visible" : "none");
    }
  };
  // A style rebuild (another basemap) brings the layers back at their defaults: apply again.
  const restyled = () => {
    tilted = null;
    Object.keys(FLAG_IMAGES).forEach(add);
    apply();
  };
  apply();
  map.on("pitch", apply);
  map.on("styleimagemissing", missing);
  map.on("style.load", restyled);
  return () => {
    map.off("pitch", apply);
    map.off("styleimagemissing", missing);
    map.off("style.load", restyled);
    map.getContainer().classList.remove(TILTED_CLASS);
  };
}
