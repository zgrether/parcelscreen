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
import type { DrawnInput } from "@/lib/screen/types";
import type { CurrentParcel } from "./currentParcel";
import { LatLonSchema, RecordSchema } from "./currentParcel";

/**
 * A line the user drew with the parcel (follow-up 34, owner 2026-10-12), known from a deed, a plat, a survey or a
 * visit: an existing track (a drive, a lane, an ATV path) or an easement or right-of-way to the parcel, with a note
 * saying where it came from. The driveway router reads them (34-2).
 */
/**
 * What a drawn line is (owner, A, 2026-10-13): an existing track, an easement, or an existing drive. The screen reads
 * an existing drive as a track until its pricing comes with the parcel-workflow plan (drawnInput).
 */
export type MarkupKind = "track" | "easement" | "drive";

/**
 * What state the line's ground is in (owner, A addition, 2026-10-13): stored and edited now; it changes no cost until
 * the parcel-workflow plan prices it (docs/plans/parcel-workflow.md).
 */
export type LineCondition = "uncleared" | "pioneer" | "improved" | "paved";
export const LINE_CONDITIONS: readonly LineCondition[] = ["uncleared", "pioneer", "improved", "paved"];

/** A line's condition until the user says otherwise (owner): a track is a pioneer cut, a drive improved. */
export const DEFAULT_CONDITION: Record<MarkupKind, LineCondition> = {
  track: "pioneer",
  drive: "improved",
  easement: "uncleared",
};

export interface Markup {
  id: string;
  /** What the user calls it (owner, #127): "Track 2" until renamed. Separate from the note. */
  name: string;
  kind: MarkupKind;
  condition: LineCondition;
  /** At least two points, [lat, lon]. */
  line: LatLon[];
  /**
   * Its width, ft (owner, #127: on every kind). The screen reads an easement's only: a track's or a drive's isn't used
   * in costs yet. Null only for a line made before #127, which gets its kind's default when it loads.
   */
  widthFt: number | null;
  note: string;
  at: string;
}

/** Each kind as the app names it (owner, #127): the layer, the chips and a line's default name. */
export const KIND_NAME: Record<MarkupKind, string> = {
  track: "Track",
  easement: "Easement",
  drive: "Existing drive",
};

const defaultNumber = (name: string, kind: MarkupKind): number | null => {
  const m = new RegExp(`^${KIND_NAME[kind]} (\\d+)$`).exec(name);
  return m ? Number(m[1]) : null;
};
/** A default name, "Track 2", as opposed to one the user typed. */
export const isDefaultName = (name: string, kind: MarkupKind): boolean => defaultNumber(name, kind) !== null;

/** The next default name for a kind (owner, #127): numbered per kind, one past the highest in use. */
export function nextLineName(markup: readonly Pick<Markup, "name" | "kind">[], kind: MarkupKind): string {
  const used = markup.map((m) => defaultNumber(m.name, kind) ?? 0);
  return `${KIND_NAME[kind]} ${Math.max(0, ...used) + 1}`;
}

/** An easement's width until the user says otherwise: a common recorded right-of-way width. */
export const EASEMENT_WIDTH_FT = 30;

/** A line's width until the user says otherwise (owner, #127): an easement's as before, a track 10 ft, a drive 12 ft. */
export const DEFAULT_WIDTH_FT: Record<MarkupKind, number> = {
  easement: EASEMENT_WIDTH_FT,
  track: 10,
  drive: 12,
};

/**
 * The lines as the screen reads them (ScreenInput.lines): without their notes, times and conditions, and an existing
 * drive as a track (owner, A: no pricing change until the parcel-workflow plan).
 */
export const drawnInput = (markup: readonly Markup[]): DrawnInput[] =>
  // A track's or a drive's width isn't used in costs yet (owner, #127): the screen sees an easement's only, as before.
  markup.map(({ id, kind, line, widthFt }) =>
    kind === "easement" ? { id, kind, line, widthFt } : { id, kind: "track", line, widthFt: null },
  );

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
  /**
   * The asking price in dollars, as the user entered it, and when (owner, #101, 2026-10-11): on the parcel, not in
   * the screen result, since a price changes while the land doesn't. Phase 1 turns each into a price-history event.
   */
  askingPrice: number | null;
  askingPriceAt: string | null;
  /** Drawn tracks and easements (follow-up 34). */
  markup: Markup[];
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
    askingPrice: null,
    askingPriceAt: null,
    markup: [],
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
    p.askingPrice !== null ||
    p.markup.length > 0 ||
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
const MarkupSchema = z
  .object({
    id: z.string(),
    // Added with #127: a line kept before has none, and gets its kind's default in the order drawn (below).
    name: z.string().optional(),
    kind: z.enum(["track", "easement", "drive"]),
    // Added with A (owner, 2026-10-13): a line kept before has none, and gets its kind's default.
    condition: z.enum(["uncleared", "pioneer", "improved", "paved"]).optional(),
    line: z.array(LatLonSchema).min(2),
    widthFt: z.number().positive().nullable(),
    note: z.string(),
    at: z.string(),
  })
  .transform((m): Omit<Markup, "name"> & { name?: string } => ({
    ...m,
    condition: m.condition ?? DEFAULT_CONDITION[m.kind],
    // Owner, #127: every kind has a width now; a line kept before gets its kind's.
    widthFt: m.widthFt ?? DEFAULT_WIDTH_FT[m.kind],
  }));
const WorkingSchema = z.object({
  key: z.string().nullable(),
  pieces: z.array(RecordSchema).min(1),
  split: SplitSchema.nullable(),
  house: LatLonSchema.nullable(),
  notes: z.string(),
  notesAt: z.string().nullable(),
  // Added after the store's v2 (B2a): a parcel kept before has no price.
  askingPrice: z.number().nonnegative().nullable().default(null),
  askingPriceAt: z.string().nullable().default(null),
  // Added with follow-up 34: a parcel kept before has none.
  markup: z
    .array(MarkupSchema)
    .default([])
    .transform((lines) =>
      lines.reduce<Markup[]>(
        (named, m) => [...named, { ...m, name: m.name ?? nextLineName(named, m.kind) }],
        [],
      ),
    ),
  hidden: z.array(z.string()),
  excluded: z.array(z.string()),
  screenIds: z.array(z.string()),
  updatedAt: z.string(),
});
export const ParcelStoreSchema = z.object({
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
  const r = ParcelStoreSchema.safeParse(JSON.parse(raw));
  return r.success ? (r.data as ParcelStore) : null;
}

export const writeParcelStore = (s: ParcelStore): string => JSON.stringify(s);
