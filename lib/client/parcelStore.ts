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
import {
  AREA_KINDS,
  FLOOD_LETTERS,
  POINT_KINDS,
  SEPTIC_CLASSES,
  type AreaMark,
  type Facts,
  type MarkKind,
  type PointMark,
  type SepticClass,
} from "@/lib/report/marks";
import type { CurrentParcel } from "./currentParcel";
import { LatLonSchema, RecordSchema } from "./currentParcel";
import { lastRank, RANK_PATTERN, rankBetween } from "./myOrder";

/**
 * A line the user drew with the parcel (follow-up 34, owner 2026-10-12), known from a deed, a plat, a survey or a
 * visit: an existing track (a drive, a lane, an ATV path) or an easement or right-of-way to the parcel, with a note
 * saying where it came from. The driveway router reads them (34-2).
 */
/**
 * What a drawn line is (owner, A, 2026-10-13): an existing track, an easement, or an existing drive. The screen reads
 * an existing drive as a track until its pricing comes with the parcel-workflow plan (drawnInput).
 */
export type LineKind = "track" | "easement" | "drive";
/** Every kind of markup: a line's, and a point's or an area's (WF4, lib/report/marks.ts). */
export type MarkupKind = LineKind | MarkKind;

/**
 * What state the line's ground is in (owner, A addition, 2026-10-13): stored and edited now; it changes no cost until
 * the parcel-workflow plan prices it (docs/plans/parcel-workflow.md).
 */
export type LineCondition = "uncleared" | "pioneer" | "improved" | "paved";
export const LINE_CONDITIONS: readonly LineCondition[] = ["uncleared", "pioneer", "improved", "paved"];

/** A line's condition until the user says otherwise (owner): a track is a pioneer cut, a drive improved. */
export const DEFAULT_CONDITION: Record<LineKind, LineCondition> = {
  track: "pioneer",
  drive: "improved",
  easement: "uncleared",
};

export interface LineMarkup {
  id: string;
  /** What the user calls it (owner, #127): "Track 2" until renamed. Separate from the note. */
  name: string;
  /** A line (follow-up 34); points and areas came with WF4. */
  shape: "line";
  kind: LineKind;
  condition: LineCondition;
  /** At least two points, [lat, lon]. */
  line: LatLon[];
  /**
   * Its width, ft (owner, #127: on every kind). The screen reads an easement's only: a track's or a drive's isn't used
   * in costs yet. Null only for a line made before #127, which gets its kind's default when it loads.
   */
  widthFt: number | null;
  note: string;
  /**
   * Where an easement is recorded, as typed (owner, WF5): "Ashe Co. Plat Bk 574 Pg 1132". Filled, the card no longer asks
   * that the easement be verified; it says where it's recorded. "" when not given; offered on easements only.
   */
  recordedIn: string;
  /**
   * What an easement is for (step 14, plan §3.2): a road right-of-way, a utility's, a scenic one, or other. What limits
   * you lists it; nothing else reads it. Absent or null: not given (a line kept before step 14, or never set).
   */
  easementType?: EasementType | null;
  at: string;
}

/** An easement's purpose (step 14, plan §3.2), in the order the picker offers them. */
export type EasementType = "row" | "utility" | "scenic" | "other";
export const EASEMENT_TYPES: readonly EasementType[] = ["row", "utility", "scenic", "other"];

/**
 * A point or area marker (WF4, docs/plans/parcel-workflow.md §3.1–3.2): a spring, a well, a septic permit, a building,
 * power, a campsite, a gate or a note at a point; a septic permit's field or a clearing as an area. Named per kind
 * ("Spring 1") with a note, as lines are. Never sent to the screen: the card reads them (lib/report/marks.ts).
 */
interface MarkFields {
  name: string;
  /** A septic permit's class, as typed from the permit (owner, WF4: stored now; VR4 prices it). Null for others. */
  septicClass: SepticClass | null;
  note: string;
  at: string;
}
export type PointMarkup = PointMark & MarkFields;
export type AreaMarkup = AreaMark & MarkFields;

/** What the user drew with the parcel: lines (follow-up 34), and points and areas (WF4). */
export type Markup = LineMarkup | PointMarkup | AreaMarkup;
export const isLine = (m: Markup): m is LineMarkup => m.shape === "line";
/** The drawn lines alone: the only markup the screen reads. */
export const linesOf = (markup: readonly Markup[]): LineMarkup[] => markup.filter(isLine);

/** Each kind as the app names it (owner, #127; WF4): the layer, the chips and a default name. */
export const KIND_NAME: Record<MarkupKind, string> = {
  track: "Track",
  easement: "Easement",
  drive: "Existing drive",
  spring: "Spring",
  stream: "Stream",
  well: "Well",
  septic: "Septic permit",
  building: "Building",
  power: "Power",
  campsite: "Campsite",
  gate: "Gate",
  note: "Note",
  clearing: "Clearing",
};

const defaultNumber = (name: string, kind: MarkupKind): number | null => {
  const m = new RegExp(`^${KIND_NAME[kind]} (\\d+)$`).exec(name);
  return m ? Number(m[1]) : null;
};
/** A default name, "Track 2", as opposed to one the user typed. */
export const isDefaultName = (name: string, kind: MarkupKind): boolean => defaultNumber(name, kind) !== null;

/** The next default name for a kind (owner, #127; WF4 for markers): numbered per kind, one past the highest in use. */
export function nextMarkupName(markup: readonly Pick<Markup, "name" | "kind">[], kind: MarkupKind): string {
  const used = markup.map((m) => defaultNumber(m.name, kind) ?? 0);
  return `${KIND_NAME[kind]} ${Math.max(0, ...used) + 1}`;
}

/** An easement's width until the user says otherwise: a common recorded right-of-way width. */
export const EASEMENT_WIDTH_FT = 30;

/** A line's width until the user says otherwise (owner, #127): an easement's as before, a track 10 ft, a drive 12 ft. */
export const DEFAULT_WIDTH_FT: Record<LineKind, number> = {
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
  // Points and areas (WF4) never reach it: the card reads them.
  linesOf(markup).map(({ id, kind, line, widthFt }) =>
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
  /**
   * The listing's facts, as the user typed them (WF1, docs/plans/parcel-workflow.md §2): a name of the household's own
   * ("" until typed: the derived name shows), the listing's link (never fetched), the acres it claims, and the agent
   * (a third party's contact: kept with the parcel, never put in a URL or sent anywhere).
   */
  name: string;
  listingUrl: string;
  listingAcres: number | null;
  agent: string;
  /**
   * Step 14 (plan §3.2): the deed's restrictions as typed ("" until typed), and whether there's an HOA. What limits you
   * lists them; neither reaches the engine or the card. Optional fields with defaults, so `v` stays 2.
   */
  deedRestrictions: string;
  hoa: Hoa;
  /**
   * Step 15 (plan §5.1–§5.2): the county's assessed value as typed, with its tax year, and a timber cruise's value and
   * date. How it could pay reads them; neither reaches the engine or the card. Defaults of null, so `v` stays 2.
   */
  assessed: Assessed | null;
  timberCruise: TimberCruise | null;
  /**
   * Owner, after #312: which of the two a piece added from a split brought from its parcel ("from the original parcel");
   * an edit of one makes it the person's own. Absent: none.
   */
  fromOriginal?: FromOriginal[];
  /**
   * Where the household stands on it (WF2, docs/plans/parcel-workflow.md §4): in progress (the default), saved (a
   * contender to keep), or archived, with the reason and what it was before (Restore puts that back). Archiving keeps
   * everything; Remove is still the only delete.
   */
  status: ParcelStatus;
  archived: Archived | null;
  /** Walked and Offered (owner, #128): tags beside the status, each with its date ("2026-10-20"), or null. */
  milestones: Milestones;
  /**
   * Its place in My order (WF3, docs/plans/parcel-workflow.md §5): a fractional index (lib/client/myOrder.ts), given
   * when the parcel is built, at the bottom. Null until then; a parcel kept before WF3 gets one when the store is read.
   */
  rank: string | null;
  /** Drawn tracks and easements (follow-up 34). */
  markup: Markup[];
  /**
   * The drawn line the household chose as its driveway (WF5, docs/plans/parcel-workflow.md §3.4), by id: the card
   * scores the route the screen found from its end. Null for the app's pick.
   */
  drivewayLine: string | null;
  /** Layer ids hidden on the map, and results removed from the analysis. */
  hidden: string[];
  excluded: string[];
  /** The screens run on it, newest last (step 14 fills this in; Supabase `screens` ids in Phase 1). */
  screenIds: string[];
  /**
   * The profile that first kept it (step 6: "Added by Zach" on the household's shared list), set when it's built or
   * imported; null for a parcel kept before step 6. An optional field with a null default, so `v` stays 2.
   */
  addedBy: string | null;
  /**
   * Splits tried on it (step 14, plan §5: "Keep this, sell that"), oldest first: each a line across the parts and the
   * screen of each piece. The pieces' screens are kept and synced as any screen is, but they aren't in `screenIds`: the
   * parcel's own history is unchanged. An optional field with an empty default, so `v` stays 2.
   */
  scenarios: Scenario[];
  /**
   * Facts about the parcel a document settles (J-5, UX part 2 PR 3c; docs/plans/ux-part-2.md §5), marked once for the
   * household: every member's grade, the cost and the print read them. Absent: none. An optional field, so `v` stays 2.
   */
  facts?: Facts;
  updatedAt: string;
}

/**
 * A split tried on a parcel (step 14, plan §5.2): the line a→b across the parcel's parts (the same cut as a `split`),
 * and each piece's screen by id, left and right of the direction a→b; null until it's graded, or when it didn't grade.
 */
export interface Scenario {
  id: string;
  /** "Split 1" until renamed. */
  name: string;
  a: LatLon;
  b: LatLon;
  screens: PieceScreens;
  at: string;
  /** Step 15 (plan §4): the break-even's inputs as typed; each absent one is its default. Absent: all defaults. */
  breakEven?: BreakEvenInputs;
}
/** A split's break-even inputs as typed (step 15 §4): each optional, so the default stands until it's typed. */
export interface BreakEvenInputs {
  price?: number;
  /** The sold piece's share of the land, percent. */
  sharePct?: number;
  years?: number;
  ratePct?: number;
  survey?: number;
  legal?: number;
  road?: number;
  soldSide?: "left" | "right";
  /** "If it sold for", $/ac. */
  soldAtPerAc?: number;
}
export interface PieceScreens {
  left: string | null;
  right: string | null;
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

export type ParcelStatus = "inProgress" | "saved" | "archived";
export type ActiveStatus = Exclude<ParcelStatus, "archived">;

export interface Archived {
  /** "Not for us", "Sold", "Rejected: the septic test failed", or the household's own words. */
  reason: string;
  at: string;
  /** The status it had: Restore returns to it. */
  from: ActiveStatus;
}

export type Milestone = "walked" | "offered";
export type Milestones = Record<Milestone, string | null>;

/** The quick picks for an archive's reason (owner, #128); "Rejected: " opens the box for the rest. */
/** Not for us's reasons (UX part 2, §9 Q5): each optional, as is the note after it. */
export const RULE_OUT_REASONS = ["Too steep", "Road access", "Septic", "Price", "Too far", "Other"] as const;

/** The reason kept: the chip picked, then the note ("Septic: perc failed"); either alone; or "" for none. */
export const ruleOutReason = (chip: string | null, note: string): string =>
  [chip, note.trim()].filter(Boolean).join(": ");

/** A parcel's standing before any is set (WF2). */
export const NO_STATUS: Pick<WorkingParcel, "status" | "archived" | "milestones"> = {
  status: "inProgress",
  archived: null,
  milestones: { walked: null, offered: null },
};

/** The listing facts of a parcel that has none (WF1). */
export const NO_LISTING: Pick<WorkingParcel, ListingField> = {
  name: "",
  listingUrl: "",
  listingAcres: null,
  agent: "",
  deedRestrictions: "",
  hoa: "unknown",
  assessed: null,
  timberCruise: null,
};
export type ListingField =
  "name" | "listingUrl" | "listingAcres" | "agent" | "deedRestrictions" | "hoa" | "assessed" | "timberCruise";

/** The county's assessed value, as typed from its record, and the tax year it's for (step 15 §5.2). */
export interface Assessed {
  value: number;
  year: number | null;
}
/** A timber cruise's value and its date, as typed (step 15 §5.1). */
export interface TimberCruise {
  value: number;
  /** As typed: "2026-09", "Sept 2026". */
  date: string;
}

/** Whether the parcel has an HOA, as the household knows it (step 14, plan §3.2). */
export type Hoa = "yes" | "no" | "unknown";
export const HOA_VALUES: readonly Hoa[] = ["yes", "no", "unknown"];
/** The listing facts a piece added from a split copies from its parcel (owner, after #312). */
export type FromOriginal = "deedRestrictions" | "hoa";
export const FROM_ORIGINAL: readonly FromOriginal[] = ["deedRestrictions", "hoa"];

/** A name read from the notes is used only this short (owner, #130). */
export const NOTES_NAME_MAX = 60;

const short = (name: string) => (name.length <= NOTES_NAME_MAX ? name : "");
/** The text after "Name:" on the notes' first line (any case, spaces or none), or null when it doesn't start so. */
const nameLine = (notes: string): string | null =>
  /^name\s*:\s*(.*)$/i.exec((notes.split("\n")[0] ?? "").trim())?.[1]?.trim() ?? null;

/**
 * A prototype import's name (owner, #130, #133): the text after "Name:" on the notes' first line (the prototype's
 * saved name), else the line itself, when it's NOTES_NAME_MAX characters or less; otherwise none.
 */
export function nameFromNotes(notes: string): string {
  return short(nameLine(notes) ?? (notes.split("\n")[0] ?? "").trim());
}

/**
 * A parcel with no name whose notes start with "Name: …" takes that name (owner, #133: an import, and once on load for
 * parcels imported before names existed). The notes stay as they are; a parcel with a name is left alone.
 */
export function withNameFromNotes(p: WorkingParcel): WorkingParcel {
  if (p.name.trim()) return p;
  const name = short(nameLine(p.notes) ?? "");
  return name ? { ...p, name } : p;
}

/** Every parcel in the store, as withNameFromNotes (run once per browser on load, owner #133: prefs.ts). */
export const withNamesFromNotes = (s: ParcelStore): ParcelStore => ({
  ...s,
  open: s.open && withNameFromNotes(s.open),
  built: s.built.map(withNameFromNotes),
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
    ...NO_LISTING,
    ...NO_STATUS,
    rank: null,
    markup: [],
    drivewayLine: null,
    hidden: [],
    excluded: [],
    screenIds: [],
    addedBy: null,
    scenarios: [],
    updatedAt: now,
  };
}

/**
 * Built = changed: more than one piece, a drawn or derived piece (anything but a county record), a split, a
 * house, notes, a price or a listing fact, a status or milestone, a drawn line, a screen, or a split tried on it. Once
 * built, it stays built
 * (it has a key).
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
    p.name.trim() !== "" ||
    p.listingUrl.trim() !== "" ||
    p.listingAcres !== null ||
    p.agent.trim() !== "" ||
    p.deedRestrictions.trim() !== "" ||
    p.hoa !== "unknown" ||
    p.assessed !== null ||
    p.timberCruise !== null ||
    p.status !== "inProgress" ||
    p.milestones.walked !== null ||
    p.milestones.offered !== null ||
    p.markup.length > 0 ||
    p.screenIds.length > 0 ||
    p.scenarios.length > 0
  );
}

/**
 * The open parcel after an edit. A built one gets a key (the first time) and its History entry is
 * replaced or added.
 */
export function commitOpen(
  s: ParcelStore,
  p: WorkingParcel,
  now: string,
  newKey: () => string,
  /** Who's keeping it (step 6): recorded as `addedBy` when it's first built. */
  by: string | null = null,
): ParcelStore {
  const next: WorkingParcel = { ...p, updatedAt: now };
  if (!isBuilt(next)) return { ...s, open: next };
  if (next.key === null) {
    next.key = newKey();
    next.addedBy = next.addedBy ?? by;
    // A new parcel goes to the bottom of My order (WF3).
    next.rank = rankBetween(lastRank(s.built), null);
  }
  const i = s.built.findIndex((b) => b.key === next.key);
  const built = i >= 0 ? s.built.map((b, j) => (j === i ? next : b)) : [...s.built, next];
  return { ...s, open: next, built };
}

/**
 * A History entry changed somewhere other than the explorer (WF2b: the list): replaced in place, and as the open
 * parcel too when it's the one open. Unchanged (`edit` returns it as it was) saves nothing.
 */
export function editBuilt(
  s: ParcelStore,
  key: string,
  edit: (p: WorkingParcel) => WorkingParcel,
  now: string,
): ParcelStore {
  const b = s.built.find((x) => x.key === key);
  if (!b) return s;
  const changed = edit(b);
  if (changed === b) return s;
  const next = { ...changed, updatedAt: now };
  return {
    ...s,
    built: s.built.map((x) => (x.key === key ? next : x)),
    open: s.open?.key === key ? next : s.open,
  };
}

/**
 * A History parcel moved in My order (WF3): its rank only. Not a change to the parcel itself, so its updatedAt (the
 * list's "Last changed") stays.
 */
export function rankBuilt(s: ParcelStore, key: string, rank: string): ParcelStore {
  const b = s.built.find((x) => x.key === key);
  if (!b || b.rank === rank) return s;
  const next = { ...b, rank };
  return {
    ...s,
    built: s.built.map((x) => (x.key === key ? next : x)),
    open: s.open?.key === key ? { ...s.open, rank } : s.open,
  };
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
const ScenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
  a: LatLonSchema,
  b: LatLonSchema,
  screens: z.object({ left: z.string().nullable(), right: z.string().nullable() }),
  at: z.string(),
  // Added with step 15: a scenario kept before has its defaults.
  breakEven: z
    .object({
      price: z.number().nonnegative().optional(),
      sharePct: z.number().min(0).max(100).optional(),
      years: z.number().min(0).optional(),
      ratePct: z.number().min(0).optional(),
      survey: z.number().nonnegative().optional(),
      legal: z.number().nonnegative().optional(),
      road: z.number().nonnegative().optional(),
      soldSide: z.enum(["left", "right"]).optional(),
      soldAtPerAc: z.number().nonnegative().optional(),
    })
    .optional(),
});
const LineSchema = z
  .object({
    id: z.string(),
    // Added with #127: a line kept before has none, and gets its kind's default in the order drawn (below).
    name: z.string().optional(),
    shape: z.literal("line"),
    kind: z.enum(["track", "easement", "drive"]),
    // Added with A (owner, 2026-10-13): a line kept before has none, and gets its kind's default.
    condition: z.enum(["uncleared", "pioneer", "improved", "paved"]).optional(),
    line: z.array(LatLonSchema).min(2),
    widthFt: z.number().positive().nullable(),
    note: z.string(),
    // Added with WF5: a line kept before has no record.
    recordedIn: z.string().default(""),
    // Added with step 14: a line kept before has no purpose given, and stays without one.
    easementType: z.enum(EASEMENT_TYPES).nullable().optional(),
    at: z.string(),
  })
  .transform((m): Omit<LineMarkup, "name"> & { name?: string } => ({
    ...m,
    condition: m.condition ?? DEFAULT_CONDITION[m.kind],
    // Owner, #127: every kind has a width now; a line kept before gets its kind's.
    widthFt: m.widthFt ?? DEFAULT_WIDTH_FT[m.kind],
  }));
const markFields = {
  id: z.string(),
  name: z.string(),
  septicClass: z.enum(SEPTIC_CLASSES).nullable().default(null),
  note: z.string(),
  at: z.string(),
};
const PointSchema = z.object({
  ...markFields,
  shape: z.literal("point"),
  kind: z.enum(POINT_KINDS),
  ll: LatLonSchema,
});
const AreaSchema = z.object({
  ...markFields,
  shape: z.literal("area"),
  kind: z.enum(AREA_KINDS),
  ring: z.array(LatLonSchema).min(3),
});
/** A line kept before WF4 has no shape: it's a line. */
const MarkupSchema = z.preprocess(
  (m) => (typeof m === "object" && m !== null && !("shape" in m) ? { ...m, shape: "line" } : m),
  z.union([LineSchema, PointSchema, AreaSchema]),
);
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
  // Added with WF1: a parcel kept before has none.
  name: z.string().default(""),
  listingUrl: z.string().default(""),
  listingAcres: z.number().positive().nullable().default(null),
  agent: z.string().default(""),
  // Added with step 14: a parcel kept before has no restrictions typed, and an HOA not known.
  deedRestrictions: z.string().default(""),
  hoa: z.enum(HOA_VALUES).default("unknown"),
  // Added with step 15: a parcel kept before has neither typed.
  assessed: z
    .object({ value: z.number().nonnegative(), year: z.number().int().nullable() })
    .nullable()
    .default(null),
  timberCruise: z.object({ value: z.number().nonnegative(), date: z.string() }).nullable().default(null),
  // Added after #312: a parcel kept before brought nothing from another.
  fromOriginal: z.array(z.enum(FROM_ORIGINAL)).optional(),
  // Added with WF2: a parcel kept before is in progress, with no milestones.
  status: z.enum(["inProgress", "saved", "archived"]).default("inProgress"),
  archived: z
    .object({ reason: z.string(), at: z.string(), from: z.enum(["inProgress", "saved"]) })
    .nullable()
    .default(null),
  milestones: z
    .object({ walked: z.string().nullable(), offered: z.string().nullable() })
    .default({ walked: null, offered: null }),
  // Added with WF3: a parcel kept before has none, and goes to the bottom of My order when read (myOrder.ts withRanks);
  // so does one whose rank isn't well formed, rather than the whole store being dropped.
  rank: z.string().regex(RANK_PATTERN).nullable().catch(null),
  // Added with follow-up 34: a parcel kept before has none.
  markup: z
    .array(MarkupSchema)
    .default([])
    .transform((lines) =>
      lines.reduce<Markup[]>(
        (named, m) => [
          ...named,
          m.shape === "line" ? { ...m, name: m.name ?? nextMarkupName(named, m.kind) } : m,
        ],
        [],
      ),
    ),
  // Added with WF5: a parcel kept before scores the app's pick.
  drivewayLine: z.string().nullable().default(null),
  hidden: z.array(z.string()),
  excluded: z.array(z.string()),
  screenIds: z.array(z.string()),
  // Added with step 6: a parcel kept before says nothing about who added it.
  addedBy: z.string().nullable().default(null),
  // Added with step 14: a parcel kept before has no split tried on it.
  scenarios: z.array(ScenarioSchema).default([]),
  // Added with UX part 2 (J-5): a parcel kept before has no facts marked.
  facts: z
    .object({
      floodLetter: z.object({ kind: z.enum(FLOOD_LETTERS), at: z.string() }).optional(),
      service: z.object({ power: z.boolean(), internet: z.boolean(), at: z.string() }).optional(),
      survey: z
        .object({
          acres: z.number().positive().nullable(),
          frontageFt: z.number().nonnegative().nullable(),
          at: z.string(),
        })
        .optional(),
    })
    .optional(),
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
