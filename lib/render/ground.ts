/**
 * The ground viewer's day sky (step 17a; plan phase-0-17-ground.md): an eye-level window onto the skyline at
 * the evaluation point, with the sun's path and each hour's clear/blocked for any date. Pure: it works from
 * a ScreenResult (a kept one too) and the engine's own functions, and returns numbers for the canvas.
 *
 * Owner rule (§3): every number shown comes from the result, or from the engine's pure functions run on the
 * result's own inputs. The skyline is the stored 5° profile, drawn as stored: its points joined by straight
 * segments, nothing added. Direct-sun hours for Dec 21 and Jun 21 are the report's; any other date's come
 * from the engine's sunHours on that same profile.
 */
import { dayLimits, sunPos } from "@/lib/screen/astro";
import { SCREEN_CONSTANTS } from "@/lib/screen/config";
import { sunHours, type HorizonPoint } from "@/lib/screen/sun";
import type { PartialScreenResult } from "@/lib/screen/types";

const K = SCREEN_CONSTANTS.sun;
const DEG = Math.PI / 180;

/** A direction from the eye: azimuth clockwise from north, altitude above the horizontal, degrees. */
export interface AzAlt {
  az: number;
  alt: number;
}

// ---------- the projection ----------

/**
 * A cylindrical (equirectangular) panorama (owner, after the 17a review): azimuth across, wrapping round 360°,
 * and altitude up on one scale for everything drawn (terrain, skyline, canopy line, sun path, ticks). It
 * replaces the plan's eye-level camera projection, which couldn't hold a June sun and the skyline together.
 */
export interface GroundView {
  /** The azimuth at the centre, degrees clockwise from north. */
  heading: number;
  width: number;
  height: number;
  /** Pixels per degree of azimuth. */
  kx: number;
}

/**
 * The altitude scale (owner): −5° to 30° linear over the lower 70% of the height, 30° to 90° compressed into
 * the rest, so the sun is in frame at any date and hour while the skyline keeps most of the room.
 */
export const ALT_BOTTOM = -5;
export const ALT_KNEE = 30;
export const ALT_TOP = 90;
export const KNEE_SHARE = 0.7;
/** The labelled altitude lines. */
export const ALT_GRID = [0, 10, 20, 30, 45, 60, 90] as const;

/** Screen y of an altitude (below −5° falls under the bottom edge). */
export function altToY(alt: number, height: number): number {
  const low = KNEE_SHARE * height;
  if (alt <= ALT_KNEE) return height - ((alt - ALT_BOTTOM) / (ALT_KNEE - ALT_BOTTOM)) * low;
  const a = Math.min(alt, ALT_TOP);
  return height - low - ((a - ALT_KNEE) / (ALT_TOP - ALT_KNEE)) * (height - low);
}

/**
 * Pixels per degree in the linear part of the scale. Azimuth uses the same, so shapes near the horizon keep
 * their true proportions.
 */
export const lowScale = (height: number): number => (KNEE_SHARE * height) / (ALT_KNEE - ALT_BOTTOM);

/** Where a direction falls in the window (it may be outside it). */
export function project(v: GroundView, az: number, alt: number): { x: number; y: number } {
  return { x: v.width / 2 + turn(v.heading, az) * v.kx, y: altToY(alt, v.height) };
}

/** Half the window's width, in degrees of azimuth. */
export const halfWidthDeg = (v: GroundView): number => v.width / 2 / v.kx;

/** Degrees in [0, 360). */
export const wrap360 = (d: number): number => ((d % 360) + 360) % 360;

/** The angle from `from` to `to`, in (−180, 180]. */
export const turn = (from: number, to: number): number => {
  const d = wrap360(to - from);
  return d > 180 ? d - 360 : d;
};

// ---------- the skyline ----------

/** The stored profile as the engine's horizon: azimuth and angle, in its own order. */
export const horizonOf = (profile: readonly (readonly [number, number])[]): HorizonPoint[] =>
  profile.map(([az, angle]) => ({ az, angle, rc: null }));

/** The skyline's vertices: exactly the stored profile's points, in order, nothing added (owner, §8.5). */
export const skylineVertices = (profile: readonly (readonly [number, number])[]): AzAlt[] =>
  profile.map(([az, alt]) => ({ az, alt }));

/** The canopy allowance as a band above the skyline: the same points, `canopyDeg` higher. */
export const canopyVertices = (profile: readonly (readonly [number, number])[], canopyDeg: number): AzAlt[] =>
  profile.map(([az, alt]) => ({ az, alt: alt + canopyDeg }));

/**
 * The skyline angle the engine compares the sun against at an azimuth: the nearest 5° point, as sunHours
 * reads it (sun.ts hz), not an interpolation.
 */
export function skylineAt(profile: readonly (readonly [number, number])[], az: number): number {
  const n = profile.length;
  const i = ((Math.round(az / K.horizonStepDeg) % n) + n) % n;
  return profile[i]?.[1] ?? 0;
}

// ---------- dates ----------

const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

/**
 * Day of year, 1–365, on the engine's calendar: a non-leap year, so Dec 21 is always 355 and Jun 21 172 (the
 * days the report uses), and Feb 29 shares Mar 1's day. The declination formula is approximate to a day anyway.
 */
export function dayOfYear(month: number, day: number): number {
  if (month === 2 && day === 29) return MONTH_START[2]! + 1;
  return MONTH_START[month - 1]! + day;
}

/** A date as the viewer holds it: an ISO day ("2026-12-21") and its day of year. */
export interface GroundDate {
  iso: string;
  doy: number;
}

export function groundDate(iso: string): GroundDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const month = +m[2]!,
    day = +m[3]!;
  const len = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (!len || day < 1 || day > len) return null;
  return { iso, doy: dayOfYear(month, day) };
}

/** Today in a time zone, as an ISO day. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "Dec 21", or "December 21" with `long`. */
export function dateLabel(iso: string, long = false): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${(long ? MONTHS_LONG : MONTHS)[m! - 1]} ${d}`;
}

// ---------- the sun ----------

/** The sun at an hour angle (degrees from solar noon), in degrees; the engine's sunPos. */
export function sunAt(lat: number, doy: number, H: number): AzAlt {
  const s = sunPos(lat, doy, H);
  return { az: s.az / DEG, alt: s.alt / DEG };
}

/** Half the day, as an hour angle (degrees): sunrise at −limit, sunset at +limit. */
export const halfDay = (lat: number, doy: number): number => dayLimits(lat, doy);

/**
 * Whether the sun is direct at an hour angle: above the horizon and above the skyline plus the canopy, by
 * the engine's rule (sunHours: alt > skyline + canopy, the skyline read at the nearest 5° point).
 */
export function isClear(
  lat: number,
  doy: number,
  H: number,
  profile: readonly (readonly [number, number])[],
  canopyDeg: number,
): boolean {
  const s = sunAt(lat, doy, H);
  return s.alt > 0 && s.alt > skylineAt(profile, s.az) + canopyDeg;
}

/** The sun's path over the day, one point per degree of hour angle, sunrise to sunset. */
export function sunPath(lat: number, doy: number): AzAlt[] {
  const lim = halfDay(lat, doy);
  const out: AzAlt[] = [];
  for (let H = -lim; H <= lim; H += 1) out.push(sunAt(lat, doy, H));
  out.push(sunAt(lat, doy, lim));
  return out;
}

export interface HourMark {
  /** Solar hour, 0–23. */
  hour: number;
  /** "7 am", "noon", "3 pm", as the prototype labelled them. */
  label: string;
  sun: AzAlt;
  /** The skyline plus the canopy below the sun: where the tick starts. */
  ridge: number;
  blocked: boolean;
}

export const hourLabel = (hr: number): string =>
  hr === 12 ? "noon" : hr === 0 ? "12 am" : hr < 12 ? `${hr} am` : `${hr - 12} pm`;

/**
 * A mark at each whole solar hour the sun is up, red where blocked, by the engine's rule. The prototype tried
 * 7 am to 5 pm and skipped hours outside daylight (proto L1773), which on Dec 21 here leaves 8 am to 4 pm, the
 * same as this; on longer days this marks every daylight hour, not only 7 to 5.
 */
export function hourMarks(
  lat: number,
  doy: number,
  profile: readonly (readonly [number, number])[],
  canopyDeg: number,
): HourMark[] {
  const lim = halfDay(lat, doy);
  const marks: HourMark[] = [];
  for (let hr = 0; hr <= 23; hr++) {
    const H = (hr - 12) * 15;
    if (Math.abs(H) > lim) continue;
    const sun = sunAt(lat, doy, H);
    if (sun.alt <= 0) continue;
    marks.push({
      hour: hr,
      label: hourLabel(hr),
      sun,
      ridge: skylineAt(profile, sun.az) + canopyDeg,
      blocked: !isClear(lat, doy, H, profile, canopyDeg),
    });
  }
  return marks;
}

/** The prototype's solar clock (proto fmtSolar, L1844): "9:30 am". */
export function fmtSolar(H: number): string {
  const s = 12 + H / 15;
  const h = Math.floor(s),
    m = Math.round((s - h) * 60);
  const [hh, mm] = m === 60 ? [h + 1, 0] : [h, m];
  return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${s < 12 ? "am" : "pm"}`;
}

// ---------- the day's hours ----------

export interface DayHours {
  directH: number;
  daylightH: number;
  /** True for Dec 21 and Jun 21, which are the report's own figures. */
  stored: boolean;
}

/**
 * The day's direct-sun and daylight hours: the report's own for Dec 21 and Jun 21, else the engine's sunHours
 * on the stored profile (plan §3; the reproduce-Dec/Jun test shows it's the same method).
 */
export function dayHours(r: PartialScreenResult, doy: number): DayHours | null {
  const sun = r.sun,
    lat = r.point?.ll[0],
    canopy = r.params?.canopyDeg;
  if (!sun || lat === undefined || canopy === undefined) return null;
  if (doy === K.decemberDoy) return { directH: sun.decDirectH, daylightH: sun.decDaylightH, stored: true };
  if (doy === K.juneDoy) return { directH: sun.junDirectH, daylightH: sun.junDaylightH, stored: true };
  const d = sunHours(lat, horizonOf(sun.profile), doy, canopy);
  return { directH: d.directH, daylightH: d.daylightH, stored: false };
}

/** What the viewer needs from a result; null when it has no sun (an older or failed run). */
export interface GroundInputs {
  lat: number;
  lon: number;
  label: string;
  profile: readonly (readonly [number, number])[];
  canopyDeg: number;
}

export function groundInputs(r: PartialScreenResult | null): GroundInputs | null {
  const ll = r?.point?.ll ?? r?.focus?.ll;
  if (!r?.sun || !ll || r.params?.canopyDeg === undefined) return null;
  return {
    lat: ll[0],
    lon: ll[1],
    label: r.focus?.label ?? "the largest house site",
    profile: r.sun.profile,
    canopyDeg: r.params.canopyDeg,
  };
}

/** The presets (plan §2): the report's two days, the equinox, and today. */
export const PRESETS = [
  { key: "dec", label: "Dec 21", monthDay: "12-21" },
  { key: "mar", label: "Mar 20", monthDay: "03-20" },
  { key: "jun", label: "Jun 21", monthDay: "06-21" },
] as const;
