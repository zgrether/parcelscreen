/** The Favorites grid (step 10b plan §1): its columns, best in column, the new sorts, the remembered columns. */
import { describe, expect, it } from "vitest";
import type { FactorCell } from "../report/factorCells";
import { bestIn, gridColumns } from "./gridColumns";
import { DEFAULT_VIEW, readLibraryView, sortRows, type LibraryRow } from "./library";

const cell = (
  key: FactorCell["key"],
  score: number | null,
  kind: FactorCell["kind"] = "grade",
): FactorCell => ({
  key,
  short: key,
  title: key,
  kind,
  text: "",
  detail: "",
  score,
});
const row = (key: string, over: Partial<LibraryRow> = {}): LibraryRow =>
  ({
    key,
    name: key,
    acres: 10,
    price: null,
    perAcre: null,
    costBuild: null,
    states: ["VA"],
    status: "saved",
    updatedAt: "2026-10-21T00:00:00Z",
    factors: [cell("floodplain", 20, "must"), cell("elevation", 4), cell("sky", 3)],
    grades: [],
    ...over,
  }) as unknown as LibraryRow;
const noStatus = () => false;

describe("the grid's columns", () => {
  it("money that some row has, then the factors in the rubric's order, then State and Updated", () => {
    const rows = [
      row("a", {
        price: 100_000,
        perAcre: { value: 10_000, text: "$10,000/ac", on: "boundary", differs: false, both: null },
      }),
      row("b"),
    ];
    const { all } = gridColumns(rows, [], noStatus);
    expect(all.map((c) => c.id)).toEqual([
      "price",
      "acres",
      "perAcre",
      "factor:floodplain",
      "factor:elevation",
      "factor:sky",
      "state",
      "updated",
    ]);
    // No row has a cost to build: no column, whatever the picker says (polish #12).
    expect(all.some((c) => c.id === "cost")).toBe(false);
  });

  it("hides what the person hid; State and Updated start hidden", () => {
    const { shown } = gridColumns([row("a")], DEFAULT_VIEW.columns.hidden, noStatus);
    expect(shown.map((c) => c.id)).toEqual(["acres", "factor:floodplain", "factor:elevation", "factor:sky"]);
    expect(gridColumns([row("a")], ["factor:sky"], noStatus).shown.some((c) => c.id === "factor:sky")).toBe(
      false,
    );
  });

  it("takes the factors from a row with a screen", () => {
    const { all } = gridColumns([row("x", { factors: [] }), row("a")], [], noStatus);
    expect(all.filter((c) => c.kind === "factor")).toHaveLength(3);
  });
});

describe("best in column", () => {
  it("marks the best where values differ, every tie, and nothing with one value or all equal", () => {
    const rows = [
      row("a", { factors: [cell("sky", 4)] }),
      row("b", { factors: [cell("sky", 2)] }),
      row("c", { factors: [cell("sky", 4)] }),
      row("d", { factors: [cell("sky", null)] }),
    ];
    expect([...bestIn(rows, "factor:sky")].sort()).toEqual(["a", "c"]);
    expect(bestIn([rows[0]!, rows[2]!], "factor:sky").size).toBe(0);
    expect(bestIn([rows[0]!, rows[3]!], "factor:sky").size).toBe(0);
  });

  it("the lowest $/ac; the lowest cost to build among priced parcels only", () => {
    const pa = (value: number) => ({ value, text: "", on: "boundary" as const, differs: false, both: null });
    expect([
      ...bestIn([row("a", { perAcre: pa(6_000) }), row("b", { perAcre: pa(4_000) })], "perAcre"),
    ]).toEqual(["b"]);
    const cost = (low: number, high: number, plusLand = false) => ({ total: { low, high }, plusLand });
    expect([
      ...bestIn(
        [
          row("a", { costBuild: cost(300_000, 500_000) }),
          row("b", { costBuild: cost(400_000, 500_000) }),
          row("c", { costBuild: cost(50_000, 90_000, true) }),
        ],
        "cost",
      ),
    ]).toEqual(["a"]);
  });
});

describe("the grid's sorts", () => {
  const rows = [
    row("b", { name: "Bravo", factors: [cell("sky", 2)] }),
    row("a", { name: "alpha", factors: [cell("sky", null)] }),
    row("c", { name: "Charlie", factors: [cell("sky", 4)] }),
  ];
  it("a factor, best first; its unknown last either way", () => {
    expect(sortRows(rows, { key: "factor:sky", reversed: false }).map((r) => r.key)).toEqual(["c", "b", "a"]);
    expect(sortRows(rows, { key: "factor:sky", reversed: true }).map((r) => r.key)).toEqual(["b", "c", "a"]);
  });
  it("by name, ignoring case", () => {
    expect(sortRows(rows, { key: "name", reversed: false }).map((r) => r.key)).toEqual(["a", "b", "c"]);
  });
});

describe("the remembered columns (ps.library)", () => {
  it("a view stored before step 10b reads with the default columns; a stored choice is kept", () => {
    const { columns: _c, ...old } = DEFAULT_VIEW;
    expect(readLibraryView(JSON.stringify(old)).columns).toEqual({ hidden: ["state", "updated"] });
    const mine = {
      ...DEFAULT_VIEW,
      columns: { hidden: ["factor:sky"] },
      sort: { key: "factor:sky", reversed: true },
    };
    const back = readLibraryView(JSON.stringify(mine));
    expect(back.columns.hidden).toEqual(["factor:sky"]);
    expect(back.sort).toEqual({ key: "factor:sky", reversed: true });
  });
});
