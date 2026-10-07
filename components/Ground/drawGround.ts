/**
 * Draws the ground viewer's day scene on a 2D canvas (step 17a), from lib/render/ground.ts's numbers: the sky,
 * the sun's path and disc, the ridges by distance (or the plain land until they load), the canopy line, the
 * report's skyline, the hour ticks, and the heading and altitude scales. A cylindrical panorama (owner, after
 * the 17a review): x is azimuth, wrapping round 360°; y is altitude on one scale for everything (altToY).
 * Colours follow the prototype's scene 4 (proto L1765–1784).
 */
import {
  ALT_GRID,
  altToY,
  canopyVertices,
  halfWidthDeg,
  project,
  skylineVertices,
  turn,
  type AzAlt,
  type GroundView,
  type HourMark,
} from "@/lib/render/ground";
import type { RidgeBands } from "@/lib/render/ridges";

export interface DayScene {
  view: GroundView;
  profile: readonly (readonly [number, number])[];
  canopyDeg: number;
  path: AzAlt[];
  marks: HourMark[];
  /** The sun now. */
  sun: AzAlt;
  /** The ridges by distance, once fetched (lib/render/ridges.ts); the plain land until then. */
  ridges?: RidgeBands | null;
}

/**
 * The bands' fills, near to far, crest colour then foot colour: darker near, paler and bluer with distance
 * (haze). The foreground is the nearest band's foot, which is lighter than its crest (owner: lighter than
 * before, and never darker than the nearest band).
 */
const RIDGE_FILL: readonly [string, string][] = [
  ["#4c6247", "#5b7454"],
  ["#647b5f", "#587052"],
  ["#869b8e", "#76897e"],
  ["#b2c1cb", "#9fb0bb"],
];

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/** How far either side of the heading anything is drawn, degrees: the window plus a margin. */
const reach = (v: GroundView) => Math.min(180, halfWidthDeg(v) + 10);

/** The vertices within reach of the heading, in screen order (left to right), each projected. */
function visible(v: GroundView, pts: AzAlt[]): { x: number; y: number }[] {
  const r = reach(v);
  return pts
    .map((p) => ({ p, d: turn(v.heading, p.az) }))
    .filter(({ d }) => Math.abs(d) <= r)
    .sort((a, b) => a.d - b.d)
    .map(({ p }) => project(v, p.az, p.alt));
}

/** A polyline through the points within reach, broken where it leaves the window or wraps round. */
function strokePath(ctx: CanvasRenderingContext2D, v: GroundView, pts: AzAlt[]) {
  const r = reach(v);
  ctx.beginPath();
  let last: { x: number; y: number } | null = null;
  for (const p of pts) {
    if (Math.abs(turn(v.heading, p.az)) > r) {
      last = null;
      continue;
    }
    const s = project(v, p.az, p.alt);
    if (last && Math.abs(s.x - last.x) < v.width / 2) ctx.lineTo(s.x, s.y);
    else ctx.moveTo(s.x, s.y);
    last = s;
  }
  ctx.stroke();
}

function pill(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, bg: string, fg: string) {
  ctx.font = "600 12px system-ui, sans-serif";
  const w = ctx.measureText(text).width + 12;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - 9, w, 18, 9);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y + 0.5);
}

export function drawDay(ctx: CanvasRenderingContext2D, sc: DayScene): void {
  const v = sc.view;
  const { width: W, height: H } = v;
  const half = halfWidthDeg(v);
  ctx.clearRect(0, 0, W, H);

  // The sky, by altitude (the prototype's day dome: #dfe9f2 at the horizon to #3f78c2 high up).
  const y0 = altToY(0, H);
  const sky = ctx.createLinearGradient(0, altToY(60, H), 0, y0);
  sky.addColorStop(0, "#3f78c2");
  sky.addColorStop(0.55, "#8fb6e3");
  sky.addColorStop(1, "#dfe9f2");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // The altitude lines, labelled: one scale for everything drawn.
  ctx.lineWidth = 1;
  ctx.font = "11px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (const a of ALT_GRID) {
    const y = Math.round(altToY(a, H)) + 0.5;
    ctx.strokeStyle = a === 0 ? "rgba(28,38,32,0.35)" : "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
    ctx.fillStyle = "rgba(28,38,32,0.75)";
    if (a > 0) ctx.fillText(`${a}°`, 6, Math.max(8, y + (a === 90 ? 8 : -7)));
  }

  // The sun's path for the day, and the sun now (behind the land when it's below the skyline).
  ctx.strokeStyle = "rgba(224,196,60,0.95)";
  ctx.lineWidth = 2;
  strokePath(ctx, v, sc.path);
  if (Math.abs(turn(v.heading, sc.sun.az)) <= half + 2 && sc.sun.alt > -2) {
    const s = project(v, sc.sun.az, sc.sun.alt);
    const g = ctx.createRadialGradient(s.x, s.y, 2, s.x, s.y, 26);
    g.addColorStop(0, "rgba(255,244,214,1)");
    g.addColorStop(0.35, "rgba(255,228,150,0.9)");
    g.addColorStop(1, "rgba(255,220,120,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 26, 0, Math.PI * 2);
    ctx.fill();
  }

  const ground = visible(v, skylineVertices(sc.profile));
  const canopy = visible(v, canopyVertices(sc.profile, sc.canopyDeg));
  const trace = (pts: { x: number; y: number }[]) =>
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  const fillDown = (pts: { x: number; y: number }[], top: string, foot: string) => {
    const crest = Math.min(...pts.map((p) => p.y));
    const g = ctx.createLinearGradient(0, crest, 0, H);
    g.addColorStop(0, top);
    g.addColorStop(1, foot);
    ctx.fillStyle = g;
    ctx.beginPath();
    trace(pts);
    ctx.lineTo(pts[pts.length - 1]!.x, H);
    ctx.lineTo(pts[0]!.x, H);
    ctx.closePath();
    ctx.fill();
  };

  if (sc.ridges) {
    // The ridges by distance as the 30 m terrain has them, far to near: each nearer band over the ones behind
    // it, with a faint rim of light along each crest. Not clipped to the report's line (owner): between its 5°
    // points the terrain can rise above it, and the view shows that.
    const { angles, stepDeg } = sc.ridges;
    for (let b = angles.length - 1; b >= 0; b--) {
      const pts: AzAlt[] = [];
      angles[b]!.forEach((alt, i) => alt !== null && pts.push({ az: i * stepDeg, alt }));
      const band = visible(v, pts);
      if (band.length < 2) continue;
      const [top, foot] = RIDGE_FILL[Math.min(b, RIDGE_FILL.length - 1)]!;
      fillDown(band, top, foot);
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      trace(band);
      ctx.stroke();
    }
  } else if (ground.length > 1) {
    // The plain land under the report's skyline, until the ridges load (or if they can't).
    const [top, foot] = RIDGE_FILL[0]!;
    fillDown(ground, top, foot);
  }

  // The canopy allowance: a light wash between the skyline and a dashed line the allowance above it.
  if (ground.length > 1 && canopy.length > 1) {
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.beginPath();
    trace(canopy);
    for (let i = ground.length - 1; i >= 0; i--) ctx.lineTo(ground[i]!.x, ground[i]!.y);
    ctx.closePath();
    ctx.fill();
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    trace(canopy);
    ctx.stroke();
    ctx.setLineDash([]);
    // The report's skyline: the line its numbers come from.
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    trace(ground);
    ctx.stroke();
  }

  // The hour ticks: from the skyline (plus canopy) to the sun, red where the sun is behind it (proto L1773).
  for (const m of sc.marks) {
    if (Math.abs(turn(v.heading, m.sun.az)) > half + 5) continue;
    const a = project(v, m.sun.az, m.ridge),
      b = project(v, m.sun.az, m.sun.alt);
    ctx.strokeStyle = m.blocked ? "rgba(224,85,63,0.95)" : "rgba(242,239,230,0.75)";
    ctx.lineWidth = m.blocked ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    pill(ctx, a.x, a.y + 16, m.label, m.blocked ? "#a63a2c" : "#e7eae3", m.blocked ? "#ffd9d2" : "#1c2620");
  }

  // The heading scale along the bottom: degrees every 15°, the compass points every 45°.
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  for (let az = 0; az < 360; az += 15) {
    if (Math.abs(turn(v.heading, az)) > half) continue;
    const p = project(v, az, 0);
    const named = az % 45 === 0;
    ctx.fillStyle = named ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.7)";
    ctx.font = named ? "600 13px system-ui, sans-serif" : "11px system-ui, sans-serif";
    ctx.fillText(named ? COMPASS[az / 45]! : `${az}°`, p.x, H - 8);
    ctx.fillRect(p.x - 0.5, H - 26, 1, named ? 8 : 5);
  }
}
