import type { LatLon } from "./types";

/** "36.6293, -81.3542" (or space-separated) → [lat, lon]; null without two numbers (proto L568). */
export function parseLatLon(text: string): LatLon | null {
  const m = text.match(/(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)/);
  return m ? [+m[1]!, +m[2]!] : null;
}
