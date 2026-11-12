/**
 * Water on the land in Uses (docs/plans/water.md §2): the summary line and its detail, from the result's `water`.
 * Outside the grade: no chip and no tally. Null for a grade from before the measurement.
 */
import { elevationOf, relabel, type Elevation } from "../report/elevation";
import { booleanPointInPolygon } from "@turf/turf";
import type { LatLon } from "../geo/types";
import { soilUnder } from "../report/derived";
import type { PartialScreenResult, ScreenResult } from "../screen/types";
import { WATER } from "./words";

/** A water table this shallow (inches) puts a drainfield on wet ground (docs/plans/water.md §2). */
export const DRAINFIELD_TABLE_IN = 24;

/**
 * Septic's warning (§2), for the build site: on a likely wet patch, or on a soil whose water table is within 2 ft.
 * Null when neither, or for a grade from before the measurement.
 */
export function septicWetLine(r: ScreenResult | PartialScreenResult, ll: LatLon): string | null {
  const w = r.water;
  if (!w) return null;
  const pt = [ll[1], ll[0]];
  if ((w.flow?.wet ?? []).some((x) => booleanPointInPolygon(pt, x.outline))) return WATER.septicWet;
  const soil = soilUnder(r as ScreenResult, ll);
  const unit = soil ? w.soils.find((s) => s.mukey === String(soil.mukey)) : undefined;
  if (unit?.waterTableIn != null && unit.waterTableIn <= DRAINFIELD_TABLE_IN)
    return WATER.septicTable(unit.waterTableIn);
  return null;
}

/** Metres between [lon, lat] points, equirectangular (good at a parcel's scale). */
function metres(a: readonly number[], b: readonly number[]): number {
  const k = Math.cos((((a[1]! + b[1]!) / 2) * Math.PI) / 180);
  return Math.hypot((b[0]! - a[0]!) * k, b[1]! - a[1]!) * 111_320;
}

/** Metres from point `p` to the segment a–b, all [lon, lat]. */
function toSegment(p: readonly number[], a: readonly number[], b: readonly number[]): number {
  const k = Math.cos((p[1]! * Math.PI) / 180);
  const [px, py, ax, ay, bx, by] = [p[0]! * k, p[1]!, a[0]! * k, a[1]!, b[0]! * k, b[1]!];
  const dx = bx - ax,
    dy = by - ay;
  const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
  return metres([p[0]!, p[1]!], [(ax + t * dx) / k, ay + t * dy]);
}

/**
 * Garden's water (owner, 2026-11-05): whether a flow line crosses the garden patch or passes within `ft` of it. The
 * patch is its centre and acres, read as a circle. False for a grade from before the measurement or without lines.
 */
export function flowNearGarden(
  w: ScreenResult["water"],
  garden: { ll: LatLon; acres: number },
  ft: number,
): boolean {
  const lines = w?.flow?.lines ?? [];
  const reach = Math.sqrt((garden.acres * 4046.86) / Math.PI) + ft * 0.3048;
  const p = [garden.ll[1], garden.ll[0]];
  return lines.some((l) => l.coords.some((c, i) => i > 0 && toSegment(p, l.coords[i - 1]!, c) <= reach));
}

type W = NonNullable<ScreenResult["water"]>;

export interface WaterView {
  /** "46 ac drains onto it, mostly forest; 2 likely wet spots, 1 possible pond site". */
  line: string;
  /** The detail, in sections. */
  sections: { head: string; lines: string[] }[];
  /** Each soil unit: its name, then what it holds and how it drains, in plain words. */
  soils: { name: string; facts: string }[];
}

/** The watershed's largest land-cover groups, most first, those of at least 5%. */
function coverParts(cover: NonNullable<W["watershed"]>["cover"]): { name: string; pct: number }[] {
  if (!cover) return [];
  return Object.entries(cover)
    .filter(([, pct]) => pct >= 5)
    .sort((a, b) => b[1] - a[1])
    .map(([k, pct]) => ({ name: WATER.coverName[k] ?? k, pct }));
}

/** `e`: the elevation the grade used (existing-house plan §3); its words replace "lidar" when 3DEP fell back. */
export function waterView(w: ScreenResult["water"], e: Elevation = elevationOf({})): WaterView | null {
  if (!w) return null;
  const shed = w.watershed,
    flow = w.flow;
  const parts: string[] = [];
  if (shed) {
    if (shed.acres < 0.05) parts.push(WATER.noneDrains);
    else {
      const top = coverParts(shed.cover)[0];
      parts.push(top ? `${WATER.drains(shed.acres)}, ${WATER.mostly(top.name)}` : WATER.drains(shed.acres));
    }
  }
  const flowParts = [
    ...(flow?.wet.length ? [WATER.wet(flow.wet.length)] : []),
    ...(flow?.ponds.length ? [WATER.ponds(flow.ponds.length)] : []),
  ];
  const line = [parts.join(""), flowParts.join(", ")].filter(Boolean).join("; ") || WATER.section;

  const sections: WaterView["sections"] = [];
  sections.push({
    head: WATER.watershed,
    lines: shed
      ? [
          shed.acres < 0.05 ? WATER.noneDrains : WATER.shedLine(shed.acres),
          ...(shed.capped ? [WATER.capped(shed.reachKm)] : []),
          ...(coverParts(shed.cover).length
            ? [
                WATER.cover(
                  coverParts(shed.cover)
                    .map((p) => `${p.pct}% ${p.name}`)
                    .join(", "),
                ),
              ]
            : []),
          ...(shed.roadMi !== null && shed.acres >= 0.05 ? [WATER.roads(shed.roadMi)] : []),
          ...(shed.inflow && shed.acres >= 0.05 ? [WATER.inflow(shed.inflow.acres)] : []),
        ]
      : [WATER.noShed],
  });
  sections.push({
    head: WATER.onParcel,
    lines: flow
      ? [
          flow.lines.length
            ? WATER.lines(flow.lines.length, Math.max(...flow.lines.map((l) => l.acres)))
            : WATER.noLines,
          ...flow.wet.map((x) => WATER.wetLine(x.acres)),
          ...flow.ponds.map((p) => WATER.pondLine(p.acres)),
        ]
      : [WATER.noFlow],
  });
  const soils = w.soils
    .filter((s) => s.awcIn !== null || s.drainage || s.hydGroup)
    .map((s) => ({
      name: s.name,
      facts: [
        ...(s.awcIn !== null ? [WATER.awc(s.awcIn)] : []),
        ...(s.drainage ? [s.drainage.toLowerCase()] : []),
        ...(s.waterTableIn !== null ? [WATER.table(s.waterTableIn)] : []),
        ...(s.hydGroup ? [WATER.hydGroup(s.hydGroup)] : []),
        ...(s.omPct !== null ? [WATER.om(s.omPct)] : []),
      ].join("; "),
    }));
  // Existing-house plan §3: "lidar" named for the elevation actually used (unchanged with 3DEP).
  return {
    line: relabel(line, e),
    sections: sections.map((x) => ({ ...x, lines: x.lines.map((l) => relabel(l, e)) })),
    soils,
  };
}
