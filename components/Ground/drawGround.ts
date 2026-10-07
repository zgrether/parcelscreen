/**
 * Draws the ground viewer's day scene on a 2D canvas (step 17a), from lib/render/ground.ts's numbers: the sky,
 * the sun's path and disc, the canopy band, the land below the skyline, the hour ticks, and the heading and
 * altitude scales. Colours follow the prototype's scene 4 (proto L1765–1784).
 */
import {
  canopyVertices,
  project,
  skylineVertices,
  turn,
  wrap360,
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

/** The bands' fills, near to far, crest colour then deep colour: darker near, paler and bluer with distance (haze). */
const RIDGE_FILL: readonly [string, string][] = [
  ["#3a4c37", "#1c2620"],
  ["#566b51", "#2e3b2c"],
  ["#7f9488", "#55685d"],
  ["#adbdc8", "#8a9da9"],
];

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/** The vertices within reach of the heading, in screen order (left to right), each projected. */
function visible(v: GroundView, pts: AzAlt[]): { x: number; y: number }[] {
  const reach = Math.min(85, v.hfov / 2 + 10);
  return pts
    .map((p) => ({ p, d: turn(v.heading, p.az) }))
    .filter(({ d }) => Math.abs(d) <= reach)
    .sort((a, b) => a.d - b.d)
    .flatMap(({ p }) => {
      const s = project(v, p.az, p.alt);
      return s ? [s] : [];
    });
}

/** A polyline through the points that project, broken where they don't. */
function strokePath(ctx: CanvasRenderingContext2D, v: GroundView, pts: AzAlt[]) {
  ctx.beginPath();
  let pen = false;
  for (const p of pts) {
    const s = Math.abs(turn(v.heading, p.az)) < 85 ? project(v, p.az, p.alt) : null;
    if (!s) {
      pen = false;
      continue;
    }
    if (pen) ctx.lineTo(s.x, s.y);
    else ctx.moveTo(s.x, s.y);
    pen = true;
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
  ctx.clearRect(0, 0, W, H);

  // The sky, by altitude (the prototype's day dome: #dfe9f2 at the horizon to #3f78c2 high up).
  const y0 = project(v, v.heading, 0)?.y ?? H,
    y60 = project(v, v.heading, 60)?.y ?? 0;
  const sky = ctx.createLinearGradient(0, y60, 0, y0);
  sky.addColorStop(0, "#3f78c2");
  sky.addColorStop(0.55, "#8fb6e3");
  sky.addColorStop(1, "#dfe9f2");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Altitude lines every 10°, faint.
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1;
  ctx.fillStyle = "rgba(28,38,32,0.75)";
  ctx.font = "11px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (let a = 10; a <= 80; a += 10) {
    const ring: AzAlt[] = [];
    for (let d = -90; d <= 90; d += 5) ring.push({ az: wrap360(v.heading + d), alt: a });
    strokePath(ctx, v, ring);
    const at = project(v, wrap360(v.heading - v.hfov / 2 + 2), a);
    if (at && at.y > 10 && at.y < H - 10) ctx.fillText(`${a}°`, 6, at.y);
  }

  // The sun's path for the day, and the sun now (behind the land when it's below the skyline).
  ctx.strokeStyle = "rgba(224,196,60,0.95)";
  ctx.lineWidth = 2;
  strokePath(ctx, v, sc.path);
  const s = Math.abs(turn(v.heading, sc.sun.az)) < 85 ? project(v, sc.sun.az, sc.sun.alt) : null;
  if (s && sc.sun.alt > -2) {
    const g = ctx.createRadialGradient(s.x, s.y, 2, s.x, s.y, 26);
    g.addColorStop(0, "rgba(255,244,214,1)");
    g.addColorStop(0.35, "rgba(255,228,150,0.9)");
    g.addColorStop(1, "rgba(255,220,120,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 26, 0, Math.PI * 2);
    ctx.fill();
  }

  // The canopy allowance, a band on the skyline; then the land below the skyline, which hides the sun.
  const ground = visible(v, skylineVertices(sc.profile));
  const canopy = visible(v, canopyVertices(sc.profile, sc.canopyDeg));
  const trace = (pts: { x: number; y: number }[]) =>
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  // With the ridges shown, the canopy is a light wash under a dashed line, so it doesn't read as another ridge.
  const canopyBand = () => {
    if (ground.length < 2 || canopy.length < 2) return;
    ctx.fillStyle = sc.ridges ? "rgba(255,255,255,0.14)" : "rgba(40,72,44,0.45)";
    ctx.beginPath();
    trace(canopy);
    for (let i = ground.length - 1; i >= 0; i--) ctx.lineTo(ground[i]!.x, ground[i]!.y);
    ctx.closePath();
    ctx.fill();
    if (sc.ridges) {
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      trace(canopy);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  };
  if (!sc.ridges) canopyBand();
  if (sc.ridges && ground.length > 1) {
    // The ridges by distance, far to near: each nearer band over the ones behind it, darker and less hazy, its
    // colour deepening below the crest, with a faint rim of light along the crest.
    const { angles, stepDeg } = sc.ridges;
    for (let b = angles.length - 1; b >= 0; b--) {
      const pts: AzAlt[] = [];
      angles[b]!.forEach((alt, i) => alt !== null && pts.push({ az: i * stepDeg, alt }));
      const band = visible(v, pts);
      if (band.length < 2) continue;
      const [top, bottom] = RIDGE_FILL[Math.min(b, RIDGE_FILL.length - 1)]!;
      const crest = Math.min(...band.map((p) => p.y));
      const g = ctx.createLinearGradient(0, crest, 0, H);
      g.addColorStop(0, top);
      g.addColorStop(1, bottom);
      ctx.fillStyle = g;
      ctx.beginPath();
      trace(band);
      ctx.lineTo(band[band.length - 1]!.x, H);
      ctx.lineTo(band[0]!.x, H);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      trace(band);
      ctx.stroke();
    }
    canopyBand();
    // The report's skyline over them: the line its numbers come from.
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    trace(ground);
    ctx.stroke();
  } else if (ground.length > 1) {
    const land = ctx.createLinearGradient(0, y0 - 40, 0, H);
    land.addColorStop(0, "#3b4a39");
    land.addColorStop(1, "#1c2620");
    ctx.fillStyle = land;
    ctx.beginPath();
    ground.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.lineTo(ground[ground.length - 1]!.x, H);
    ctx.lineTo(ground[0]!.x, H);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#141c17";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ground.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
  }

  // The hour ticks: from the skyline (plus canopy) to the sun, red where the sun is behind it (proto L1773).
  for (const m of sc.marks) {
    if (Math.abs(turn(v.heading, m.sun.az)) >= 80) continue;
    const a = project(v, m.sun.az, m.ridge),
      b = project(v, m.sun.az, m.sun.alt);
    if (!a || !b) continue;
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
    const d = turn(v.heading, az);
    if (Math.abs(d) > v.hfov / 2) continue;
    const p = project(v, az, 0);
    if (!p) continue;
    const named = az % 45 === 0;
    ctx.fillStyle = named ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.6)";
    ctx.font = named ? "600 13px system-ui, sans-serif" : "11px system-ui, sans-serif";
    ctx.fillText(named ? COMPASS[az / 45]! : `${az}°`, p.x, H - 10);
    ctx.fillRect(p.x - 0.5, H - 30, 1, named ? 8 : 5);
  }
}
