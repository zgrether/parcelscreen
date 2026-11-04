/**
 * Water on the land in Uses (docs/plans/water.md §2): the summary line and its detail, from the result's `water`.
 * Outside the grade: no chip and no tally. Null for a grade from before the measurement.
 */
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

export function waterView(w: ScreenResult["water"]): WaterView | null {
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
  return { line, sections, soils };
}
