/** A split's break-even inputs and their defaults (step 15, plan §4), and the scenario edit that keeps them. */
import { describe, expect, it } from "vitest";
import { DEFAULT_RATES } from "../config/costs";
import type { Scenario, WorkingParcel } from "../client/parcelStore";
import { resolveBreakEven, type BreakEvenPiece } from "./breakEvenOf";
import { withBreakEven } from "./scenario";

const EAST: BreakEvenPiece = { side: "left", word: "East", acres: 30 };
const WEST: BreakEvenPiece = { side: "right", word: "West", acres: 10 };

describe("resolveBreakEven", () => {
  it("every input at its default: the smaller piece sold at its acres' share, 2 years at 7%, the costs' midpoints", () => {
    const r = resolveBreakEven(undefined, [EAST, WEST], 200_000, DEFAULT_RATES);
    expect(r.sold).toBe(WEST);
    expect(r.kept).toBe(EAST);
    expect(r.price).toEqual({ value: 200_000, assumed: true });
    expect(r.sharePct).toEqual({ value: 25, assumed: true });
    expect(r.years).toEqual({ value: 2, assumed: true });
    expect(r.ratePct).toEqual({ value: 7, assumed: true });
    // Survey $1,200–6,000 and legal $500–1,500 at their midpoints; no road.
    expect([r.survey.value, r.legal.value, r.road.value]).toEqual([3_600, 1_000, 0]);
    // 25% of $200,000 × 1.07² = $57,245, plus $4,600: $61,845, $6,184.50/ac.
    expect(r.figures!.breakEven).toBeCloseTo(61_845, 6);
    expect(r.figures!.breakEvenPerAc).toBeCloseTo(6_184.5, 6);
  });

  it("typed inputs stand; the piece you pick is the one sold; no price, no figures", () => {
    const r = resolveBreakEven(
      { price: 100_000, years: 0, soldSide: "left", survey: 0, legal: 0 },
      [EAST, WEST],
      null,
      DEFAULT_RATES,
    );
    expect(r.sold).toBe(EAST);
    expect(r.price).toEqual({ value: 100_000, assumed: false });
    expect(r.sharePct.value).toBe(75);
    expect(r.figures!.breakEven).toBe(75_000);
    expect(resolveBreakEven(undefined, [EAST, WEST], null, DEFAULT_RATES).figures).toBeNull();
  });
});

describe("withBreakEven", () => {
  const sc: Scenario = {
    id: "s1",
    name: "Split 1",
    a: [36, -81],
    b: [36.1, -81],
    screens: { left: null, right: null },
    at: "",
  };
  const parcel = { scenarios: [sc] } as unknown as WorkingParcel;

  it("keeps a typed input, clears it back to its default, and saves nothing for no change", () => {
    const typed = withBreakEven(parcel, "s1", { price: 250_000 });
    expect(typed.scenarios[0]!.breakEven).toEqual({ price: 250_000 });
    expect(withBreakEven(typed, "s1", { price: 250_000 })).toBe(typed);
    const cleared = withBreakEven(typed, "s1", { price: undefined });
    expect(cleared.scenarios[0]!.breakEven).toBeUndefined();
  });
});
