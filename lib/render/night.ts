/**
 * The ground viewer's night sky (step 17b; plan phase-0-17-ground.md §2): the Milky Way placed by sidereal time,
 * its fade with sky brightness, the atlas's zenith haze and horizon light domes, and the night's span for the
 * time bar. Pure; the canvas draws from these. Formulas are the prototype's scene 5 (proto buildSky, L1786–1816).
 *
 * Times are real instants (UTC ms): sidereal time needs the instant, and the clock labels are civil time in
 * UserConfig.timeZone (B5, fixed: the prototype took the browser's zone).
 */
import { eqToHor, lstDeg } from "@/lib/screen/astro";
import { SCREEN_CONSTANTS } from "@/lib/screen/config";
import type { PartialScreenResult } from "@/lib/screen/types";
import type { AzAlt } from "./ground";
import { ASTRONOMICAL_ALT, CIVIL_ALT, NAUTICAL_ALT, nextDay, sunEvent, sunrise, sunset } from "./sunclock";

const DEG = Math.PI / 180;

/** The galactic core (RA 17h45.6m, Dec −29.0°) and north pole (RA 12h51.4m, Dec +27.13°), as the prototype. */
export const CORE_RA = 266.4;
export const CORE_DEC = SCREEN_CONSTANTS.sky.coreDecDeg;
export const POLE_RA = 192.85;
export const POLE_DEC = 27.13;

// ---------- the night's span ----------

export interface NightSpan {
  /** Sunset on the date and sunrise the next morning, UTC ms. */
  start: number;
  end: number;
}

/**
 * Sunset on the date to the next sunrise, at the point (owner, before #64): with the equation of time and the
 * standard −0.833° altitude, within a minute of NOAA (lib/render/sunclock.ts).
 */
export function nightSpan(iso: string, lat: number, lon: number): NightSpan {
  const start = sunset(iso, lat, lon),
    end = sunrise(nextDay(iso), lat, lon);
  // No sunset or sunrise only happens far north of these parcels; fall back to 6 pm → 6 am UTC-ish span.
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const base = Date.UTC(y, m - 1, d) + (18 - lon / 15) * 3_600_000;
  return { start: start ?? base, end: end ?? base + 12 * 3_600_000 };
}

/**
 * Where twilight ends in the evening (civil −6°, nautical −12°, astronomical −18°) and astronomical twilight
 * begins in the morning, as shares of the night's span, for the time bar.
 */
export function twilightMarks(
  span: NightSpan,
  iso: string,
  lat: number,
  lon: number,
): { f: number; label: string; minor?: boolean }[] {
  const f = (t: number | null) => (t === null ? null : (t - span.start) / (span.end - span.start));
  const marks = [
    { f: f(sunEvent(iso, lat, lon, CIVIL_ALT, false)), label: "civil", minor: true },
    { f: f(sunEvent(iso, lat, lon, NAUTICAL_ALT, false)), label: "nautical", minor: true },
    { f: f(sunEvent(iso, lat, lon, ASTRONOMICAL_ALT, false)), label: "dark sky from" },
    { f: f(sunEvent(nextDay(iso), lat, lon, ASTRONOMICAL_ALT, true)), label: "dark sky until" },
  ];
  return marks.filter(
    (m): m is { f: number; label: string; minor?: boolean } => m.f !== null && m.f > 0 && m.f < 1,
  );
}

/** "9:30 pm" in a time zone. */
export function clockIn(timeZone: string, t: number): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" })
    .format(new Date(t))
    .replace(" AM", " am")
    .replace(" PM", " pm");
}

/** The whole civil hours inside the night, for the time bar's ticks. */
export function nightTicks(span: NightSpan, timeZone: string): { f: number; label: string }[] {
  const out: { f: number; label: string }[] = [];
  const first = Math.ceil(span.start / 3_600_000) * 3_600_000;
  for (let t = first; t <= span.end; t += 3_600_000) {
    // Whole hours in UTC are whole hours in every zone this app covers (whole-hour offsets).
    const label = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric" })
      .format(new Date(t))
      .replace(" AM", "am")
      .replace(" PM", "pm");
    out.push({ f: (t - span.start) / (span.end - span.start), label: label === "12am" ? "midnight" : label });
  }
  return out;
}

// ---------- the galaxy ----------

/** The core and the galactic north pole in the sky at an instant (degrees). */
export function galaxyAt(lat: number, lon: number, t: number): { core: AzAlt; pole: AzAlt } {
  const lst = lstDeg(new Date(t), lon);
  const c = eqToHor(CORE_RA, CORE_DEC, lat, lst),
    p = eqToHor(POLE_RA, POLE_DEC, lat, lst);
  return { core: { az: c.az / DEG, alt: c.alt / DEG }, pole: { az: p.az / DEG, alt: p.alt / DEG } };
}

/** The Milky Way's visibility with zenith brightness (proto L1814): 0 at 19.6 mag/arcsec², 1 at 21.8. */
export const milkyWayVisibility = (mag: number): number =>
  Math.pow(Math.max(0, Math.min(1, (mag - 19.6) / (21.8 - 19.6))), 1.6);

type Vec = [number, number, number];
const toVec = (p: AzAlt): Vec => [
  Math.sin(p.az * DEG) * Math.cos(p.alt * DEG),
  Math.cos(p.az * DEG) * Math.cos(p.alt * DEG),
  Math.sin(p.alt * DEG),
];
const toAzAlt = ([x, y, z]: Vec): AzAlt => {
  const r = Math.hypot(x, y, z);
  return { az: (((Math.atan2(x, y) / DEG) % 360) + 360) % 360, alt: Math.asin(z / r) / DEG };
};
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Deterministic noise in [0, 1) for the band's texture (the prototype's hash, proto L1808). */
const hash = (x: number, y: number) => {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

export interface BandDot extends AzAlt {
  /** Brightness 0–1, before the sky's visibility fade. */
  b: number;
  /** 0 neutral to 1 the core's warm colour. */
  warm: number;
}

/**
 * The galactic band as dots on the sky: ±120° along the plane from the core, ±8.4° across it (the prototype's
 * ribbon), with its brightness profile, mottling and the dark rift (proto L1808).
 */
export function milkyWay(core: AzAlt, pole: AzAlt, stepDeg = 1, acrossStepDeg = 0.6): BandDot[] {
  const c = toVec(core),
    p = toVec(pole);
  const along = cross(p, c);
  const out: BandDot[] = [];
  const HALF = 8.4; // degrees across: the prototype's 1300 / 8800 radians
  for (let th = -120; th <= 120; th += stepDeg) {
    const a = th * DEG;
    const alongK =
      Math.exp(-(th * th) / (2 * 45 * 45)) * 0.7 + 0.3 * Math.exp(-((th - 70) ** 2) / (2 * 30 * 30));
    const tx = (th + 120) / 240;
    const warm = Math.exp(-(th * th) / (2 * 35 * 35));
    for (let s = -HALF; s <= HALF; s += acrossStepDeg) {
      const ty = s / HALF;
      const across = Math.exp(-(ty * ty) / 0.16);
      const gx = Math.round(tx * 1024),
        gy = Math.round((ty + 1) * 128);
      const n =
        0.55 +
        0.45 * (0.5 * hash(gx >> 3, gy >> 3) + 0.3 * hash(gx >> 4, gy >> 4) + 0.2 * hash(gx >> 5, gy >> 5));
      const lane = 1 - 0.7 * Math.exp(-((ty + 0.1 + 0.22 * Math.sin(tx * 9)) ** 2) / 0.012);
      const b = across * n * lane * (0.25 + 0.75 * alongK);
      if (b < 0.02) continue;
      const t = Math.tan(s * DEG);
      const dir: Vec = [
        c[0] * Math.cos(a) + along[0] * Math.sin(a) + p[0] * t,
        c[1] * Math.cos(a) + along[1] * Math.sin(a) + p[1] * t,
        c[2] * Math.cos(a) + along[2] * Math.sin(a) + p[2] * t,
      ];
      out.push({ ...toAzAlt(dir), b, warm });
    }
  }
  return out;
}

// ---------- the atlas's glow ----------

/** The zenith haze's strength, 0 pristine → 1 city (proto L1787). */
export const hazeOf = (ratio: number): number => Math.min(1, Math.log10(1 + ratio) / 1.3);

export interface Dome {
  az: number;
  A: number;
  sig: number;
  hgt: number;
}

/** The light domes the prototype drew: one per sampled direction above w 0.05, its size from w (proto L1795). */
export function domesOf(domes: readonly { az: number; w: number }[]): Dome[] {
  return domes
    .filter((d) => d.w > 0.05)
    .map((d) => ({
      az: d.az,
      A: 0.06 * Math.log10(1 + d.w) + 0.3 * Math.min(1, d.w / 3),
      sig: 9 + 6 * Math.min(1, d.w / 2),
      hgt: 4 + 18 * Math.min(1, d.w / 4),
    }));
}

/**
 * The sky's glow at a direction (proto L1796–1798): the zenith haze plus the strongest dome there (blended by
 * maximum: the domes sample one field, so summing them would stack neighbours). Returns opacity and warmth.
 */
export function glowAt(
  az: number,
  alt: number,
  haze: number,
  domes: readonly Dome[],
): { a: number; warm: number } {
  const hz = (0.02 + 0.3 * haze) * Math.pow(1 - Math.max(0, Math.min(90, alt)) / 90, 2.2);
  let g = 0;
  for (const d of domes) {
    let da = Math.abs(az - d.az);
    if (da > 180) da = 360 - da;
    const v = d.A * Math.exp(-(da * da) / (2 * d.sig * d.sig)) * Math.exp(-(alt * alt) / (2 * d.hgt * d.hgt));
    if (v > g) g = v;
  }
  return { a: Math.min(0.7, hz + g), warm: Math.min(1, g / (hz + g + 1e-6)) };
}

/** What the night view needs from a result; null without a sky (an older or failed run). */
export interface NightInputs {
  mag: number;
  ratio: number;
  zone: string;
  zoneWord: string;
  coreAlt: number;
  domes: readonly { az: number; w: number }[];
}

export function nightInputs(r: PartialScreenResult | null): NightInputs | null {
  const s = r?.sky;
  if (!s) return null;
  return {
    mag: s.mag,
    ratio: s.ratio,
    zone: s.zone,
    zoneWord: s.zoneWord,
    coreAlt: s.coreAlt,
    domes: s.domes,
  };
}

const COMPASS16 = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
];
export const compassOf = (a: number): string => COMPASS16[Math.round((((a % 360) + 360) % 360) / 22.5) % 16]!;

/**
 * The core's label (the prototype's two, L1815, plus the owner's third before #64): behind the ridge when the
 * skyline there (read as the engine reads it) stands higher than the core; else washed out under a bright sky.
 */
export function coreLabel(core: AzAlt, ridgeAt: (az: number) => number, mwVis: number): string {
  if (ridgeAt(core.az) > core.alt) return "Milky Way core (behind ridge)";
  return mwVis > 0.25 ? "Milky Way core" : "Milky Way core (washed out here)";
}

/**
 * Scene 5's caption (proto L1865), word for word: the zenith, the wash-out, and where the core sits against
 * the ridge (the skyline read as the engine reads it, plus the canopy allowance where the prototype used 3°).
 */
export function nightCaption(
  n: NightInputs,
  core: AzAlt,
  ridgeAt: (az: number) => number,
  canopyDeg: number,
): string {
  const z = `Sky at zenith ${n.mag.toFixed(2)} mag/arcsec² (zone ${n.zone}, ${n.zoneWord}); the haze and the glow on the horizon are drawn from the atlas — brighter where a town sits in that direction. `;
  const wash =
    milkyWayVisibility(n.mag) < 0.25
      ? "The sky here is bright enough that the Milky Way is washed out to the naked eye. "
      : "";
  const ridge = ridgeAt(core.az);
  const where =
    core.alt <= 0
      ? `At this date and hour the Milky Way core is below the horizon — try summer, late evening.`
      : `At this date and hour the core sits ${core.alt.toFixed(0)}° above the horizon toward ${core.az.toFixed(0)}° (${compassOf(core.az)}); the ridge there is ${ridge.toFixed(0)}°${core.alt <= ridge + canopyDeg ? " — hidden behind it" : ""}.`;
  return z + wash + where;
}
