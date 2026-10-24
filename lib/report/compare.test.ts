/**
 * VR6 (value-ranking.md §7): the comparison table's model. The three fixtures side by side: the card's lines as rows,
 * best and worst marked where the parcels differ, gates as their status, costs pending (Stage 0 is the asking price),
 * and a parcel without a current screen saying so in every cell.
 */
import { describe, expect, it } from "vitest";
import { ZACH, JULIE } from "@/test/support/rubrics";
import { expectedOf } from "@/test/support/expected";
import { reportCard } from "./card";
import { DEFAULT_COLUMNS, compareTable, defaultColumns, type CompareParcel } from "./compare";
import { drawnOf } from "./marks";
import { DEFAULT_RATES } from "../config/costs";

const parcel = (
  slug: "ferney-creek-52-47A" | "macks-mountain-35-3" | "grayson-mud-creek-6273",
  askingPrice: number | null = null,
): CompareParcel => ({
  key: slug,
  name: slug,
  acres: null,
  askingPrice,
  state: "ok",
  result: expectedOf(slug, "run"),
});

describe("the comparison table (VR6)", () => {
  const three = [
    parcel("ferney-creek-52-47A", 180_000),
    parcel("macks-mountain-35-3", 640_000),
    parcel("grayson-mud-creek-6273", 95_000),
  ];

  it("one column per parcel; the head row is each card's grade and verdict, in the chosen person's weights", () => {
    for (const person of [ZACH, JULIE] as const) {
      const t = compareTable(three, person);
      expect(t.head.cells.map((c) => [c.grade, c.text])).toEqual(
        three.map((p) => {
          const c = reportCard(p.result!, person);
          return [c.grade, c.verdict];
        }),
      );
      expect(t.head.cells.every((c) => c.panel === "verdict")).toBe(true);
    }
  });

  it("the groups and their rows: the asking price and the two costs, the budgets, the gates, what money can't add", () => {
    const t = compareTable(three, ZACH);
    expect(t.groups.map((g) => [g.label, g.rows.map((r) => r.label)])).toEqual([
      [
        "Costs",
        // Step 10: the two costs in place of the four stages.
        // Step 10b: $/ac after the asking price.
        ["Asking price", "$/ac", "Ready to camp", "Ready to build"],
      ],
      // The viewer's budgets: the starting list has none.
      ["Budget", ["No budget given"]],
      ["Must have", ["Floodplain", "Legal road access", "Driveway on your land", "Septic"]],
      [
        "Really want",
        [
          "Elevation at the build site",
          "Best homesite",
          "Night sky",
          "Room to build",
          "Trails and public land",
          "Hospital",
          "Garden ground",
        ],
      ],
    ]);
    const costs = t.groups[0]!.rows;
    expect(costs[0]!.cells.map((c) => [c.text, c.mark])).toEqual([
      ["$180k", null],
      ["$640k", "worst"],
      ["$95k", "best"],
    ]);
    // Drawn without the cost's inputs (the price and rates), so not priced.
    for (const r of costs.slice(2))
      expect(r.cells.map((c) => c.text)).toEqual(["not yet", "not yet", "not yet"]);
    const septic = t.groups[2]!.rows.find((r) => r.key === "septic")!;
    expect(septic.cells.map((c) => c.status)).toEqual(
      three.map((p) => reportCard(p.result!, ZACH).gates.find((g) => g.key === "septic")!.status),
    );
  });

  it("a can't-add cell is its grade and short value; best and worst only where the grades differ", () => {
    const t = compareTable(three, ZACH);
    const rows = t.groups[3]!.rows;
    for (const r of rows) {
      const grades = r.cells.map((c) => c.grade);
      const known = grades.filter((g): g is NonNullable<typeof g> => !!g);
      const marks = r.cells.map((c) => c.mark);
      if (new Set(known).size < 2) expect(marks.every((m) => m === null)).toBe(true);
      else {
        const order = "ABCDF";
        const best = known.reduce((a, b) => (order.indexOf(b) < order.indexOf(a) ? b : a));
        const worst = known.reduce((a, b) => (order.indexOf(b) > order.indexOf(a) ? b : a));
        r.cells.forEach((c) =>
          expect(c.mark).toBe(c.grade === best ? "best" : c.grade === worst ? "worst" : null),
        );
      }
      for (const c of r.cells) {
        expect(c.text.length).toBeLessThan(40); // the short value, not the card's sentence
        expect(c.title).toBeTruthy(); // the sentence, on hover
        expect(c.panel).toBe(r.key);
      }
    }
    expect(rows.find((r) => r.key === "elevation")!.cells.map((c) => c.text)).toEqual(
      three.map(
        // Step 7: each at Zach's best site.
        (p) =>
          `${p.result!.sites![reportCard(p.result!, ZACH).at]!.elevFt.toLocaleString("en-US", { maximumFractionDigits: 0 })} ft`,
      ),
    );
  });

  it("prices the two costs, cheapest best, and sets each against the viewer's budgets (step 10)", () => {
    const priced = (slug: Parameters<typeof parcel>[0], price: number | null): CompareParcel => ({
      ...parcel(slug, price),
      drawn: drawnOf([], null, { askingPrice: price, rates: DEFAULT_RATES }),
    });
    const budgeted = { ...ZACH, rubric: { ...ZACH.rubric, budgets: { camp: 250_000, build: 300_000 } } };
    const t = compareTable(
      [
        priced("grayson-mud-creek-6273", 185_000),
        priced("ferney-creek-52-47A", 60_000),
        priced("macks-mountain-35-3", null),
      ],
      budgeted,
    );
    const [, , camp, build] = t.groups[0]!.rows;
    expect(camp!.cells.map((c) => [c.text, c.mark])).toEqual([
      ["$200–240k", "worst"],
      ["$63–69k", "best"],
      [expect.stringMatching(/ plus the land$/), null],
    ]);
    expect(build!.cells[0]!.text).toBe("$330–595k");
    expect(t.groups[1]!.rows.map((r) => [r.label, r.cells.map((c) => [c.status, c.text])])).toEqual([
      [
        "Ready to camp ≤ $250k",
        [
          ["pass", "under · $200–240k"],
          ["pass", "under · $63–69k"],
          ["unknown", "–"],
        ],
      ],
      [
        "Ready to build ≤ $300k",
        [
          ["fail", "over · $330–595k"],
          ["pass", expect.stringMatching(/^under · /)],
          ["unknown", "–"],
        ],
      ],
    ]);
  });

  it("a parcel without a current screen says so in each cell, with no panel and no mark", () => {
    const t = compareTable(
      [parcel("ferney-creek-52-47A"), { ...parcel("macks-mountain-35-3"), state: "rescreen", result: null }],
      ZACH,
    );
    expect(t.cards[1]).toBeNull();
    for (const r of [
      t.head,
      ...t.groups.flatMap((g) => g.rows).filter((r) => r.key !== "stage0" && r.key !== "perAcre"),
    ]) {
      expect(r.cells[1]).toEqual({ text: "grades again when opened", mark: null, panel: null });
      expect(r.cells[0]!.mark).toBeNull(); // nothing to be better than
    }
    const never = compareTable([{ ...parcel("macks-mountain-35-3"), state: "none", result: null }], ZACH);
    expect(never.head.cells[0]!.text).toBe("not screened");
  });
});

describe("the columns the table starts with (owner, #117 review)", () => {
  /** A fixture's run, screened at `runAt`, with its verdict forced (the card reads the flags' and gates' inputs). */
  const at = (slug: Parameters<typeof parcel>[0], key: string, runAt: string): CompareParcel => {
    const p = parcel(slug);
    return { ...p, key, result: { ...p.result!, runAt } };
  };

  it("up to four, the Contenders first, then the most recently screened; never-screened last", () => {
    const ps: CompareParcel[] = [
      at("ferney-creek-52-47A", "f-old", "2026-10-01T00:00:00Z"),
      at("macks-mountain-35-3", "m-new", "2026-10-11T00:00:00Z"),
      at("grayson-mud-creek-6273", "g-mid", "2026-10-05T00:00:00Z"),
      { ...parcel("ferney-creek-52-47A"), key: "never", state: "none", result: null },
      at("ferney-creek-52-47A", "f-new", "2026-10-12T00:00:00Z"),
    ];
    const verdict = (p: CompareParcel) => (p.result ? reportCard(p.result, ZACH).verdict : null);
    const got = defaultColumns(ps, ZACH);
    expect(got).toHaveLength(DEFAULT_COLUMNS);
    expect(got).not.toContain("never");
    const byKey = new Map(ps.map((p) => [p.key, p]));
    const contenders = got.filter((k) => verdict(byKey.get(k)!) === "Contender");
    // The Contenders lead, newest first; then the rest, newest first.
    expect(got.slice(0, contenders.length)).toEqual(contenders);
    const dates = (ks: string[]) => ks.map((k) => byKey.get(k)!.result!.runAt);
    const sortedDesc = (xs: string[]) => [...xs].sort().reverse();
    expect(dates(contenders)).toEqual(sortedDesc(dates(contenders)));
    const rest = got.slice(contenders.length);
    expect(dates(rest)).toEqual(sortedDesc(dates(rest)));
  });
});
