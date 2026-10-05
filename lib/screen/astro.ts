/**
 * Sun and star positions shared by the pipeline and the 3D walkthrough. Ported verbatim from the
 * prototype's 3D module (proto L1668, L1761, L1777–1778). Angles in radians unless the name says Deg.
 * sun.ts keeps its own inline copy of the solar formula inside sunHours, exactly as the prototype did, so
 * its arithmetic order (and therefore its rounding) is unchanged.
 */

/** Solar declination (radians) for a day of year: the prototype's cosine approximation. */
const declination = (doy: number) => (-23.44 * Math.cos((2 * Math.PI * (doy + 10)) / 365) * Math.PI) / 180;

/** Sun altitude and azimuth (radians, azimuth clockwise from north) at hour angle `H` degrees from solar noon. */
export function sunPos(lat: number, doy: number, H: number): { alt: number; az: number } {
  const dec = declination(doy),
    φ = (lat * Math.PI) / 180,
    h = (H * Math.PI) / 180;
  const sa = Math.sin(φ) * Math.sin(dec) + Math.cos(φ) * Math.cos(dec) * Math.cos(h);
  const alt = Math.asin(sa);
  let az = Math.acos(
    Math.max(-1, Math.min(1, (Math.sin(dec) - sa * Math.sin(φ)) / (Math.cos(alt) * Math.cos(φ)))),
  );
  if (H > 0) az = 2 * Math.PI - az;
  return { alt, az };
}

/** Half-day length as an hour angle, degrees: sunrise is at −dayLimits, sunset at +dayLimits. */
export function dayLimits(lat: number, doy: number): number {
  const dec = declination(doy),
    φ = (lat * Math.PI) / 180;
  const c = -Math.tan(φ) * Math.tan(dec);
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
}

/** Local sidereal time, degrees, for a UTC instant and longitude. */
export function lstDeg(dateUTC: Date, lon: number): number {
  const D = dateUTC.getTime() / 86400000 - 10957.5;
  let g = (18.697374558 + 24.06570982441908 * D) % 24;
  if (g < 0) g += 24;
  return (((g * 15 + lon) % 360) + 360) % 360;
}

/** Equatorial (RA, Dec in degrees) → horizontal (alt, az in radians) for a latitude and sidereal time. */
export function eqToHor(
  raDeg: number,
  decDeg: number,
  lat: number,
  lst: number,
): { alt: number; az: number } {
  const H = ((lst - raDeg) * Math.PI) / 180,
    δ = (decDeg * Math.PI) / 180,
    φ = (lat * Math.PI) / 180;
  const alt = Math.asin(Math.sin(δ) * Math.sin(φ) + Math.cos(δ) * Math.cos(φ) * Math.cos(H));
  const az = Math.atan2(
    -Math.cos(δ) * Math.sin(H),
    Math.sin(δ) * Math.cos(φ) - Math.cos(δ) * Math.sin(φ) * Math.cos(H),
  );
  return { alt, az: (az + 2 * Math.PI) % (2 * Math.PI) };
}
