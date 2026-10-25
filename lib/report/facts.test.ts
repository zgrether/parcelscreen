/**
 * The parcel's facts on the card and the cost (J-5, UX part 2 PR 3c): a flood letter passes the Floodplain Must, internet
 * service confirmed settles Satellite internet (an A), and power service confirmed takes the place of the cost's "assumes
 * power along the road". Each appends its reminder after the existing text (rule 7); without facts nothing changes.
 */
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { DEFAULT_RATES } from "../config/costs";
import type { ScreenResult } from "../screen/types";
import { cardFacts } from "./card";
import { COST_NOTES, costToEnjoy, LOWER_IT } from "./cost";
import { floodLetterOnFile, INTERNET_CONFIRMED, type Facts } from "./marks";

const AT = "2026-10-25T00:00:00.000Z";
const facts = (r: ScreenResult, f?: Facts) =>
  cardFacts(r, undefined, undefined, { names: new Map(), marks: [], ...(f ? { facts: f } : {}) });
const floodplain = (r: ScreenResult, f?: Facts) => facts(r, f).gates.find((g) => g.key === "floodplain")!;
const internet = (r: ScreenResult, f?: Facts) => facts(r, f).rows.find((x) => x.key === "internet")!;

describe("a flood letter passes the Floodplain Must", () => {
  it("turns a fail into a pass: the map's sentence first, then the reminder", () => {
    const r = structuredClone(expectedOf("ferney-creek-52-47A", "run"));
    // The build site in a flood zone, as the map would put it.
    (r.sites![0] as { flood?: unknown }).flood = { zone: "AE" };
    const before = floodplain(r);
    expect(before.status).toBe("fail");
    const after = floodplain(r, { floodLetter: { kind: "loma", at: AT } });
    expect(after).toMatchObject({ status: "pass", reason: `${before.reason}; ${floodLetterOnFile("loma")}` });
    expect(floodLetterOnFile("loma")).toBe(
      "a Letter of Map Amendment (LOMA) is on file (your mark): get a copy",
    );
    expect(floodLetterOnFile("elevation")).toBe(
      "an elevation certificate is on file (your mark): get a copy",
    );
  });

  it("without one, nothing changes", () => {
    const r = expectedOf("ferney-creek-52-47A", "run");
    expect(floodplain(r, {})).toEqual(floodplain(r));
    expect(floodplain(r, { service: { internet: true, power: true, at: AT } })).toEqual(floodplain(r));
  });
});

describe("internet service confirmed settles Satellite internet", () => {
  it("an A, the dish's sentence first, then the reminder", () => {
    const r = expectedOf("ferney-creek-52-47A", "run");
    const before = internet(r);
    const after = internet(r, { service: { internet: true, power: false, at: AT } });
    expect(after).toMatchObject({ grade: "A", detail: `${before.detail}; ${INTERNET_CONFIRMED}` });
  });

  it("power alone leaves it as the dish grades it", () => {
    const r = expectedOf("ferney-creek-52-47A", "run");
    expect(internet(r, { service: { internet: false, power: true, at: AT } })).toEqual(internet(r));
  });
});

describe("power service confirmed, in the cost", () => {
  const power = (powerConfirmed?: boolean) => {
    const c = costToEnjoy({
      result: expectedOf("grayson-mud-creek-6273", "run"),
      lines: [],
      marks: [],
      askingPrice: 185_000,
      rates: DEFAULT_RATES,
      ...(powerConfirmed ? { powerConfirmed } : {}),
    });
    if (c?.kind !== "priced") throw new Error("not priced");
    return c.build.items.find((i) => i.label.startsWith("Power, "))!;
  };

  it("says so in the assumption's place, with no hint to mark a pole; the run is priced the same", () => {
    const before = power();
    expect(before.notes).toContain(COST_NOTES.powerAlongRoad);
    const after = power(true);
    expect(after.notes).toEqual([COST_NOTES.powerConfirmed]);
    expect(after.lower).toBeNull();
    expect(before.lower).toBe(LOWER_IT.power);
    expect(after.total).toEqual(before.total);
  });
});
