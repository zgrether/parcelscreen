/**
 * Clock times for the ground viewer (owner, before merging #64): sunrise, sunset, solar noon and the ends of
 * twilight as real instants, with the equation of time and, for sunrise and sunset, the standard −0.833°
 * altitude (refraction plus the sun's semidiameter). The standard solar-position formulas (Meeus, as NOAA's
 * solar calculator uses them); tested against NOAA's own results within a minute (sunclock.test.ts).
 *
 * Display only: the report's sun hours, the hour marks' clear/blocked rule and the goldens use the engine's
 * own model (lib/screen/sun.ts), unchanged. This only turns the viewer's labels into clock time.
 */

const RAD = Math.PI / 180;

/** The altitudes the sun's events are defined at, degrees. */
export const SUNRISE_ALT = -0.833;
export const CIVIL_ALT = -6;
export const NAUTICAL_ALT = -12;
export const ASTRONOMICAL_ALT = -18;

/** Julian day at 0h UTC of a calendar date. */
export function julianDay(y: number, m: number, d: number): number {
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const A = Math.floor(y / 100),
    B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
}

/** The sun's declination (degrees) and the equation of time (minutes) at a Julian day. */
export function sunCoords(jd: number): { decDeg: number; eqTimeMin: number } {
  const T = (jd - 2451545) / 36525;
  const L0 = (((280.46646 + T * (36000.76983 + 0.0003032 * T)) % 360) + 360) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const Mr = M * RAD;
  const C =
    Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2 * Mr) * (0.019993 - 0.000101 * T) +
    Math.sin(3 * Mr) * 0.000289;
  const omega = (125.04 - 1934.136 * T) * RAD;
  const lambda = (L0 + C - 0.00569 - 0.00478 * Math.sin(omega)) * RAD;
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = (eps0 + 0.00256 * Math.cos(omega)) * RAD;
  const decDeg = Math.asin(Math.sin(eps) * Math.sin(lambda)) / RAD;
  const y = Math.tan(eps / 2) ** 2;
  const L0r = L0 * RAD;
  const E =
    y * Math.sin(2 * L0r) -
    2 * e * Math.sin(Mr) +
    4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r) -
    0.5 * y * y * Math.sin(4 * L0r) -
    1.25 * e * e * Math.sin(2 * Mr);
  return { decDeg, eqTimeMin: (4 * E) / RAD };
}

/** Minutes after 0h UTC on the date, given an event's hour angle sign (+ morning, − evening). */
function eventUtcMin(jd: number, lat: number, lon: number, altDeg: number, morning: boolean): number | null {
  const at = (j: number) => {
    const { decDeg, eqTimeMin } = sunCoords(j);
    const φ = lat * RAD,
      δ = decDeg * RAD;
    const cosH = (Math.sin(altDeg * RAD) - Math.sin(φ) * Math.sin(δ)) / (Math.cos(φ) * Math.cos(δ));
    if (cosH < -1 || cosH > 1) return null; // the sun never reaches that altitude that day
    const H = Math.acos(cosH) / RAD;
    return 720 - 4 * (lon + (morning ? H : -H)) - eqTimeMin;
  };
  const first = at(jd);
  // Once more at the event's own moment, as NOAA does: the sun's coordinates move during the day.
  return first === null ? null : at(jd + first / 1440);
}

/** A morning or evening event on a date as a UTC instant (ms), or null when the sun doesn't get there. */
export function sunEvent(
  iso: string,
  lat: number,
  lon: number,
  altDeg: number,
  morning: boolean,
): number | null {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const min = eventUtcMin(julianDay(y, m, d), lat, lon, altDeg, morning);
  return min === null ? null : Date.UTC(y, m - 1, d) + min * 60_000;
}

export const sunrise = (iso: string, lat: number, lon: number): number | null =>
  sunEvent(iso, lat, lon, SUNRISE_ALT, true);
export const sunset = (iso: string, lat: number, lon: number): number | null =>
  sunEvent(iso, lat, lon, SUNRISE_ALT, false);

/** Solar noon on a date as a UTC instant (ms): the sun due south, by the equation of time. */
export function solarNoon(iso: string, lon: number): number {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const jd = julianDay(y, m, d);
  const first = 720 - 4 * lon - sunCoords(jd - lon / 360).eqTimeMin;
  const min = 720 - 4 * lon - sunCoords(jd - 0.5 + first / 1440).eqTimeMin;
  return Date.UTC(y, m - 1, d) + min * 60_000;
}

/** The sun's altitude (degrees) at an instant, for the night's twilight. */
export function sunAltitude(t: number, lat: number, lon: number): number {
  const jd = t / 86_400_000 + 2440587.5;
  const { decDeg, eqTimeMin } = sunCoords(jd);
  const utcMin = (((t % 86_400_000) + 86_400_000) % 86_400_000) / 60_000;
  const H = ((utcMin + eqTimeMin + 4 * lon) / 4 - 180) * RAD;
  const φ = lat * RAD,
    δ = decDeg * RAD;
  return Math.asin(Math.sin(φ) * Math.sin(δ) + Math.cos(φ) * Math.cos(δ) * Math.cos(H)) / RAD;
}

/** The day after an ISO date. */
export function nextDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}
