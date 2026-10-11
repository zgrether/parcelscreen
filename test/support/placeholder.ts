/**
 * A multi-part record the size of VGIN's placeholder for Grayson's unparceled land (PARCELID "0", 2026-10-11): 61
 * separate parts and 14,126 vertices, the largest 3,157. Synthetic rings (circles), spaced so no two touch.
 */
import { polygon } from "@turf/turf";
import type { Feature, Polygon } from "geojson";

export const PLACEHOLDER_PARTS = 61;
export const PLACEHOLDER_VERTICES = 14_126;
export const PLACEHOLDER_LARGEST = 3_157;

/** A closed ring of `n` vertices (the first repeated last) around a centre, radius in degrees. */
function circle(lon: number, lat: number, r: number, n: number): Feature<Polygon> {
  const ring = Array.from({ length: n - 1 }, (_, k) => {
    const a = (2 * Math.PI * k) / (n - 1);
    return [lon + r * Math.cos(a), lat + r * Math.sin(a)];
  });
  return polygon([[...ring, ring[0]!]]);
}

export function placeholderParts(lon = -81.57, lat = 36.63): Feature<Polygon>[] {
  const rest = PLACEHOLDER_VERTICES - PLACEHOLDER_LARGEST;
  const each = Math.floor(rest / (PLACEHOLDER_PARTS - 1));
  const sizes = Array.from(
    { length: PLACEHOLDER_PARTS - 1 },
    (_, i) => each + (i < rest % (PLACEHOLDER_PARTS - 1) ? 1 : 0),
  );
  return [
    circle(lon, lat, 0.004, PLACEHOLDER_LARGEST),
    ...sizes.map((n, i) =>
      circle(lon + 0.01 * (1 + (i % 10)), lat + 0.01 * Math.floor(i / 10) + 0.01, 0.002, n),
    ),
  ];
}
