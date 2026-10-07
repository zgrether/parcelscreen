/**
 * Draws the ground viewer's night (step 17b; the prototype's scene 5, buildSky L1786–1816) on the same
 * cylindrical panorama as the day: the night sky lifted by twilight, the atlas's zenith haze and light domes,
 * the stars, the Milky Way placed by sidereal time and faded with sky brightness, the ridges as silhouettes,
 * the report's skyline, and the core's label.
 */
import {
  ALT_GRID,
  altToY,
  canopyVertices,
  halfWidthDeg,
  project,
  skylineVertices,
  turn,
  yToAlt,
  type AzAlt,
  type GroundView,
} from "@/lib/render/ground";
import { glowAt, type BandDot, type Dome } from "@/lib/render/night";
import type { RidgeBands } from "@/lib/render/ridges";
import { COMPASS, pill, visible } from "./drawGround";

export interface NightScene {
  view: GroundView;
  profile: readonly (readonly [number, number])[];
  canopyDeg: number;
  ridges?: RidgeBands | null;
  /** 1 at sunset (the sun at 0°) to 0 in full night (−18°): twilight lifts the sky and hides the faint stars. */
  twilight: number;
  /** The atlas's zenith haze, 0 pristine → 1 city, and its light domes. */
  haze: number;
  domes: readonly Dome[];
  stars: readonly (AzAlt & { b: number })[];
  band: readonly BandDot[];
  /** The Milky Way's visibility with sky brightness (0–1). */
  mwVis: number;
  core: AzAlt;
}

/** Night ridges, near to far: dark silhouettes, the far ones a touch lighter against the sky glow. */
const NIGHT_FILL: readonly [string, string][] = [
  ["#121c17", "#16211b"],
  ["#17231d", "#141f19"],
  ["#1e2b28", "#19251f"],
  ["#283838", "#223030"],
];

/** The atlas glow for a view, painted once per view size and heading (it doesn't change with the hour). */
const glowCache = new WeakMap<readonly Dome[], { key: string; canvas: HTMLCanvasElement }>();
function glowLayer(v: GroundView, haze: number, domes: readonly Dome[]): HTMLCanvasElement {
  const key = `${v.width}|${v.height}|${v.kx}|${Math.round(v.heading * 4)}|${haze}`;
  const hit = glowCache.get(domes);
  if (hit?.key === key) return hit.canvas;
  const S = 4; // quarter resolution: the glow is smooth
  const w = Math.max(1, Math.ceil(v.width / S)),
    h = Math.max(1, Math.ceil(v.height / S));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext("2d")!;
  const img = c.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const alt = yToAlt(y * S + S / 2, v.height);
    for (let x = 0; x < w; x++) {
      const az = v.heading + (x * S + S / 2 - v.width / 2) / v.kx;
      const g = glowAt(((az % 360) + 360) % 360, alt, haze, domes);
      const i = (y * w + x) * 4;
      img.data[i] = Math.round(80 + 130 * g.warm);
      img.data[i + 1] = Math.round(90 + 70 * g.warm);
      img.data[i + 2] = Math.round(140 - 40 * g.warm);
      img.data[i + 3] = Math.round(255 * g.a);
    }
  }
  c.putImageData(img, 0, 0);
  glowCache.set(domes, { key, canvas });
  return canvas;
}

/** The Milky Way's own layer, reused between frames (resized with the view). */
let band: HTMLCanvasElement | null = null;
function bandLayer(w: number, h: number): HTMLCanvasElement {
  band ??= document.createElement("canvas");
  if (band.width !== w || band.height !== h) {
    band.width = w;
    band.height = h;
  }
  return band;
}

/** Two hex colours mixed, t from 0 (a) to 1 (b). */
function mix(a: string, b: string, t: number): string {
  const p = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  const c = [0, 1, 2].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t));
  return `rgb(${c.join(",")})`;
}

export function drawNight(ctx: CanvasRenderingContext2D, sc: NightScene): void {
  const v = sc.view;
  const { width: W, height: H } = v;
  const half = halfWidthDeg(v);
  const tw = Math.max(0, Math.min(1, sc.twilight));
  const dark = 1 - tw;
  ctx.clearRect(0, 0, W, H);

  // The sky: night blue-black, lifted toward dusk colours in twilight.
  const y0 = altToY(0, H);
  const sky = ctx.createLinearGradient(0, 0, 0, y0);
  sky.addColorStop(0, mix("#03060a", "#2a4a6e", tw));
  sky.addColorStop(1, mix("#0b1620", "#c98f62", tw));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // The atlas's haze and light domes, by maximum (proto L1796), then the stars and the Milky Way, all added.
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.6 + 0.4 * dark;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(glowLayer(v, sc.haze, sc.domes), 0, 0, W, H);
  ctx.globalAlpha = 1;
  for (const s of sc.stars) {
    if (Math.abs(turn(v.heading, s.az)) > half) continue;
    const a = s.b * dark;
    if (a < 0.03) continue;
    const p = project(v, s.az, s.alt);
    const r = s.b > 0.8 ? 2 : 1.4;
    ctx.fillStyle = `rgba(235,238,255,${a.toFixed(3)})`;
    ctx.fillRect(p.x, p.y, r, r);
  }
  const vis = sc.mwVis * dark;
  if (vis > 0.01) {
    // Soft dots, larger than their spacing and slightly jittered, on a layer of their own that's blurred as it's
    // added, so the band reads as a glow rather than a grid (squares in a grid at an angle show moiré).
    const layer = bandLayer(W, H);
    const lc = layer.getContext("2d")!;
    lc.clearRect(0, 0, W, H);
    lc.globalCompositeOperation = "lighter";
    const radius = Math.max(1.5, v.kx * 0.75);
    sc.band.forEach((d, i) => {
      if (d.alt < -1 || Math.abs(turn(v.heading, d.az)) > half + 2) return;
      const p = project(v, d.az, d.alt);
      const j = Math.sin(i * 12.9898) * 43758.5453,
        jx = (j - Math.floor(j) - 0.5) * v.kx * 0.9,
        k = Math.sin(i * 78.233) * 43758.5453,
        jy = (k - Math.floor(k) - 0.5) * v.kx * 0.6;
      const r = Math.round(200 + 55 * d.warm),
        g = Math.round(205 + 20 * d.warm),
        bl = Math.round(235 - 45 * d.warm);
      lc.fillStyle = `rgba(${r},${g},${bl},${(0.13 * d.b * vis).toFixed(3)})`;
      lc.beginPath();
      lc.arc(p.x + jx, p.y + jy, radius, 0, Math.PI * 2);
      lc.fill();
    });
    ctx.filter = `blur(${Math.max(1, v.kx * 0.5).toFixed(1)}px)`;
    ctx.drawImage(layer, 0, 0, W, H);
    ctx.filter = "none";
  }
  ctx.globalCompositeOperation = "source-over";

  // Faint altitude lines, labelled.
  ctx.font = "11px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (const a of ALT_GRID) {
    const y = Math.round(altToY(a, H)) + 0.5;
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
    ctx.fillStyle = "rgba(220,228,240,0.6)";
    if (a > 0) ctx.fillText(`${a}°`, 6, Math.max(8, y + (a === 90 ? 8 : -7)));
  }

  // The land: the ridges by distance as dark silhouettes (the plain skyline until they load).
  const ground = visible(v, skylineVertices(sc.profile));
  const canopy = visible(v, canopyVertices(sc.profile, sc.canopyDeg));
  const trace = (pts: { x: number; y: number }[]) =>
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  const fillDown = (pts: { x: number; y: number }[], [top, foot]: readonly [string, string]) => {
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
    const { angles, stepDeg } = sc.ridges;
    for (let b = angles.length - 1; b >= 0; b--) {
      const pts: AzAlt[] = [];
      angles[b]!.forEach((alt, i) => alt !== null && pts.push({ az: i * stepDeg, alt }));
      const band = visible(v, pts);
      if (band.length < 2) continue;
      fillDown(band, NIGHT_FILL[Math.min(b, NIGHT_FILL.length - 1)]!);
      ctx.strokeStyle = "rgba(200,215,230,0.10)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      trace(band);
      ctx.stroke();
    }
  } else if (ground.length > 1) fillDown(ground, NIGHT_FILL[0]!);
  if (ground.length > 1 && canopy.length > 1) {
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = "rgba(220,228,240,0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    trace(canopy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(220,228,240,0.55)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    trace(ground);
    ctx.stroke();
  }

  // The core, labelled where it is (the prototype's label, L1815).
  if (sc.core.alt > 0 && Math.abs(turn(v.heading, sc.core.az)) <= half) {
    const p = project(v, sc.core.az, sc.core.alt);
    const text = sc.mwVis > 0.25 ? "Milky Way core" : "Milky Way core (washed out here)";
    pill(ctx, p.x, Math.min(H - 40, p.y + 22), text, "#1c2640", "#dfe8ff");
  }

  // The heading scale along the bottom.
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  for (let az = 0; az < 360; az += 15) {
    if (Math.abs(turn(v.heading, az)) > half) continue;
    const p = project(v, az, 0);
    const named = az % 45 === 0;
    ctx.fillStyle = named ? "rgba(230,236,245,0.9)" : "rgba(230,236,245,0.55)";
    ctx.font = named ? "600 13px system-ui, sans-serif" : "11px system-ui, sans-serif";
    ctx.fillText(named ? COMPASS[az / 45]! : `${az}°`, p.x, H - 8);
    ctx.fillRect(p.x - 0.5, H - 26, 1, named ? 8 : 5);
  }
}
