/**
 * The price block (UX part 2 PR 8b, Z-4): Mud Creek's toggles (paving on by default, an alternative septic system off),
 * each re-pricing Ready to build; the existing drive's on a synthetic drive; and the walk-away price against a budget,
 * with none, and with the asking price over, under and inside it.
 */
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { DEFAULT_RATES } from "../config/costs";
import type { PartialScreenResult } from "../screen/types";
import { costRange, costToEnjoy, type CostInput, type CostLine } from "./cost";
import { changeText, priceBlock, walkAway } from "./price";

const mud = (): PartialScreenResult => expectedOf("grayson-mud-creek-6273", "run");
const input = (over: Partial<CostInput> = {}): CostInput => ({
  result: mud(),
  lines: [],
  marks: [],
  askingPrice: 185_000,
  rates: DEFAULT_RATES,
  ...over,
});
const builtWithoutLand = (i: CostInput) => {
  const c = costToEnjoy({ ...i, askingPrice: null });
  if (c?.kind !== "priced") throw new Error("not priced");
  return c.build;
};

describe("the price block (Z-4)", () => {
  it("gives the asking price, both costs without the land, and Mud Creek's two toggles at their defaults", () => {
    const b = priceBlock(input(), undefined, null)!;
    expect(b.asking).toBe("$185,000");
    expect(b.build).toMatch(/^\$\d+–\d+k plus the land$/);
    expect(b.toggles.map((t) => [t.key, t.label, t.byDefault])).toEqual([
      ["paving", "Pave the steep stretches", true],
      ["septic", "An alternative septic system", false],
    ]);
    expect(b.toggles[0]!.detail).toBe("2,185 ft over 12%");
    for (const t of b.toggles) expect(t.change).toMatch(/^\+\$/);
    // Defaults: the card's own Ready to build, priced without the land.
    expect(b.build).toBe(`${costRange(builtWithoutLand(input()).total)} plus the land`);
  });

  it("re-prices Ready to build as a toggle changes, by the toggle's own figure", () => {
    const off = priceBlock(input(), undefined, null, { paving: false })!;
    const on = priceBlock(input(), undefined, null)!;
    expect(off.build).not.toBe(on.build);
    expect(off.toggles.find((t) => t.key === "paving")!.change).toBe(
      on.toggles.find((t) => t.key === "paving")!.change,
    );
    const alt = priceBlock(input(), undefined, null, { septic: true })!;
    const lighter = builtWithoutLand(input()),
      heavier = builtWithoutLand(input({ septic: "alternative" }));
    expect(heavier.total.high).toBeGreaterThan(lighter.total.high);
    expect(alt.build).toBe(`${costRange(heavier.total)} plus the land`);
    // Every switch stays offered whichever way it's set.
    expect(alt.toggles.map((t) => t.key)).toEqual(["paving", "septic"]);
    expect(off.toggles.map((t) => t.key)).toEqual(["paving", "septic"]);
  });

  it("offers no septic toggle where a permit settles the class", () => {
    const site = mud().sites![0]!.ll;
    const permit = {
      id: "s1",
      shape: "point" as const,
      kind: "septic" as const,
      ll: site,
      septicClass: "conventional" as const,
    };
    const b = priceBlock(input({ marks: [permit] }), undefined, null)!;
    expect(b.toggles.map((t) => t.key)).not.toContain("septic");
  });

  it("prices an existing drive as upgraded by default, and as new when it's off", () => {
    const r = structuredClone(mud());
    r.lines = [
      {
        id: "drive-1",
        kind: "track",
        lengthFt: 870,
        widthFt: null,
        outsideFt: 0,
        gradedFt: 870,
        avgGradePct: 6,
        maxGradePct: 8,
      },
    ];
    r.driveway!.routes[0]!.existing = {
      line: 0,
      lengthFt: 870,
      maxGradePct: 8,
      avgGradePct: 6,
      limitPct: 15,
      vetoPct: 25,
      pavedFt: 0,
      reliefCulverts: 0,
      stoneTons: 0,
      outsideFt: 0,
      cost: { mid: 10_000, low: 5_000, high: 15_000 },
    };
    const line: CostLine = { id: "drive-1", kind: "track", condition: "improved", line: [], recordedIn: "" };
    const i = input({ result: r, lines: [line] });
    const b = priceBlock(i, undefined, null)!;
    const t = b.toggles.find((x) => x.key === "existing")!;
    expect([t.label, t.detail, t.byDefault]).toEqual([
      "Upgrade the existing drive",
      "instead of a new one",
      true,
    ]);
    // Upgrading an improved track costs less than a new gravel driveway the same length.
    expect(t.change).toMatch(/^−\$/);
    expect(priceBlock(i, undefined, null, { existing: false })!.build).not.toBe(b.build);
  });
});

describe("the walk-away price (Z-4)", () => {
  const build = { low: 130_000, high: 195_000 };
  it("is the budget less Ready to build without the land, with the asking price against it", () => {
    expect(walkAway(build, 300_000, 185_000)).toEqual({
      line: "Pay at most $105–170k",
      within: "to stay within your $300k budget.",
      asking: "The asking price is over it by $15–80k.",
    });
    expect(walkAway(build, 300_000, 90_000).asking).toBe("The asking price is under it by $15–80k.");
    expect(walkAway(build, 300_000, 150_000).asking).toBe(
      "The asking price is inside that range: within budget only if the build comes in low.",
    );
    expect(walkAway(build, 300_000, null).asking).toBeNull();
  });

  it("gives the low end's figure alone when no land fits the build's high end", () => {
    expect(walkAway({ low: 145_000, high: 410_000 }, 300_000, 185_000)).toEqual({
      line: "Pay at most $155k",
      within: "to stay within your $300k budget, and only if the build comes in at its low end.",
      asking: "The asking price is over it by $30–185k.",
    });
  });

  it("says when no land price fits", () => {
    expect(walkAway(build, 120_000, 185_000).line).toBe("No land price stays within it");
  });

  it("isn't shown without a Ready to build budget", () => {
    expect(priceBlock(input(), undefined, null)!.walkAway).toBeNull();
    expect(priceBlock(input(), { camp: null, build: 600_000 }, null)!.walkAway!.line).toMatch(
      /^Pay at most \$/,
    );
  });

  it("writes a change with its sign, smaller end first", () => {
    expect(changeText({ low: 12_000, high: 20_000 })).toBe("+$12–20k");
    expect(changeText({ low: -8_000, high: -14_000 })).toBe("−$8–14k");
  });
});
