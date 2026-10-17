/**
 * The comparison table (value-ranking.md §7; VR6): parcels as columns, the report card's lines as rows, in groups
 * (Costs, Budget, Dealbreakers, Can't add). Each cell holds a value and a mark: a gate's status, or best / worst in its
 * row. The costs and the budget are VR4's: until then their rows say "pending", except Stage 0, the asking price.
 * Pure: the page reads the parcels and their kept screens, and draws this.
 */
import { shortPrice } from "../client/askingPrice";
import { SCREEN_CONSTANTS } from "../screen/config";
import type { ScreenResult } from "../screen/types";
import { reportCard, type Card, type GateStatus, type Letter, type NamedRubric } from "./card";
import type { Drawn } from "./marks";
import type { PanelKey } from "./cardPanels";

/** A History parcel as the table reads it: its name, asking price, and its latest kept screen. */
export interface CompareParcel {
  key: string;
  name: string;
  acres: number | null;
  askingPrice: number | null;
  /** "ok" with a result; "rescreen" when its screen is from earlier rules or gone; "none" when never screened. */
  state: "ok" | "rescreen" | "none";
  result: ScreenResult | null;
  /** Its names for its drawn lines (owner, 2026-10-14) and its markers (WF4), for the card. */
  drawn?: Drawn;
}

/** Best or worst in its row, when the parcels differ there. */
export type Mark = "best" | "worst" | null;

export interface Cell {
  text: string;
  /** A graded line's letter (the grade chip), or a gate's status. */
  grade?: Letter | null;
  status?: GateStatus;
  mark: Mark;
  /** The slide-in panel a tap opens, when the parcel has a card. */
  panel: PanelKey | null;
  /** The full line, for the cell's title. */
  title?: string;
}

export interface CompareRow {
  key: string;
  label: string;
  cells: Cell[];
}

export interface CompareGroup {
  key: "costs" | "budget" | "dealbreakers" | "cantAdd";
  label: string;
  rows: CompareRow[];
}

export interface CompareTable {
  /** Each parcel's card, in column order; null when it has no current screen. */
  cards: (Card | null)[];
  /** The first row: the parcel grade and verdict. */
  head: CompareRow;
  groups: CompareGroup[];
}

const PENDING = "pending";
const POINTS: Record<Letter, number> = SCREEN_CONSTANTS.card.points;

/** What a parcel without a current screen shows in each of its cells. */
const NO_SCREEN: Record<Exclude<CompareParcel["state"], "ok">, string> = {
  rescreen: "re-screens when opened",
  none: "not screened",
};

/**
 * Marks the best and worst of a row (higher `score` is better): only where at least two parcels have a value and they
 * differ, so a row of equals has no marks.
 */
function marked(cells: Cell[], scores: (number | null)[]): Cell[] {
  const known = scores.filter((s): s is number => s !== null);
  if (known.length < 2) return cells;
  const hi = Math.max(...known),
    lo = Math.min(...known);
  if (hi === lo) return cells;
  return cells.map((c, i) => ({
    ...c,
    mark: scores[i] === hi ? "best" : scores[i] === lo ? "worst" : null,
  }));
}

/** The VR4 stages, pending until then (§4.1); Stage 0 is the asking price. */
const STAGES: { key: string; label: string }[] = [
  { key: "stage1a", label: "Stage 1a: camp today" },
  { key: "stage1b", label: "Stage 1b: camp at the build site" },
  { key: "stage2", label: "Stage 2: ready to build" },
  { key: "stage3", label: "Stage 3: home" },
];

/** The table for these parcels, graded with `rubric`. */
export function compareTable(
  parcels: readonly CompareParcel[],
  rubric: NamedRubric,
  readyToBuild: number,
): CompareTable {
  const cards = parcels.map((p) =>
    p.state === "ok" && p.result ? reportCard(p.result, rubric, p.drawn) : null,
  );
  const blank = (p: CompareParcel): Cell => ({
    text: p.state === "ok" ? "–" : NO_SCREEN[p.state],
    mark: null,
    panel: null,
  });

  const head: CompareRow = {
    key: "grade",
    label: "Grade · verdict",
    cells: marked(
      parcels.map((p, i) => {
        const c = cards[i];
        if (!c) return blank(p);
        return { text: c.verdict, grade: c.grade, mark: null, panel: "verdict", title: c.reason };
      }),
      // By the letter, as the other rows: two Bs aren't better and worse than each other.
      cards.map((c) => (c?.grade ? POINTS[c.grade] : null)),
    ),
  };

  const asking: CompareRow = {
    key: "stage0",
    label: "Stage 0: asking",
    cells: marked(
      parcels.map((p) => ({
        text: p.askingPrice !== null ? shortPrice(p.askingPrice) : "–",
        mark: null,
        panel: null,
      })),
      // Cheaper is better.
      parcels.map((p) => (p.askingPrice !== null ? -p.askingPrice : null)),
    ),
  };
  const pending = (key: string, label: string, panel: PanelKey | null): CompareRow => ({
    key,
    label,
    cells: parcels.map((p, i) => (cards[i] ? { text: PENDING, mark: null, panel } : blank(p))),
  });

  const gateRows: CompareRow[] = (cards.find((c) => c)?.gates ?? []).map((g0) => ({
    key: g0.key,
    label: g0.label,
    cells: parcels.map((p, i) => {
      const g = cards[i]?.gates.find((x) => x.key === g0.key);
      if (!g) return blank(p);
      return { text: g.status, status: g.status, mark: null, panel: g.key, title: `${g.reason}.` };
    }),
  }));

  const rowLines: CompareRow[] = (cards.find((c) => c)?.rows ?? []).map((r0) => {
    const cells = parcels.map((p, i): Cell => {
      const r = cards[i]?.rows.find((x) => x.key === r0.key);
      if (!r) return blank(p);
      return { text: r.short ?? r.detail, grade: r.grade, mark: null, panel: r.key, title: r.detail };
    });
    return {
      key: r0.key,
      label: r0.label,
      cells: marked(
        cells,
        parcels.map((_, i) => {
          const g = cards[i]?.rows.find((x) => x.key === r0.key)?.grade;
          return g ? POINTS[g] : null;
        }),
      ),
    };
  });

  return {
    cards,
    head,
    groups: [
      {
        key: "costs",
        label: "Costs",
        rows: [asking, ...STAGES.map((s) => pending(s.key, s.label, "cost"))],
      },
      {
        key: "budget",
        label: "Budget",
        rows: [pending("readyToBuild", `Ready to build ≤ ${shortPrice(readyToBuild)}`, "cost")],
      },
      { key: "dealbreakers", label: "Dealbreakers", rows: gateRows },
      { key: "cantAdd", label: "Can't add", rows: rowLines },
    ],
  };
}

/** How many columns the table starts with (owner, #117 review). */
export const DEFAULT_COLUMNS = 4;

/**
 * The columns the table starts with, until the user picks (owner, #117 review): up to DEFAULT_COLUMNS, the
 * Contenders first (in `rubric`), then the most recently screened; never-screened parcels last.
 */
export function defaultColumns(parcels: readonly CompareParcel[], rubric: NamedRubric): string[] {
  const contender = (p: CompareParcel) =>
    p.state === "ok" && !!p.result && reportCard(p.result, rubric, p.drawn).verdict === "Contender";
  const screenedAt = (p: CompareParcel) => (p.state === "ok" && p.result ? p.result.runAt : "");
  return [...parcels]
    .sort((a, b) => Number(contender(b)) - Number(contender(a)) || screenedAt(b).localeCompare(screenedAt(a)))
    .slice(0, DEFAULT_COLUMNS)
    .map((p) => p.key);
}
