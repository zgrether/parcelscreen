/**
 * GeoJSON for the parcel-finding overlays (proto L582–587, L612–615): the boundary being drawn and the split
 * pieces, plus where the pieces' labels go. Pure, so the shapes are testable; the layers that draw them are in
 * style.ts, the labels are DOM markers (ParcelTools).
 */
import { booleanPointInPolygon, centerOfMass, pointOnFeature } from "@turf/turf";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { LayerId, ParcelShapes } from "@/components/Explore/layers";
import type { ParcelRecord } from "@/lib/geo/parcels";
import type { CombineResult } from "@/lib/geo/combine";
import { sideName, type Side, type SplitPieces } from "@/lib/geo/split";
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

/** The two pieces (yellow left of a→b, blue right) and the dashed cut line. */
export function splitData(pieces: SplitPieces, a: LatLon, b: LatLon): FeatureCollection {
  const piece = (geo: Feature<Polygon> | null, s: Side): Feature[] =>
    geo ? [{ ...geo, properties: { side: s, color: s < 0 ? SPLIT_COLOR.left : SPLIT_COLOR.right } }] : [];
  return {
    type: "FeatureCollection",
    features: [
      ...piece(pieces.left, -1),
      ...piece(pieces.right, 1),
      { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [xy(a), xy(b)] } },
    ],
  };
}

/** Where a shape's label sits: its centre of mass, or a point inside it when that falls outside. */
export function labelPoint(geo: Feature<Polygon>): LatLon {
  let c = centerOfMass(geo);
  if (!booleanPointInPolygon(c, geo)) c = pointOnFeature(geo);
  const [lon, lat] = c.geometry.coordinates as [number, number];
  return [lat, lon];
}

export interface PieceLabel {
  side: Side;
  /** Where the label sits: the piece's centre of mass, or a point inside it when that falls outside. */
  at: LatLon;
  /** e.g. "W · 27.71 ac" */
  text: string;
}

/** A label per piece while a split is placed: its compass side and the acres keeping it gives. */
export function pieceLabels(pieces: SplitPieces, a: LatLon, b: LatLon): PieceLabel[] {
  const label = (geo: Feature<Polygon> | null, ac: number, side: Side): PieceLabel[] =>
    geo ? [{ side, at: labelPoint(geo), text: `${sideName(a, b, side)} · ${ac.toFixed(2)} ac` }] : [];
  return [...label(pieces.left, pieces.leftAc, -1), ...label(pieces.right, pieces.rightAc, 1)];
}

/** The picked parcels (`kind: member`) and, when they combine, the combined outline (`kind: result`). */
export function combineData(members: Feature<Polygon>[], result: CombineResult | null): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      ...members.map((m) => ({ ...m, properties: { kind: "member" } })),
      ...(result?.ok ? [{ ...result.geo, properties: { kind: "result" } }] : []),
    ],
  };
}

/**
 * The selected layer on the map (13e-4): `kind: sel` for the layer itself (a part, the road strip, a split
 * piece), `kind: left` for the piece a split leaves out, shown whenever the split or one of its pieces is
 * selected. The parcel, the house and nothing selected add nothing: the parcel is already drawn, the house is
 * a marker.
 */
export function selectionData(
  layer: LayerId | null,
  parts: ParcelRecord[],
  shapes: ParcelShapes | null,
  keep: Side | null,
): FeatureCollection {
  const f = (geo: Feature<Polygon | MultiPolygon> | null | undefined, kind: "sel" | "left"): Feature[] =>
    geo ? [{ ...geo, properties: { kind } }] : [];
  const P = shapes?.pieces ?? null;
  const piece = (s: Side) => (P ? (s < 0 ? P.left : P.right) : null);
  const features: Feature[] = [];
  if (layer?.startsWith("part:")) features.push(...f(parts[Number(layer.slice(5))]?.geo, "sel"));
  else if (layer === "strip") features.push(...f(shapes?.strip, "sel"));
  else if ((layer === "split" || layer?.startsWith("piece:")) && keep) {
    const other: Side = keep === 1 ? -1 : 1;
    if (layer === `piece:${other}`) features.push(...f(piece(other), "sel"));
    else {
      if (layer === `piece:${keep}`) features.push(...f(piece(keep), "sel"));
      features.push(...f(piece(other), "left"));
    }
  }
  return { type: "FeatureCollection", features };
}
