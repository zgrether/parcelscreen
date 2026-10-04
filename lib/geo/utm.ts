/**
 * WGS84 ⇄ UTM zone 17N (EPSG:26917 coordinates), the grid 3DEP is requested and analysed on.
 * Ported verbatim from the prototype (proto L474–494): same series, same order of operations, so the DEM
 * request bbox and every grid ↔ lat/lon conversion is bit-identical. Valid for the Blue Ridge study
 * area (central meridian −81°); not a general-purpose UTM library.
 */

const a = 6378137;
const f = 1 / 298.257223563;
const k0 = 0.9996;
const e2 = f * (2 - f);
const ep2 = e2 / (1 - e2);
const lon0 = (-81 * Math.PI) / 180;

/** [lat, lon] degrees → [easting, northing] metres. */
export function fwd(lat: number, lon: number): [x: number, y: number] {
  const φ = (lat * Math.PI) / 180,
    λ = (lon * Math.PI) / 180;
  const N = a / Math.sqrt(1 - e2 * Math.sin(φ) ** 2),
    T = Math.tan(φ) ** 2,
    C = ep2 * Math.cos(φ) ** 2,
    A = Math.cos(φ) * (λ - lon0);
  const M =
    a *
    ((1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 ** 3) / 256) * φ -
      ((3 * e2) / 8 + (3 * e2 * e2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * φ) +
      ((15 * e2 * e2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * φ) -
      ((35 * e2 ** 3) / 3072) * Math.sin(6 * φ));
  const x =
    k0 * N * (A + ((1 - T + C) * A ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5) / 120) +
    500000;
  const y =
    k0 *
    (M +
      N *
        Math.tan(φ) *
        ((A * A) / 2 +
          ((5 - T + 9 * C + 4 * C * C) * A ** 4) / 24 +
          ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6) / 720));
  return [x, y];
}

/** [easting, northing] metres → [lat, lon] degrees. */
export function inv(x: number, y: number): [lat: number, lon: number] {
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const M = y / k0,
    μ = M / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 ** 3) / 256));
  const φ1 =
    μ +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * μ) +
    ((21 * e1 * e1) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * μ) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * μ);
  const N1 = a / Math.sqrt(1 - e2 * Math.sin(φ1) ** 2),
    T1 = Math.tan(φ1) ** 2,
    C1 = ep2 * Math.cos(φ1) ** 2,
    R1 = (a * (1 - e2)) / Math.pow(1 - e2 * Math.sin(φ1) ** 2, 1.5),
    D = (x - 500000) / (N1 * k0);
  const φ =
    φ1 -
    ((N1 * Math.tan(φ1)) / R1) *
      ((D * D) / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6) / 720);
  const λ =
    lon0 +
    (D -
      ((1 + 2 * T1 + C1) * D ** 3) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5) / 120) /
      Math.cos(φ1);
  return [(φ * 180) / Math.PI, (λ * 180) / Math.PI];
}
