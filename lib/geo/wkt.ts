import { multiPolygon, polygon } from "@turf/turf";
import type { Feature, MultiPolygon, Polygon, Position } from "geojson";

/**
 * Parses the WKT that NRCS SDA returns for clipped map-unit polygons (`STIntersection(...).STAsText()`):
 * POLYGON, MULTIPOLYGON, or GEOMETRYCOLLECTION (polygon members only; points/lines are ignored).
 * Polygons whose outer ring has fewer than 4 positions are dropped. Ported verbatim (proto L790–797).
 */
export function wktToGeo(wkt: string): Feature<Polygon | MultiPolygon> | null {
  const polys: Position[][][] = [];
  const re = /POLYGON\s*\(\((.*?)\)\)(?=\s*[,)]|\s*$)/gis;
  let m: RegExpExecArray | null;
  const src = wkt.toUpperCase().startsWith("MULTIPOLYGON")
    ? wkt
        .replace(/^MULTIPOLYGON\s*\(/i, "")
        .replace(/\)\s*$/, "")
        .replace(/\(\(/g, "POLYGON((")
    : wkt;
  while ((m = re.exec(src))) {
    const rings = m[1]!
      .split(/\)\s*,\s*\(/)
      .map((r) => r.split(",").map((p) => p.trim().split(/\s+/).map(Number).slice(0, 2)));
    if (rings[0]!.length >= 4) polys.push(rings);
  }
  if (!polys.length) return null;
  return polys.length === 1 ? polygon(polys[0]!) : multiPolygon(polys);
}
