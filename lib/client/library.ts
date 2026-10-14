/**
 * The household's list (WF2b, docs/plans/parcel-workflow.md §5–§6): one row per History parcel with its name, acres,
 * price, state, status and milestones, and both people's grades with the household verdict, the lower of the two
 * (owner, #128). Filters and sorts are views: they never change a parcel. Pure; components/Library renders it.
 */
import { centroid } from "@turf/turf";
import { z } from "zod";
import { deriveParcel, STATE_BY_HOST } from "@/lib/geo/recipe";
import { parcelFacts } from "@/lib/geo/parcels";
import { reportCard, type Letter, type Verdict } from "@/lib/report/card";
import { lineNamesOf } from "@/lib/report/lines";
import { SCREEN_CONSTANTS } from "@/lib/screen/config";
import { kmToState, type StateCode } from "@/lib/screen/states";
import { parcelName } from "./historyRows";
import { recipeOf, type Milestone, type ParcelStatus, type WorkingParcel } from "./parcelStore";
import type { KeptScreen } from "./useKeptScreens";

/** The verdicts, worst first: the household's is the lower of the two people's. */
export const VERDICTS: readonly Verdict[] = ["Pass", "Maybe", "Contender"];
const rank = (v: Verdict) => VERDICTS.indexOf(v);

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
  /** The US state, from the county service or else where the parcel lies; null when neither tells. */
  state: StateCode | null;
  county: string | null;
  status: ParcelStatus;
  milestones: WorkingParcel["milestones"];
  /** Each person's grade and verdict, and the household's verdict; null without a current screen. */
  zach: Graded | null;
  julie: Graded | null;
  household: Verdict | null;
  /** Why there's no grade, when there isn't. */
  unscreened: Unscreened | null;
  updatedAt: string;
}

const STATES: readonly StateCode[] = ["VA", "NC", "TN"];

/** The parcel's state: its county records' service, else the state its boundary's centre lies in. */
export function parcelState(p: WorkingParcel): StateCode | null {
  for (const piece of p.pieces) {
    const host = /^https?:\/\/([^/]+)/.exec(piece.source)?.[1] ?? "";
    const s = STATE_BY_HOST[host];
    if (s) return s as StateCode;
  }
  const d = deriveParcel(recipeOf(p), SCREEN_CONSTANTS.combine);
  const geo = d.ok ? d.record.geo : p.pieces[0]?.geo;
  if (!geo) return null;
  const [lon, lat] = centroid(geo).geometry.coordinates as [number, number];
  return STATES.find((s) => kmToState(s, [lat, lon]) <= 0) ?? null;
}

export function libraryRow(p: WorkingParcel, kept: KeptScreen | undefined): LibraryRow {
  const { name, acres } = parcelName(p);
  const result = kept?.state === "ok" ? kept.result : null;
  const graded = (person: "zach" | "julie"): Graded | null => {
    if (!result) return null;
    const c = reportCard(result, person, lineNamesOf(p.markup));
    return { grade: c.grade, verdict: c.verdict };
  };
  const zach = graded("zach"),
    julie = graded("julie");
  return {
    key: p.key!,
    name,
    acres,
    price: p.askingPrice,
    state: parcelState(p),
    county: p.pieces.map((x) => parcelFacts(x.geo, x.props).county).find((c) => !!c) ?? null,
    status: p.status,
    milestones: p.milestones,
    zach,
    julie,
    household: zach && julie ? householdVerdict(zach.verdict, julie.verdict) : null,
    unscreened: result ? null : kept?.state === "rescreen" ? "rescreen" : "none",
    updatedAt: p.updatedAt,
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
  zach: VerdictChoice[];
  julie: VerdictChoice[];
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
  zach: [...VERDICT_CHOICES],
  julie: [...VERDICT_CHOICES],
  milestones: [],
  priceMin: null,
  priceMax: null,
  state: null,
};

const choice = (v: Verdict | null): VerdictChoice => v ?? "unscreened";

export function passes(r: LibraryRow, f: LibraryFilters): boolean {
  if (!f.status.includes(r.status)) return false;
  if (!f.household.includes(choice(r.household))) return false;
  if (!f.zach.includes(choice(r.zach?.verdict ?? null))) return false;
  if (!f.julie.includes(choice(r.julie?.verdict ?? null))) return false;
  if (f.milestones.some((m) => r.milestones[m] === null)) return false;
  if (f.priceMin !== null || f.priceMax !== null) {
    if (r.price === null) return false;
    if (f.priceMin !== null && r.price < f.priceMin) return false;
    if (f.priceMax !== null && r.price > f.priceMax) return false;
  }
  return f.state === null || r.state === f.state;
}

// ---------- sorts ----------

export type SortKey = "updated" | "price" | "acres" | "household" | "zach" | "julie";
export interface LibrarySort {
  key: SortKey;
  /** Each key's natural order (the newest, the cheapest, the largest, the best), or its reverse. */
  reversed: boolean;
}
export const DEFAULT_SORT: LibrarySort = { key: "updated", reversed: false };

const LETTER_RANK: Record<Letter, number> = { A: 0, B: 1, C: 2, D: 3, F: 4 };
/** Best first: the verdict, then the grade. */
const gradedRank = (g: Graded | null): number | null =>
  g ? (2 - rank(g.verdict)) * 10 + (g.grade === null ? 5 : LETTER_RANK[g.grade]) : null;

/** Each key's value in its natural order (smaller first); null (no price, no screen) always sorts last. */
const sortValue = (r: LibraryRow, k: SortKey): number | string | null => {
  switch (k) {
    case "updated":
      return r.updatedAt === "" ? null : -Date.parse(r.updatedAt);
    case "price":
      return r.price;
    case "acres":
      return r.acres === null ? null : -r.acres;
    case "household":
      return r.household === null ? null : 2 - rank(r.household);
    case "zach":
      return gradedRank(r.zach);
    case "julie":
      return gradedRank(r.julie);
  }
};

export function sortRows(rows: readonly LibraryRow[], s: LibrarySort): LibraryRow[] {
  return [...rows].sort((a, b) => {
    const x = sortValue(a, s.key),
      y = sortValue(b, s.key);
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
    zach: z.array(Choice),
    julie: z.array(Choice),
    milestones: z.array(z.enum(["walked", "offered"])),
    priceMin: z.number().nullable(),
    priceMax: z.number().nullable(),
    state: z.enum(["VA", "NC", "TN"]).nullable(),
  }),
  sort: z.object({
    key: z.enum(["updated", "price", "acres", "household", "zach", "julie"]),
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
  zach: [...VERDICT_CHOICES],
  julie: [...VERDICT_CHOICES],
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
