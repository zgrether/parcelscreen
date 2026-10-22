/**
 * The comparison table (value-ranking.md §7; VR6): parcels as columns, the report card's lines as rows, in groups
 * (Costs, Budget, Dealbreakers, What money can't add). Each cell holds a value and a mark: a gate's status, or best /
 * worst in its row. Step 10: the costs are Ready to camp and Ready to build (the stages' "not yet" rows went), and the
 * budget rows are the viewer's two budgets.
 * Polish #33 (owner, 2026-10-20): plain words for the stages, the gates in the card's own words.
 * Pure: the page reads the parcels and their kept screens, and draws this.
 */
import { shortPrice } from "../client/askingPrice";
import { SCREEN_CONSTANTS } from "../screen/config";
import type { ScreenResult } from "../screen/types";
import { reportCard, VERDICT_WORD, type Card, type GateStatus, type Letter, type NamedRubric } from "./card";
import type { Drawn } from "./marks";
import type { PanelKey } from "./cardPanels";
import { EDITOR_TITLES } from "../rubric/words";
import { BUDGET_SITS, budgetStatusOf, COST_WORDS } from "./cost";
import { estimateRange } from "./costLines";
import { perAcre } from "./perAcre";

/** A History parcel as the table reads it: its name, asking price, and its latest kept screen. */
export interface CompareParcel {
  key: string;
  name: string;
  acres: number | null;
  askingPrice: number | null;
  /** The acres the listing claims (WF1), for $/ac (step 10b); null or absent: the boundary's. */
  listingAcres?: number | null;
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

const PENDING = "not yet";
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

/** The table for these parcels, graded with `rubric`. */
export function compareTable(parcels: readonly CompareParcel[], rubric: NamedRubric): CompareTable {
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
        return {
          text: VERDICT_WORD[c.verdict],
          grade: c.grade,
          mark: null,
          panel: "verdict",
          title: c.reason,
        };
      }),
      // By the letter, as the other rows: two Bs aren't better and worse than each other.
      cards.map((c) => (c?.grade ? POINTS[c.grade] : null)),
    ),
  };

  const asking: CompareRow = {
    key: "stage0",
    label: "Asking price",
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
  // Step 10b: price per acre, the listing's acres when given; cheaper the better.
  const rates = parcels.map((p) => perAcre(p.askingPrice, p.listingAcres ?? null, p.acres));
  const perAcreRow: CompareRow = {
    key: "perAcre",
    label: "$/ac",
    cells: marked(
      parcels.map((_, i): Cell => {
        const pa = rates[i];
        return {
          text: pa ? `${pa.text}${pa.differs ? " ≠" : ""}` : "–",
          mark: null,
          panel: null,
          ...(pa?.both ? { title: pa.both } : {}),
        };
      }),
      rates.map((pa) => (pa ? -pa.value : null)),
    ),
  };
  // Step 10: Ready to camp and Ready to build, all in, cheaper the better; a range without the land isn't compared.
  const costRow = (which: "camp" | "build"): CompareRow => {
    const estimates = cards.map((c) => (c?.cost?.kind === "priced" ? c.cost[which] : null));
    return {
      key: which,
      label: which === "camp" ? COST_WORDS.camp : COST_WORDS.build,
      cells: marked(
        parcels.map((p, i): Cell => {
          const c = cards[i];
          if (!c) return blank(p);
          const e = estimates[i];
          const text = e ? estimateRange(e) : c.cost?.kind === "noWay" ? COST_WORDS.noWay : PENDING;
          return { text, mark: null, panel: "cost" };
        }),
        estimates.map((e) => (e && e.land !== null ? -(e.total.low + e.total.high) / 2 : null)),
      ),
    };
  };
  // The viewer's budgets (step 10): each parcel's range against each, in the card's words and marks.
  const budgets = rubric.rubric.budgets;
  const budgetRows: CompareRow[] = (["camp", "build"] as const).flatMap((which) => {
    const b = budgets?.[which];
    if (b == null) return [];
    const label = `${which === "camp" ? COST_WORDS.camp : COST_WORDS.build} ≤ ${shortPrice(b)}`;
    return [
      {
        key: `budget-${which}`,
        label,
        cells: parcels.map((p, i): Cell => {
          const c = cards[i];
          if (!c) return blank(p);
          const e = c.cost?.kind === "priced" ? c.cost[which] : null;
          if (!e || e.land === null) return { text: "–", status: "unknown", mark: null, panel: "cost" };
          const status = budgetStatusOf(e.total, b);
          return {
            text: `${BUDGET_SITS[status as "pass" | "warn" | "fail"]} · ${estimateRange(e)}`,
            status,
            mark: null,
            panel: "cost",
          };
        }),
      },
    ];
  });

  const gateRows: CompareRow[] = (cards.find((c) => c)?.gates ?? []).map((g0) => ({
    key: g0.key,
    label: EDITOR_TITLES[g0.key],
    cells: parcels.map((p, i) => {
      const g = cards[i]?.gates.find((x) => x.key === g0.key);
      if (!g) return blank(p);
      return { text: g.status, status: g.status, mark: null, panel: g.key, title: `${g.reason}.` };
    }),
  }));

  // Within budget is the Budget group's (step 10), not something money can't add.
  const rowLines: CompareRow[] = (cards.find((c) => c)?.rows ?? [])
    .filter((r0) => r0.key !== "budget")
    .map((r0) => {
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
        rows: [asking, perAcreRow, costRow("camp"), costRow("build")],
      },
      {
        key: "budget",
        label: "Budget",
        rows: budgetRows.length
          ? budgetRows
          : [
              {
                key: "budget-none",
                label: "No budget given",
                cells: parcels.map((p, i) => (cards[i] ? { text: "–", mark: null, panel: null } : blank(p))),
              },
            ],
      },
      { key: "dealbreakers", label: "Dealbreakers", rows: gateRows },
      { key: "cantAdd", label: "What money can't add", rows: rowLines },
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
