/**
 * The soil units, trailheads and driveway on the map (step 15c; proto drawSoilUnits L1203–1207, the trailheads
 * L1129, drawDriveway L1402–1408), as GeoJSON with the prototype's tooltips. Pure, from a result: a kept
 * result draws all of them, no session needed.
 */
import type { Feature, FeatureCollection, LineString, MultiPolygon, Point, Polygon } from "geojson";
import { lineSliceAlong } from "@turf/turf";
import { fmt } from "../format";
import { routeLabel } from "../screen/routeLabel";
import type { LatLon } from "../geo/types";
import type { PartialScreenResult } from "../screen/types";

type FC<G extends Polygon | MultiPolygon | LineString | Point, P> = FeatureCollection<G, P>;
const point = (ll: LatLon): Point => ({ type: "Point", coordinates: [ll[1], ll[0]] });

export interface SoilProps {
  color: string;
  tip: string;
}

/** Every map unit's pieces inside the boundary, in its colour, with "muname — acres ac". */
export function soilFeatures(r: PartialScreenResult): FC<Polygon | MultiPolygon, SoilProps> {
  const features: Feature<Polygon | MultiPolygon, SoilProps>[] = [];
  for (const u of r.soilUnits ?? [])
    for (const g of u.geometries)
      features.push({
        type: "Feature",
        properties: { color: u.color, tip: `${u.muname} — ${u.acres.toFixed(1)} ac` },
        geometry: g.geometry,
      });
  return { type: "FeatureCollection", features };
}

/** The trailheads near the parcel, each with its name (the prototype didn't draw hospitals or groceries). */
export function trailheadFeatures(r: PartialScreenResult): FC<Point, { tip: string }> {
  return {
    type: "FeatureCollection",
    features: (r.near?.trailheads ?? []).map((t) => ({
      type: "Feature",
      properties: { tip: t.name },
      geometry: point(t.ll),
    })),
  };
}

export type DrivewayKind = "route" | "direct" | "culvert" | "over" | "overStretch";
export interface DrivewayProps {
  kind: DrivewayKind;
  /** The route's place: 0 is the recommended one. */
  i: number;
  tip: string;
}

export interface EntrancePin {
  key: string;
  ll: LatLon;
  text: string;
  tip: string;
}

/**
 * The driveway: the routes (≤2; the first is the recommended one), their culverts and the direct 4×4 track,
 * plus the entrance pins. Nothing when no route was found (the prototype drew nothing then either). B1: the
 * prototype's first builds never put these on the map; the port does.
 */
export function drivewayFeatures(r: PartialScreenResult): {
  lines: FC<LineString | Point, DrivewayProps>;
  entrances: EntrancePin[];
} {
  const d = r.driveway;
  const features: Feature<LineString | Point, DrivewayProps>[] = [];
  // No route fits the limit: the least-steep one, as suspect, with its over-limit stretches on top (owner,
  // after 15c), and the entrances it starts from.
  if (d && !d.routes.length && d.overLimit) {
    const o = d.overLimit;
    const tip = `over the limit: needs ${Math.round(o.maxGrade * 100)}%, about ${fmt(o.overFt)} ft steeper than ${fmt(o.limitPct)}% — ~$${fmt(o.cost.mid / 1000)}k, suspect`;
    features.push({ type: "Feature", properties: { kind: "over", i: 0, tip }, geometry: o.line.geometry });
    for (const [a, b] of o.overSpans)
      features.push({
        type: "Feature",
        properties: { kind: "overStretch", i: 0, tip },
        geometry: lineSliceAlong(o.line, a, b, { units: "meters" }).geometry,
      });
    return { lines: { type: "FeatureCollection", features }, entrances: entrancePins(d.entrances) };
  }
  if (!d || !d.routes.length) return { lines: { type: "FeatureCollection", features }, entrances: [] };
  d.routes.forEach((rt, i) => {
    features.push({
      type: "Feature",
      properties: {
        kind: "route",
        i,
        tip: `${routeLabel(rt)}: ${fmt(rt.metrics.lengthFt)} ft, max ${rt.metrics.maxGradePct.toFixed(0)}%, ~$${fmt(rt.cost.mid / 1000)}k`,
      },
      geometry: rt.line.geometry,
    });
    for (const c of rt.culverts)
      features.push({
        type: "Feature",
        properties: { kind: "culvert", i, tip: "drainage crossing — culvert" },
        geometry: point(c),
      });
  });
  if (d.direct)
    features.push({
      type: "Feature",
      properties: {
        kind: "direct",
        i: 0,
        tip: `direct 4×4 track at ≤15%: ${fmt(d.direct.metrics.lengthFt)} ft, ~$${fmt((d.direct.track?.cost.mid ?? NaN) / 1000)}k — thrown away when the driveway is built`,
      },
      geometry: d.direct.line.geometry,
    });
  return { lines: { type: "FeatureCollection", features }, entrances: entrancePins(d.entrances) };
}

type Entrances = NonNullable<PartialScreenResult["driveway"]>["entrances"];

const entrancePins = (entrances: Entrances): EntrancePin[] =>
  entrances.map((e, i) => ({
    key: `entrance-${i + 1}`,
    ll: e.ll,
    text: `E${i + 1}`,
    tip: `Entrance ${i + 1} on ${e.name}: road grade ${e.roadGrade.toFixed(0)}%, bend ${e.bend.toFixed(0)}°, bank ${e.bankFt.toFixed(0)} ft`,
  }));
