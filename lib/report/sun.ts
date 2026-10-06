/** The December sun section and its horizon chart (proto L1474–1490). */
import { compass, fmt } from "../format";
import type { PartialScreenResult } from "../screen/types";
import type { FactRow } from "./facts";
import { onMap, said, type Heading, type Part } from "./parts";
import type { EvaluationPoint } from "./point";

export function sunHeading(p: EvaluationPoint | null): Heading {
  return {
    title: "December sun",
    sub: `at ${p?.label ?? "the largest house site"}${p?.elevFt != null ? `, ${fmt(p.elevFt)} ft` : ""}`,
    slug: "december-sun",
    help: "h-sun",
  };
}

/** The chart's drawing, in its 360 × 100 viewBox (x = azimuth°, y = 100 − altitude° × 3). */
export interface HorizonChart {
  width: 360;
  height: 100;
  /** The skyline, closed along the bottom edge. */
  skyline: string;
  /** The Dec 21 sun's path across the sky, or "" when it never rises. */
  sunPath: string;
  /** Compass labels at their azimuths. B11: the prototype put E/S/W at x = 4/176/350, but x = 0 is north. */
  labels: { x: number; text: "N" | "E" | "S" | "W" }[];
}

const H = 100;
const y = (alt: number) => H - Math.min(H, alt * 3);

/** The horizon profile and the December sun's arc at a latitude (proto L1475, verbatim but for B11). */
export function horizonChart(profile: readonly (readonly [number, number])[], latDeg: number): HorizonChart {
  const line = profile.map(([az, a], i) => `${i ? "L" : "M"}${az}, ${y(a)}`).join(" ");
  const pts: string[] = [];
  const dec = (-23.44 * Math.PI) / 180,
    φ = (latDeg * Math.PI) / 180;
  for (let Hh = -90; Hh <= 90; Hh += 2) {
    const h = (Hh * Math.PI) / 180;
    const sa = Math.sin(φ) * Math.sin(dec) + Math.cos(φ) * Math.cos(dec) * Math.cos(h);
    const alt = (Math.asin(sa) * 180) / Math.PI;
    if (alt <= 0) continue;
    const cosAz = (Math.sin(dec) - sa * Math.sin(φ)) / (Math.cos(Math.asin(sa)) * Math.cos(φ));
    let az = (Math.acos(Math.max(-1, Math.min(1, cosAz))) * 180) / Math.PI;
    if (Hh > 0) az = 360 - az;
    pts.push(`${az},${y(alt)}`);
  }
  return {
    width: 360,
    height: 100,
    skyline: `${line} L360,${H} L0,${H} Z`,
    sunPath: pts.length ? "M" + pts.join(" L") : "",
    labels: [
      { x: 0, text: "N" },
      { x: 90, text: "E" },
      { x: 180, text: "S" },
      { x: 270, text: "W" },
    ],
  };
}

export interface SunView {
  /** "This point": the evaluation point's elevation, slope and coordinates. */
  point: FactRow | null;
  /** "Tap any numbered pin, an ✕, or the bulls-eye on the map to move the evaluation point." */
  moveHint: Part[];
  chart: HorizonChart | null;
  rows: FactRow[];
  caveat: Part[];
}

/** Null until the sun step has run. */
export function sunView(r: PartialScreenResult, p: EvaluationPoint | null): SunView | null {
  const s = r.sun;
  if (!s) return null;
  const point: FactRow | null =
    p && p.elevFt != null
      ? {
          label: "This point",
          value: `${fmt(p.elevFt)} ft elevation, ${fmt(p.aboveFloorFt ?? NaN)} ft above the valley floor${
            p.slopeDeg != null && p.aspectDeg != null
              ? `, ${fmt(p.slopeDeg, 1)}° slope facing ${compass(p.aspectDeg)}`
              : ""
          } · ${p.ll[0].toFixed(5)}, ${p.ll[1].toFixed(5)}`,
        }
      : null;
  return {
    point,
    moveHint: [
      onMap("Tap any numbered pin, an ✕, or the bulls-eye on the map to move the evaluation point."),
    ],
    chart: p ? horizonChart(s.profile, p.ll[0]) : null,
    rows: [
      {
        label: "Direct sun, Dec 21",
        value: `${fmt(s.decDirectH, 1)} of ${fmt(s.decDaylightH, 1)} daylight hours`,
      },
      {
        label: "Noon sun altitude / worst southern ridge",
        value: `${fmt(s.noonAlt, 1)}° / ${fmt(s.worstAngle, 1)}° at ${s.worstAz}° (${compass(s.worstAz)})`,
      },
      { label: `Noon clearance (after ${r.params.canopyDeg}° canopy)`, value: `${fmt(s.noonClearance, 1)}°` },
      { label: "Direct sun, Jun 21", value: `${fmt(s.junDirectH, 1)} of ${fmt(s.junDaylightH, 1)} h` },
    ],
    caveat: [
      said("Grey is bare-earth terrain from lidar; trees add to it."),
      onMap(
        " On the map, each ray runs from the bench to the skyline in that direction — red where that ridge blocks the December sun at the hour it's there, white where the sun clears it. Hover a ray for the numbers.",
      ),
    ],
  };
}
