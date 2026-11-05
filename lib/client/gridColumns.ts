/**
 * The Favorites grid's columns (step 10b plan §1): after the name and the grade, Price, Acres, $/ac and Cost to build,
 * one column per factor in the viewer's rubric order (the Musts first), then Status, State and Updated. Price, $/ac,
 * Cost to build and Status show only when a row has one (polish #12); the person hides any other in Columns ▾ (State
 * and Updated start hidden). Boulder ground (docs/plans/boulders.md §2) comes after the factors, off until the person
 * adds it. Pure: the table draws what this returns.
 */
import type { FactorCell } from "../report/factorCells";
import { factorSortKey, type LibraryRow, type SortKey } from "./library";

export interface GridColumn {
  /** What Columns ▾ keeps in `hidden`: "price", "factor:elevation", … */
  id: string;
  /** The header: a word or two. */
  header: string;
  /** The full name, the header's title and the picker's label. */
  title: string;
  /** The sort a click on the header sets. */
  sort: SortKey;
  kind: "money" | "factor" | "more";
}

const MONEY: readonly (GridColumn & { has(r: LibraryRow): boolean })[] = [
  {
    id: "price",
    header: "Price",
    title: "Asking price",
    sort: "price",
    kind: "money",
    has: (r) => r.price !== null,
  },
  {
    id: "acres",
    header: "Acres",
    title: "Acres (the boundary's)",
    sort: "acres",
    kind: "money",
    has: () => true,
  },
  {
    id: "perAcre",
    header: "$/ac",
    title: "Price per acre (the listing's acres, else the boundary's)",
    sort: "pricePerAcre",
    kind: "money",
    has: (r) => r.perAcre !== null,
  },
  {
    id: "cost",
    header: "Cost to build",
    title: "Ready to build, all in",
    sort: "costBuild",
    kind: "money",
    has: (r) => r.costBuild !== null,
  },
];

/** The factor columns, from the first row with a screen: every row is graded by the same rubric, the viewer's. */
export function factorColumns(rows: readonly LibraryRow[]): GridColumn[] {
  const cells = rows.find((r) => r.factors.length > 0)?.factors ?? [];
  return cells.map((c) => ({
    id: `factor:${c.key}`,
    header: c.short,
    title: c.title,
    sort: factorSortKey(c.key),
    kind: "factor",
  }));
}

/** The columns that start hidden for everyone: shown only once the person adds them (the view's `shown`). */
export const OPT_IN_COLUMNS: readonly string[] = ["boulders"];

/** Whether a column shows, by the view's lists: an opt-in column when added, any other unless hidden. */
export const columnShown = (id: string, hidden: readonly string[], shown: readonly string[]): boolean =>
  OPT_IN_COLUMNS.includes(id) ? shown.includes(id) : !hidden.includes(id);

/** Every column the rows can fill, in order; and those shown, without the ones the person hid. */
export function gridColumns(
  rows: readonly LibraryRow[],
  hidden: readonly string[],
  hasStatus: (r: LibraryRow) => boolean,
  shown: readonly string[] = [],
): { all: GridColumn[]; shown: GridColumn[] } {
  const all: GridColumn[] = [
    ...MONEY.filter((c) => rows.some(c.has)).map(({ has: _has, ...c }) => c),
    ...factorColumns(rows),
    ...(rows.some((r) => r.boulderAcres !== null)
      ? [
          {
            id: "boulders",
            header: "Boulder ground",
            title: "Boulder ground (acres; an estimate, outside the grade)",
            sort: "boulders" as SortKey,
            kind: "more" as const,
          },
        ]
      : []),
    ...(rows.some(hasStatus)
      ? [
          {
            id: "status",
            header: "Status",
            title: "Status",
            sort: "updated" as SortKey,
            kind: "more" as const,
          },
        ]
      : []),
    { id: "state", header: "State", title: "State", sort: "state", kind: "more" },
    { id: "updated", header: "Updated", title: "Updated", sort: "updated", kind: "more" },
  ];
  return { all, shown: all.filter((c) => columnShown(c.id, hidden, shown)) };
}

/** A row's cell for a factor column, if its screen graded it. */
export const cellOf = (r: LibraryRow, id: string): FactorCell | undefined =>
  id.startsWith("factor:") ? r.factors.find((c) => c.key === id.slice("factor:".length)) : undefined;

/**
 * The rows holding the best value in a column (plan §1, Compare's rule): only where two or more rows have a value and
 * they differ; every row tied for best. Factors by their cell's score; $/ac and Cost to build, lowest; Cost to build
 * only among priced parcels (one that leaves out the land isn't comparable).
 */
export function bestIn(rows: readonly LibraryRow[], id: string): Set<string> {
  const score = (r: LibraryRow): number | null => {
    if (id === "perAcre") return r.perAcre ? -r.perAcre.value : null;
    if (id === "cost")
      return r.costBuild && !r.costBuild.plusLand
        ? -(r.costBuild.total.low + r.costBuild.total.high) / 2
        : null;
    return cellOf(r, id)?.score ?? null;
  };
  const scored = rows
    .map((r) => [r.key, score(r)] as const)
    .filter((x): x is readonly [string, number] => x[1] !== null);
  if (scored.length < 2) return new Set();
  const values = scored.map(([, v]) => v);
  const hi = Math.max(...values);
  if (hi === Math.min(...values)) return new Set();
  return new Set(scored.filter(([, v]) => v === hi).map(([k]) => k));
}
