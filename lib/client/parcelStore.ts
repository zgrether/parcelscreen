/**
 * The open parcel and History (step 13e). A parcel you change becomes *built*: it's saved automatically,
 * listed in History and kept on the map until you remove it. Nothing expires: Remove is the only way out.
 *
 * Stored under `ps.parcels` as `{ v: 2, open, built }` and validated on the way back in; 13d's `ps.current`
 * (v1) converts on first read. The shape of a built parcel is the one the Phase 1 importer reads (see
 * REQUIREMENTS, "The local parcel store"), so it stays versioned: change it only with a new `v` and a
 * converter. Pure: callers pass the clock and the key maker, and the store goes through prefs.
 */
import { z } from "zod";
import type { ParcelRecord } from "@/lib/geo/parcels";
import { isCountyRecord, type ParcelRecipe, type SplitCut } from "@/lib/geo/recipe";
import type { LatLon } from "@/lib/geo/types";
import type { CurrentParcel } from "./currentParcel";
import { LatLonSchema, RecordSchema } from "./currentParcel";

export interface WorkingParcel {
  /** Set once the parcel is built (saved); null for a plain parcel straight from a tap. */
  key: string | null;
  /** County parcels and drawn shapes (source "drawn"), combined by the 13b rules. */
  pieces: ParcelRecord[];
  /** A cut through the combined boundary, and the side kept. */
  split: SplitCut | null;
  house: LatLon | null;
  notes: string;
  notesAt: string | null;
  /** Layer ids hidden on the map, and results removed from the analysis. */
  hidden: string[];
  excluded: string[];
  /** The screens run on it, newest last (step 14 fills this in; Supabase `screens` ids in Phase 1). */
  screenIds: string[];
  updatedAt: string;
}

export interface ParcelStore {
  v: 2;
  /** The parcel on screen (a copy of its History entry when it's built). */
  open: WorkingParcel | null;
  /** History, oldest first: every built parcel, each with a key. */
  built: WorkingParcel[];
}

export const EMPTY_STORE: ParcelStore = { v: 2, open: null, built: [] };

/** The parcel's recipe, for lib/geo/recipe.ts. */
export const recipeOf = (p: WorkingParcel): ParcelRecipe => ({
  parts: p.pieces,
  ...(p.split ? { split: p.split } : {}),
});

/** A plain parcel: one county record, nothing else yet. */
export function plainParcel(record: ParcelRecord, now: string): WorkingParcel {
  return {
    key: null,
    pieces: [record],
    split: null,
    house: null,
    notes: "",
    notesAt: null,
    hidden: [],
    excluded: [],
    screenIds: [],
    updatedAt: now,
  };
}

/**
 * Built = changed: more than one piece, a drawn or derived piece (anything but a county record), a split, a
 * house, notes, or a screen. Once built, it stays built (it has a key).
 */
export function isBuilt(p: WorkingParcel | null): boolean {
  if (!p) return false;
  return (
    p.key !== null ||
    p.pieces.length > 1 ||
    p.pieces.some((x) => !isCountyRecord(x)) ||
    p.split !== null ||
    p.house !== null ||
    p.notes.trim() !== "" ||
    p.screenIds.length > 0
  );
}

/**
 * The open parcel after an edit. A built one gets a key (the first time) and its History entry is
 * replaced or added.
 */
export function commitOpen(s: ParcelStore, p: WorkingParcel, now: string, newKey: () => string): ParcelStore {
  const next: WorkingParcel = { ...p, updatedAt: now };
  if (!isBuilt(next)) return { ...s, open: next };
  if (next.key === null) next.key = newKey();
  const i = s.built.findIndex((b) => b.key === next.key);
  const built = i >= 0 ? s.built.map((b, j) => (j === i ? next : b)) : [...s.built, next];
  return { ...s, open: next, built };
}

/** Unselect: the open parcel closes; a built one stays in History. */
export const closeOpen = (s: ParcelStore): ParcelStore => ({ ...s, open: null });

export function openBuilt(s: ParcelStore, key: string): ParcelStore {
  const b = s.built.find((x) => x.key === key);
  return b ? { ...s, open: b } : s;
}

/** Remove from History (and close it if it's open). The only way a built parcel ever leaves. */
export function removeBuilt(s: ParcelStore, key: string): ParcelStore {
  return { ...s, built: s.built.filter((b) => b.key !== key), open: s.open?.key === key ? null : s.open };
}

/**
 * 13d's v1 record: a combination becomes its members; any other record becomes a single piece (a split piece
 * keeps its shape; the line wasn't kept before 13e). Built if it was more than a plain county parcel.
 */
export function fromV1(v1: CurrentParcel, now: string, newKey: () => string): ParcelStore {
  if (!v1.parcel) return EMPTY_STORE;
  const { members, ...record } = v1.parcel;
  const pieces = record.source === "combined" && members?.length ? members : [record];
  const p: WorkingParcel = { ...plainParcel(pieces[0]!, now), pieces, house: v1.house };
  return commitOpen(EMPTY_STORE, p, now, newKey);
}

const SplitSchema = z.object({
  a: LatLonSchema,
  b: LatLonSchema,
  keep: z.union([z.literal(1), z.literal(-1)]),
});
const WorkingSchema = z.object({
  key: z.string().nullable(),
  pieces: z.array(RecordSchema).min(1),
  split: SplitSchema.nullable(),
  house: LatLonSchema.nullable(),
  notes: z.string(),
  notesAt: z.string().nullable(),
  hidden: z.array(z.string()),
  excluded: z.array(z.string()),
  screenIds: z.array(z.string()),
  updatedAt: z.string(),
});
const StoreSchema = z.object({
  v: z.literal(2),
  open: WorkingSchema.nullable(),
  built: z.array(WorkingSchema.extend({ key: z.string() })),
});

/** What to open with: the v2 store if there is one, else 13d's v1 record converted, else nothing. */
export function loadParcelStore(
  v2: ParcelStore | null,
  v1: CurrentParcel | null,
  now: string,
  newKey: () => string,
): ParcelStore {
  return v2 ?? (v1 ? fromV1(v1, now, newKey) : EMPTY_STORE);
}

/** Reads `ps.parcels`; anything stale or malformed is dropped (null). */
export function readParcelStore(raw: string): ParcelStore | null {
  const r = StoreSchema.safeParse(JSON.parse(raw));
  return r.success ? (r.data as ParcelStore) : null;
}

export const writeParcelStore = (s: ParcelStore): string => JSON.stringify(s);
