/**
 * GeoJSON for the parcel-finding overlays (proto L582–587, L612–615): the boundary being drawn and the split
 * pieces. Pure, so the shapes are testable; the layers that draw them are in style.ts.
 */
import type { Feature, FeatureCollection, Polygon } from "geojson";
import { sideName, type SplitPieces } from "@/lib/geo/split";
import type { LatLon } from "@/lib/geo/types";

const xy = ([lat, lon]: LatLon): [number, number] => [lon, lat];

/** The draft: a dashed line through the corners, and a dot per corner (the first one bigger, in amber). */
export function draftData(pts: LatLon[]): FeatureCollection {
  const features: Feature[] = [];
  if (pts.length)
    features.push({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: pts.map(xy) },
    });
  pts.forEach((p, i) =>
    features.push({
      type: "Feature",
      properties: { r: i === 0 ? 7 : 4, fill: i === 0 ? "#9a6a12" : "#1c2620" },
      geometry: { type: "Point", coordinates: xy(p) },
    }),
  );
  return { type: "FeatureCollection", features };
}

export const SPLIT_COLOR = { left: "#e0c43c", right: "#2b6f8f" } as const;

/** The two pieces (yellow left of a→b, blue right) with their hover labels, and the dashed cut line. */
export function splitData(pieces: SplitPieces, a: LatLon, b: LatLon): FeatureCollection {
  const piece = (geo: Feature<Polygon> | null, ac: number, s: 1 | -1): Feature[] =>
    geo
      ? [
          {
            ...geo,
            properties: {
              color: s < 0 ? SPLIT_COLOR.left : SPLIT_COLOR.right,
              label: `${ac.toFixed(2)} ac (${sideName(a, b, s)} side)`,
            },
          },
        ]
      : [];
  return {
    type: "FeatureCollection",
    features: [
      ...piece(pieces.left, pieces.leftAc, -1),
      ...piece(pieces.right, pieces.rightAc, 1),
      { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [xy(a), xy(b)] } },
    ],
  };
}
