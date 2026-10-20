/**
 * The household's list (WF2b, docs/plans/parcel-workflow.md §5–§6): one row per History parcel with its name, acres,
 * price, state, status and milestones, and both people's grades with the household verdict, the lower of the two
 * (owner, #128). Filters and sorts are views: they never change a parcel. Pure; components/Library renders it.
 */
import { centroid } from "@turf/turf";
import { z } from "zod";
import { stateOf } from "@/lib/geo/parcelFields";
import { deriveParcel } from "@/lib/geo/recipe";
import { parcelFacts } from "@/lib/geo/parcels";
import { reportCard, type Letter, type NamedRubric, type Verdict } from "@/lib/report/card";
import { defaultNamedRubric } from "@/lib/rubric/default";
import { drawnOf } from "@/lib/report/marks";
import { SCREEN_CONSTANTS } from "@/lib/screen/config";
import { kmToState, type StateCode } from "@/lib/screen/states";
import { parcelName } from "./historyRows";
import { byRank } from "./myOrder";
import { recipeOf, type Milestone, type ParcelStatus, type WorkingParcel } from "./parcelStore";
import type { KeptScreen } from "./useKeptScreens";

/** The verdicts, worst first: the household's is the lowest across the profile's rubrics. */
export const VERDICTS: readonly Verdict[] = ["Pass", "Maybe", "Contender"];
const rank = (v: Verdict) => VERDICTS.indexOf(v);

/** The lowest of these verdicts: the household's (step 1: across the profile's own rubric and the others it holds). */
export const lowestVerdict = (vs: readonly Verdict[]): Verdict =>
  vs.reduce((a, b) => (rank(a) <= rank(b) ? a : b));

/** Contender only when both say Contender; Pass when either says Pass (owner, #128). */
export const householdVerdict = (a: Verdict, b: Verdict): Verdict => (rank(a) <= rank(b) ? a : b);

export interface Graded {
  grade: Letter | null;
  verdict: Verdict;
}

/** A parcel with no current screen: never screened, or screened under earlier rules (it re-screens when opened). */
export type Unscreened = "none" | "rescreen";

export interface LibraryRow {
  key: string;
  name: string;
  acres: number | null;
  price: number | null;
  /**
   * The US states, from the county services ("TN · NC" for a parcel combined across the line, step 2) or else where
   * the parcel lies; empty when neither tells.
   */
  states: StateCode[];
  county: string | null;
  status: ParcelStatus;
  milestones: WorkingParcel["milestones"];
  /**
   * Each rubric's grade and verdict, the profile's own first (step 1), null without a current screen; and the
   * household verdict, the lowest across them (its own alone, for a profile holding no other rubric: the list shows
   * the column only when there are several).
   */
  grades: { id: string; name: string; graded: Graded | null }[];
  household: Verdict | null;
  /** Why there's no grade, when there isn't. */
  unscreened: Unscreened | null;
  updatedAt: string;
  /** Its place in My order (WF3, lib/client/myOrder.ts). */
  rank: string | null;
}

const STATES: readonly StateCode[] = ["VA", "NC", "TN"];

/**
 * The parcel's states: those of its county records' services, in piece order (a parcel combined across the TN/NC
 * line has both, step 2), else the state its boundary's centre lies in; empty when that's none of the three.
 */
export function parcelStates(p: WorkingParcel): StateCode[] {
  const own = [...new Set(p.pieces.map((x) => stateOf(x.source)).filter((s): s is StateCode => s !== null))];
  if (own.length) return own;
  const d = deriveParcel(recipeOf(p), SCREEN_CONSTANTS.combine);
  const geo = d.ok ? d.record.geo : p.pieces[0]?.geo;
  if (!geo) return [];
  const [lon, lat] = centroid(geo).geometry.coordinates as [number, number];
  const s = STATES.find((x) => kmToState(x, [lat, lon]) <= 0);
  return s ? [s] : [];
}

/** "Floyd Co." from a county record's "Floyd County", "FLOYD" or "Floyd". */
export function countyShort(county: string): string {
  const c = county.trim().replace(/\s+county$/i, "");
  return `${c.toLowerCase().replace(/\b[a-z]/g, (x) => x.toUpperCase())} Co.`;
}

/**
 * The name a row shows (owner, after #133): the household's name for the parcel, else "{parcel ID} · {County} Co.",
 * so two parcels with the same number in different counties read apart.
 */
export function listName(p: WorkingParcel, county: string | null): string {
  const { name } = parcelName(p);
  if (p.name.trim() || !county) return name;
  return `${name} · ${countyShort(county)}`;
}

export function libraryRow(
  p: WorkingParcel,
  kept: KeptScreen | undefined,
  rubrics: readonly NamedRubric[] = [defaultNamedRubric()],
): LibraryRow {
  const { acres } = parcelName(p);
  const county = p.pieces.map((x) => parcelFacts(x.geo, x.props).county).find((c) => !!c) ?? null;
  const result = kept?.state === "ok" ? kept.result : null;
  const graded = (nr: NamedRubric): Graded | null => {
    if (!result) return null;
    const c = reportCard(result, nr, drawnOf(p.markup, p.drivewayLine));
    return { grade: c.grade, verdict: c.verdict };
  };
  const grades = rubrics.map((nr) => ({ id: nr.id, name: nr.name, graded: graded(nr) }));
  const verdicts = grades.map((g) => g.graded?.verdict).filter((v): v is Verdict => !!v);
  return {
    key: p.key!,
    name: listName(p, county),
    acres,
    price: p.askingPrice,
    states: parcelStates(p),
    county,
    status: p.status,
    milestones: p.milestones,
    grades,
    household: verdicts.length === rubrics.length && verdicts.length > 0 ? lowestVerdict(verdicts) : null,
    unscreened: result ? null : kept?.state === "rescreen" ? "rescreen" : "none",
    updatedAt: p.updatedAt,
    rank: p.rank,
  };
}

// ---------- filters ----------

/** A verdict filter's choices: the three verdicts, and parcels without one yet. */
export type VerdictChoice = Verdict | "unscreened";
export const VERDICT_CHOICES: readonly VerdictChoice[] = ["Contender", "Maybe", "Pass", "unscreened"];

export interface LibraryFilters {
  status: ParcelStatus[];
  /** The household verdict (owner, #128: the default filter uses it). */
  household: VerdictChoice[];
  /** Each rubric's verdict, by rubric id (step 1); a rubric not listed passes every verdict. */
  grades: Record<string, VerdictChoice[]>;
  /** Must have these milestones. */
  milestones: Milestone[];
  /** Asking price, dollars: a parcel without a price passes only when neither bound is set. */
  priceMin: number | null;
  priceMax: number | null;
  state: StateCode | null;
}

/**
 * In progress and Saved (archived parcels hidden, a filter shows them); the household's Contenders and Maybes, and
 * parcels not screened yet, which have no verdict to judge.
 */
export const DEFAULT_FILTERS: LibraryFilters = {
  status: ["inProgress", "saved"],
  household: ["Contender", "Maybe", "unscreened"],
  grades: {},
  milestones: [],
  priceMin: null,
  priceMax: null,
  state: null,
};

const choice = (v: Verdict | null): VerdictChoice => v ?? "unscreened";

export function passes(r: LibraryRow, f: LibraryFilters): boolean {
  if (!f.status.includes(r.status)) return false;
  if (!f.household.includes(choice(r.household))) return false;
  for (const [id, choices] of Object.entries(f.grades)) {
    const g = r.grades.find((x) => x.id === id);
    if (g && !choices.includes(choice(g.graded?.verdict ?? null))) return false;
  }
  if (f.milestones.some((m) => r.milestones[m] === null)) return false;
  if (f.priceMin !== null || f.priceMax !== null) {
    if (r.price === null) return false;
    if (f.priceMin !== null && r.price < f.priceMin) return false;
    if (f.priceMax !== null && r.price > f.priceMax) return false;
  }
  return f.state === null || r.states.includes(f.state);
}

// ---------- sorts ----------

/** "grade:<rubric id>" sorts by that rubric's grade (step 1). */
export type SortKey = "order" | "updated" | "price" | "acres" | "household" | "lowest" | `grade:${string}`;
export const gradeSortKey = (id: string): SortKey => `grade:${id}`;
export interface LibrarySort {
  key: SortKey;
  /** Each key's natural order (the newest, the cheapest, the largest, the best), or its reverse. */
  reversed: boolean;
}
/** My order (WF3, docs/plans/parcel-workflow.md §5): the household's own, the only order a drag changes. */
export const DEFAULT_SORT: LibrarySort = { key: "order", reversed: false };

const LETTER_RANK: Record<Letter, number> = { A: 0, B: 1, C: 2, D: 3, F: 4 };
/** Best first: the verdict, then the grade. */
const gradedRank = (g: Graded | null): number | null =>
  g ? (2 - rank(g.verdict)) * 10 + (g.grade === null ? 5 : LETTER_RANK[g.grade]) : null;

/**
 * Lowest of our grades (step 6, docs/plans/step-6-household.md §3.1): each parcel by the worst of its graded rubrics' grades
 * (the members with priorities), best first; null with none graded.
 */
export function lowestOfOurs(r: LibraryRow): number | null {
  const ranks = r.grades.map((g) => gradedRank(g.graded)).filter((x): x is number => x !== null);
  return ranks.length ? Math.max(...ranks) : null;
}

/** Each key's value in its natural order (smaller first); null (no price, no screen) always sorts last. */
const sortValue = (r: LibraryRow, k: Exclude<SortKey, "order">): number | string | null => {
  switch (k) {
    case "updated":
      return r.updatedAt === "" ? null : -Date.parse(r.updatedAt);
    case "price":
      return r.price;
    case "acres":
      return r.acres === null ? null : -r.acres;
    case "household":
      return r.household === null ? null : 2 - rank(r.household);
    case "lowest":
      return lowestOfOurs(r);
    default:
      return gradedRank(r.grades.find((g) => g.id === k.slice("grade:".length))?.graded ?? null);
  }
};

export function sortRows(rows: readonly LibraryRow[], s: LibrarySort): LibraryRow[] {
  if (s.key === "order") {
    const ordered = [...rows].sort(byRank);
    return s.reversed ? ordered.reverse() : ordered;
  }
  const key = s.key;
  return [...rows].sort((a, b) => {
    const x = sortValue(a, key),
      y = sortValue(b, key);
    if (x === null || y === null) return x === y ? a.name.localeCompare(b.name) : x === null ? 1 : -1;
    const d = x < y ? -1 : x > y ? 1 : 0;
    return (s.reversed ? -d : d) || a.name.localeCompare(b.name);
  });
}

// ---------- the remembered view (ps.library) ----------

export interface LibraryView {
  filters: LibraryFilters;
  sort: LibrarySort;
}
export const DEFAULT_VIEW: LibraryView = { filters: DEFAULT_FILTERS, sort: DEFAULT_SORT };

const Choice = z.enum(["Contender", "Maybe", "Pass", "unscreened"]);
const ViewSchema = z.object({
  filters: z.object({
    status: z.array(z.enum(["inProgress", "saved", "archived"])),
    household: z.array(Choice),
    grades: z.record(z.string(), z.array(Choice)),
    milestones: z.array(z.enum(["walked", "offered"])),
    priceMin: z.number().nullable(),
    priceMax: z.number().nullable(),
    state: z.enum(["VA", "NC", "TN"]).nullable(),
  }),
  sort: z.object({
    key: z
      .string()
      .refine(
        (k): k is SortKey =>
          ["order", "updated", "price", "acres", "household", "lowest"].includes(k) || k.startsWith("grade:"),
      ),
    reversed: z.boolean(),
  }),
});

/** A stored view, or the default when it's missing or from another shape. */
export function readLibraryView(raw: string): LibraryView {
  const v = ViewSchema.safeParse(JSON.parse(raw));
  return v.success ? v.data : DEFAULT_VIEW;
}

// ---------- what the filters hide (owner, #132) ----------

/** Everything shown: every status and verdict, no milestone, price or state limit ("Show all"). */
export const ALL_FILTERS: LibraryFilters = {
  status: ["inProgress", "saved", "archived"],
  household: [...VERDICT_CHOICES],
  grades: {},
  milestones: [],
  priceMin: null,
  priceMax: null,
  state: null,
};

/** The parcels the filters hide, and whether they're all archived ones only the status filter hides. */
export interface Hidden {
  n: number;
  onlyArchived: boolean;
}

export function hiddenBy(rows: readonly LibraryRow[], f: LibraryFilters): Hidden | null {
  const hidden = rows.filter((r) => !passes(r, f));
  if (!hidden.length) return null;
  const withArchived: LibraryFilters = { ...f, status: [...f.status, "archived"] };
  return {
    n: hidden.length,
    onlyArchived: hidden.every((r) => r.status === "archived" && passes(r, withArchived)),
  };
}

/** The list's last line: "3 hidden by filters", or "2 archived parcels hidden". */
export const hiddenWords = (h: Hidden): string =>
  h.onlyArchived ? `${h.n} archived parcel${h.n === 1 ? "" : "s"} hidden` : `${h.n} hidden by filters`;

/** What its button shows: the archived parcels (the status filter only), or everything. */
export const showHidden = (h: Hidden, f: LibraryFilters): LibraryFilters =>
  h.onlyArchived ? { ...f, status: [...f.status, "archived"] } : ALL_FILTERS;

// ---------- Compare (step 4b) ----------

/** Compare takes 2 or 3 parcels (owner, #185 Q5): the list's ticks stop at 3, and its button wants 2. */
export const COMPARE_MIN = 2;
export const COMPARE_MAX = 3;

/** Your list with nothing on it (step 4b, plan §5): it points to the map. */
export const LIST_EMPTY =
  "Nothing on your list yet. Find a parcel on the map, screen it, and it's kept here.";
/** How Compare is reached (step 4b): the ticks on Your list, 2 or 3. */
export const COMPARE_HOW = "Tick 2 or 3 parcels on Your list to compare them.";
/** A fourth tick isn't offered. */
export const COMPARE_FULL = "Compare takes up to 3 parcels.";

/** The ticks after one is toggled: a tick past the third isn't taken. */
export function toggleTick(ticked: ReadonlySet<string>, key: string): ReadonlySet<string> {
  const next = new Set(ticked);
  if (next.delete(key)) return next;
  if (next.size >= COMPARE_MAX) return ticked;
  next.add(key);
  return next;
}
