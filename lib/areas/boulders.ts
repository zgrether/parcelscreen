/**
 * The area catalog's boulder share (docs/plans/boulders.md §2): of an area's sampled rural points, the share that falls
 * in a map unit whose name, or one of whose major components, says boulders or rock (lib/screen/boulders.ts's words).
 * From SDA, the points in a query or two; null when SDA doesn't answer (the card then says nothing).
 */
import type { LatLon } from "../geo/types";
import type { HttpClient } from "../http";
import { boulderTerms } from "../screen/boulders";
import { sdaRows } from "../screen/soils";
import type { Endpoints } from "../screen/types";

/** Points per SDA query: about 200 points make two. */
export const POINTS_PER_QUERY = 100;

/**
 * Each point's map unit and its major components: one row per point and component (a point outside the survey has
 * none). `i` is the point's index in the list given.
 */
export function pointSoilsQuery(pts: readonly LatLon[], from = 0): string {
  const values = pts
    .map(([lat, lon], k) => `(${from + k}, geometry::Point(${lon}, ${lat}, 4326))`)
    .join(",\n  ");
  return `SELECT p.i, mu.mukey, mu.muname, c.compname
 FROM (VALUES
  ${values}
 ) AS p(i, g)
 CROSS APPLY (SELECT TOP 1 mp.mukey FROM mupolygon mp WHERE mp.mupolygongeo.STIntersects(p.g) = 1) AS m
 INNER JOIN mapunit mu ON mu.mukey = m.mukey
 LEFT OUTER JOIN component c ON c.mukey = mu.mukey AND c.majcompflag = 'Yes'
 ORDER BY p.i`;
}

/**
 * The share of the points with a map unit whose unit or component names carry a boulder word; null when no point has
 * one. Rounded to the percent.
 */
export function boulderShareOf(rows: readonly Record<string, unknown>[]): number | null {
  const flagged = new Map<number, boolean>();
  for (const r of rows) {
    const i = Number(r.i);
    const hit =
      boulderTerms(String(r.muname ?? "")).length > 0 || boulderTerms(String(r.compname ?? "")).length > 0;
    flagged.set(i, (flagged.get(i) ?? false) || hit);
  }
  if (!flagged.size) return null;
  const n = [...flagged.values()].filter(Boolean).length;
  return Math.round((100 * n) / flagged.size) / 100;
}

/** The area's boulder share, from SDA; null when a query fails. */
export async function boulderShare(
  pts: readonly LatLon[],
  deps: { http: HttpClient; endpoints: Endpoints },
): Promise<number | null> {
  if (!pts.length) return null;
  const rows: Record<string, unknown>[] = [];
  try {
    for (let k = 0; k < pts.length; k += POINTS_PER_QUERY)
      rows.push(...(await sdaRows(pointSoilsQuery(pts.slice(k, k + POINTS_PER_QUERY), k), deps)));
  } catch {
    return null;
  }
  return boulderShareOf(rows);
}
