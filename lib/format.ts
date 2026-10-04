// Display helpers shared by the pipeline (flag text) and the UI. Ported verbatim from the prototype
// (proto L1451–1452).

/** Locale-formatted number with `d` fixed decimals; "—" for NaN/±Infinity. */
export const fmt = (n: number, d = 0): string =>
  Number.isFinite(n)
    ? n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d })
    : "—";

const POINTS = [
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
] as const;

/** 16-point compass name for a bearing in degrees clockwise from north (0–360). */
export const compass = (a: number): string => POINTS[Math.round(a / 22.5) % 16]!;
