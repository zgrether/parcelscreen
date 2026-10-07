/**
 * History's and Search's rows for the built parcels (13e; owner, 16b). History can hold two recipes of one
 * county record (a whole copy and a split one, say); they'd show the same name, so rows whose names collide
 * also say what tells them apart: the acreage, and "split" or the piece count.
 */
import { parcelFacts } from "@/lib/geo/parcels";
import { deriveParcel, type DerivedParcel } from "@/lib/geo/recipe";
import { SCREEN_CONSTANTS } from "@/lib/screen/config";
import { recipeOf, type WorkingParcel } from "./parcelStore";

/** How a parcel is named in the tree and History: its parcel IDs, else "Drawn parcel". */
export function parcelDisplayName(d: DerivedParcel): string {
  if (!d.ok) return "Parcel (pieces apart)";
  return parcelFacts(d.record.geo, d.record.props).parcelId ?? "Drawn parcel";
}

export interface HistoryRow {
  key: string;
  /** The parcel IDs (with "+ drawn"), or "Drawn parcel". */
  name: string;
  acres: number | null;
  /** Only when another row has the same name: e.g. "12.40 ac · split", "43.88 ac · 1 piece". */
  tellApart: string | null;
}

/** The name History shows, and the acres. */
export function parcelName(p: WorkingParcel): { name: string; acres: number | null } {
  const d = deriveParcel(recipeOf(p), SCREEN_CONSTANTS.combine);
  return { name: parcelDisplayName(d), acres: d.ok ? d.acres : null };
}

function tellApart(p: WorkingParcel, acres: number | null): string {
  const n = p.pieces.length;
  // "split", or the piece count; both when a combination was split.
  const pieces = `${n} piece${n === 1 ? "" : "s"}`;
  const parts = [
    ...(acres !== null ? [`${acres.toFixed(2)} ac`] : []),
    ...(p.split ? [...(n > 1 ? [pieces] : []), "split"] : [pieces]),
  ];
  return parts.join(" · ");
}

export function historyRows(built: readonly WorkingParcel[]): HistoryRow[] {
  const rows = built.map((b) => ({ b, ...parcelName(b) }));
  const count = new Map<string, number>();
  for (const r of rows) count.set(r.name, (count.get(r.name) ?? 0) + 1);
  return rows.map(({ b, name, acres }) => ({
    key: b.key!,
    name,
    acres,
    tellApart: (count.get(name) ?? 0) > 1 ? tellApart(b, acres) : null,
  }));
}
