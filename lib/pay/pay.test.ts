/**
 * How it could pay (step 15, plan §10): the credit formula, the use-value comparison, the break-even arithmetic, and
 * each option's Eligible / Maybe / Not eligible, on the four fixtures and on synthetic parts.
 */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STATE_EASEMENT } from "@/lib/config/programs";
import type { PartialScreenResult } from "@/lib/screen/types";
import { landUses } from "@/lib/uses";
import type { Answer, LandUses, UseKey } from "@/lib/uses";
import { expectedOf } from "@/test/support/expected";
import { synthetic, usesInput } from "@/test/support/uses";
import { breakEven } from "./breakEven";
import { creditFor, sliderMax } from "./credit";
import { easement, sliderLine } from "./easement";
import { howItCouldPay, PAY_ORDER, type PayInput, type PayListing, type PayOption } from "./index";
import { campSites, carbon, lease, splitResell, timber } from "./others";
import { landUseTax, programTax } from "./landUseTax";

const VA = STATE_EASEMENT.VA.credit!;
const NC = STATE_EASEMENT.NC.credit!;
const LISTING: PayListing = { askingPrice: null, assessed: null, timberCruise: null };

const fixture = (slug: Parameters<typeof expectedOf>[0], listing: Partial<PayListing> = {}): PayInput => {
  const uses = usesInput(expectedOf(slug, "run"));
  return { uses, land: landUses(uses), listing: { ...LISTING, ...listing }, scenarios: [] };
};
const byKey = (opts: PayOption[]) => Object.fromEntries(opts.map((o) => [o.key, o]));

// ---------- Synthetic parcels ----------

const MACKS = expectedOf("macks-mountain-35-3", "run");
const cover = (forestPct: number, openPct = 0) => ({
  forestPct,
  openPct,
  openGentleAc: 0,
  openNearRoadAc: 0,
  year: 2021,
});
const county = (fips: string, name: string, state: string) => ({ fips, name, state, zoning: null });
const CARROLL = county("51035", "Carroll", "VA");
const ASHE = county("37009", "Ashe", "NC");
const CARTER = county("47019", "Carter", "TN");
const MONTGOMERY = county("51121", "Montgomery", "VA");
const r = (over: Partial<PartialScreenResult>): PartialScreenResult => ({
  ...MACKS,
  acres: 100,
  cover: cover(80),
  streams: { perennialFt: 0, intermittentFt: 0, names: [], nearestFt: null },
  protected: [],
  county: CARROLL,
  ...over,
});
/** Panel 1's answers as given (the rest Yes), for the options that read them. */
const land = (answers: Partial<Record<UseKey, [Answer, string]>> = {}): LandUses => ({
  uses: (["camp", "build", "trails", "garden", "hunt", "ride", "divide"] as const).map((key) => {
    const [answer, reason] = answers[key] ?? ["yes", `${key} reason`];
    return { key, name: key, answer: { answer, reason, decides: [] } };
  }),
  limits: [],
});
const input = (
  result: PartialScreenResult,
  answers: Partial<Record<UseKey, [Answer, string]>> = {},
  listing: Partial<PayListing> = {},
  scenarios: PayInput["scenarios"] = [],
): PayInput => ({
  uses: synthetic(result),
  land: land(answers),
  listing: { ...LISTING, ...listing },
  scenarios,
});

const PARKWAY = {
  name: "Blue Ridge Parkway",
  manager: "NPS",
  type: "FED",
  access: "RA",
  gap: "2",
  adjoins: false,
  distFt: 2640,
};

describe("the credit formula (plan §2.1)", () => {
  it("Virginia: 40% of the appraised value, used at $20,000 a year, the rest past 11 years sold", () => {
    expect(creditFor(100_000, VA)).toEqual({ credit: 40_000, years: 2, beyondCarry: 0 });
    expect(creditFor(1_000_000, VA)).toEqual({ credit: 400_000, years: 20, beyondCarry: 180_000 });
    expect(creditFor(0, VA).credit).toBe(0);
  });

  it("North Carolina: 25%, capped at $250,000, no yearly limit", () => {
    expect(creditFor(400_000, NC)).toEqual({ credit: 100_000, years: null, beyondCarry: 0 });
    expect(creditFor(2_000_000, NC).credit).toBe(250_000);
  });

  it("the slider starts at $0 and runs to the asking price, or $1M without one, in $5,000 steps", () => {
    expect(sliderMax(null)).toBe(1_000_000);
    expect(sliderMax(247_500)).toBe(250_000);
    expect(sliderLine(100_000, VA, creditFor(100_000, VA))).toBe(
      "If the easement's appraised value were $100,000 → a state credit of $40,000. At $20,000 a year, you'd use it over 2 years",
    );
    expect(sliderLine(1_000_000, VA, creditFor(1_000_000, VA))).toMatch(
      /over 20 years; the rest can be sold$/,
    );
  });
});

describe("the use-value comparison (plan §2.2)", () => {
  it("today's tax beside the forest at its use value, the rest at its share", () => {
    // $100,000 on 30 ac, all forest, at $300/ac and $0.49 per $100: $490 today, 30 × $300 = $9,000 → $44.10.
    expect(
      programTax({
        value: 100_000,
        acres: 30,
        forestAc: 30,
        perAc: { low: 300, high: 300 },
        assessedShare: 1,
        per100: 0.49,
      }),
    ).toEqual({
      today: 490,
      low: 44.1,
      high: 44.1,
    });
    // Half forest: the other half keeps its $50,000.
    const half = programTax({
      value: 100_000,
      acres: 30,
      forestAc: 15,
      perAc: { low: 200, high: 400 },
      assessedShare: 1,
      per100: 1,
    });
    expect(half).toEqual({ today: 1000, low: 530, high: 560 });
    // Tennessee: on 25% of the appraised value.
    expect(
      programTax({
        value: 100_000,
        acres: 10,
        forestAc: 0,
        perAc: { low: 0, high: 0 },
        assessedShare: 0.25,
        per100: 2,
      }).today,
    ).toBe(500);
  });

  it("Carroll takes forest: Eligible, with today's tax on the asking price, labelled", () => {
    const o = landUseTax(input(r({}), {}, { askingPrice: 300_000 }));
    expect(o).toMatchObject({
      eligibility: "eligible",
      reason: "80 ac of forest, enough for land use assessment",
    });
    const lines = o.number.map((l) => l.text);
    expect(lines).toContain(
      "Today's tax: about $1,470 a year (on the asking price; the county's assessment may differ)",
    );
    // 80 ac × $230–405 + $60,000 for the other 20 ac, at $0.49 per $100: $384.16–$452.76.
    expect(lines).toContain("In the program: about $384–$453 a year");
    expect(o.cost).toMatch(/^Rollback taxes if the use changes: .*5 most recent tax years/);
  });

  it("the typed assessment comes before the asking price; without either it asks for one", () => {
    const typed = landUseTax(
      input(r({}), {}, { askingPrice: 300_000, assessed: { value: 200_000, year: 2025 } }),
    );
    expect(typed.number.map((l) => l.text)).toContain(
      "Today's tax: about $980 a year (on the assessed value, 2025)",
    );
    expect(landUseTax(input(r({}))).number.map((l) => l.text)).toContain("Type the assessed value");
  });

  it("a county with no program, a county with no forest class, too little forest, a farm, a county not covered", () => {
    expect(landUseTax(input(r({ county: county("51077", "Grayson", "VA") })))).toMatchObject({
      eligibility: "no",
      reason: "Grayson has no land use program",
    });
    expect(landUseTax(input(r({ county: county("51063", "Floyd", "VA") }))).reason).toBe(
      "Floyd's land use program takes farm and horticultural land only, not forest",
    );
    expect(landUseTax(input(r({ acres: 20, cover: cover(50) })))).toMatchObject({
      eligibility: "no",
      reason: "10 ac of forest, under the 20 ac minimum",
    });
    expect(landUseTax(input(r({ acres: 20, cover: cover(50, 50) })))).toMatchObject({
      eligibility: "maybe",
      reason: "Not enough forest, but 5 ac or more could qualify as farm land, if it's farmed",
    });
    expect(landUseTax(input(r({ county: MONTGOMERY })))).toMatchObject({
      eligibility: "maybe",
      reason: "Not covered here yet: Montgomery County, VA",
    });
  });

  it("North Carolina: enough forest is a Maybe, for the 4 years owned and the plan; Tennessee's values aren't published", () => {
    expect(landUseTax(input(r({ county: ASHE })))).toMatchObject({
      eligibility: "maybe",
      reason: "Enough forest, but owned 4 years and a written forest management plan",
    });
    const tn = landUseTax(input(r({ county: CARTER }), {}, { askingPrice: 100_000 }));
    expect(tn.eligibility).toBe("eligible");
    expect(tn.number.map((l) => l.text)).toContain("The county's use values aren't published");
  });
});

describe("the break-even (plan §4)", () => {
  const base = {
    price: 100_000,
    share: 0.4,
    years: 2,
    ratePct: 5,
    costs: 10_000,
    soldAc: 10,
    keptAc: 15,
    soldAtPerAc: null,
  };

  it("the sold piece pays its share of the price carried at interest, plus the split's costs", () => {
    const f = breakEven(base);
    expect(f.carried).toBeCloseTo(110_250, 6);
    expect(f.breakEven).toBeCloseTo(54_100, 6);
    expect(f.breakEvenPerAc).toBeCloseTo(5_410, 6);
    // At the break-even the kept piece costs its own share of the carried price.
    expect(f.keep).toBeCloseTo(0.6 * 110_250, 6);
    expect(f.keepPerAc).toBeCloseTo(4_410, 6);
  });

  it("at another sale price, the kept piece's price moves with it; held no time, no interest", () => {
    expect(breakEven({ ...base, soldAtPerAc: 6_000 }).keep).toBeCloseTo(110_250 + 10_000 - 60_000, 6);
    expect(breakEven({ ...base, years: 0 }).carried).toBe(100_000);
  });
});

describe("each option's answer (plan §2)", () => {
  it("conservation easement: lots to give up and a conservation value; Virginia gets the slider", () => {
    const stream = r({ streams: { perennialFt: 800, intermittentFt: 0, names: [], nearestFt: null } });
    const o = easement(input(stream, {}, { askingPrice: 400_000 }));
    expect(o).toMatchObject({
      eligibility: "eligible",
      reason: "Lots to give up, and a year-round stream, mostly forest",
    });
    expect(o.slider).toEqual({ state: "VA", max: 400_000, step: 5_000 });
    expect(o.number[0]!.text).toBe("Needs an appraisal");

    const parkway = easement(input(r({ acres: 30, protected: [PARKWAY] })));
    expect(parkway).toMatchObject({
      eligibility: "eligible",
      reason: "Lots to give up, and Blue Ridge Parkway, within 0.5 mi",
    });
  });

  it("forest alone under 50 ac, lots alone, values with no lots, nothing at all", () => {
    expect(easement(input(r({ acres: 30 }))).reason).toBe(
      "Under 50 ac, forest alone is rarely enough: a land trust looks for public land, the Parkway or water",
    );
    expect(easement(input(r({ cover: cover(10) }))).reason).toBe(
      "Lots to give up, but a land trust looks for a conservation value too",
    );
    expect(
      easement(
        input(r({ protected: [PARKWAY] }), { divide: ["no", "1 lot: limited by 50 ft of road frontage"] }),
      ).reason,
    ).toBe(
      "Blue Ridge Parkway, within 0.5 mi, mostly forest, but an easement's value is mostly the building rights it retires: 1 lot: limited by 50 ft of road frontage",
    );
    expect(easement(input(r({ acres: 5, cover: cover(10) }), { divide: ["no", "1 lot"] })).eligibility).toBe(
      "no",
    );
  });

  it("North Carolina shows its credit; Tennessee says No state credit; no slider outside Virginia", () => {
    const nc = easement(input(r({ county: ASHE, protected: [PARKWAY] })));
    expect(nc.slider).toBeUndefined();
    expect(nc.number.map((l) => l.text)).toContain(
      "Conservation Tax Credit: 25% of the easement's appraised value, at most $250,000, for donations made by 2026-12-31",
    );
    const tn = easement(input(r({ county: CARTER, protected: [PARKWAY] })));
    expect(tn.number.map((l) => l.text)).toEqual(
      expect.arrayContaining([
        "No state credit",
        expect.stringMatching(/^Federal: a donated easement is deductible up to 50%/),
      ]),
    );
  });

  it("forest carbon: 30 ac of forest; just under is a Maybe; no number", () => {
    expect(carbon(input(r({})))).toMatchObject({
      eligibility: "eligible",
      number: [{ text: "The program quotes the payment" }],
    });
    expect(carbon(input(r({ acres: 30, cover: cover(90) }))).eligibility).toBe("maybe");
    expect(carbon(input(r({ acres: 20, cover: cover(90) }))).reason).toBe(
      "18 ac of forest, under the 30 ac minimum",
    );
    expect(carbon(input(r({ county: MONTGOMERY }))).reason).toBe(
      "The program enrolls western Virginia only: check your county",
    );
  });

  it("hunting lease: only where Hunt makes sense, a low-confidence range rounded to $50", () => {
    const o = lease(input(r({})));
    expect(o).toMatchObject({ eligibility: "eligible", reason: "100 ac you can hunt: big enough to lease" });
    expect(o.number[0]).toMatchObject({
      text: "About $300–$1,000 a year (100 ac at $3–10 an acre): a rough range, not a quote",
      firmness: "low",
    });
    expect(lease(input(r({ acres: 30 }))).eligibility).toBe("maybe");
    expect(
      lease(input(r({}), { hunt: ["maybe", "3 houses within a quarter mile of the boundary"] })).reason,
    ).toBe("Hunting is a maybe here: 3 houses within a quarter mile of the boundary");
    expect(lease(input(r({ acres: 6 }), { hunt: ["maybe", "Under 10 ac"] }))).toMatchObject({
      eligibility: "no",
      number: [],
    });
  });

  it("selective timber: no number without a cruise; a typed cruise shows with its date", () => {
    expect(timber(input(r({}))).number[0]!.text).toBe(
      "Needs a timber cruise: ask a consulting forester for a cruise",
    );
    expect(
      timber(input(r({}), {}, { timberCruise: { value: 42_000, date: "2026-09-01" } })).number[0],
    ).toEqual({
      text: "A cruise valued the timber at $42,000 (2026-09-01)",
      firmness: "from your cruise",
    });
    expect(timber(input(r({ acres: 10, cover: cover(50) }))).eligibility).toBe("maybe");
    expect(timber(input(r({ acres: 2, cover: cover(50) }))).eligibility).toBe("no");
  });

  it("split and resell: Divide's answer, with each scenario's break-even or Try a split", () => {
    expect(splitResell(input(r({})))).toMatchObject({
      eligibility: "eligible",
      number: [{ text: "Try a split to see its break-even" }],
    });
    const s = splitResell(
      input(r({}), {}, {}, [
        { name: "Split 1", soldWord: "North", perAc: 5_410 },
        { name: "Split 2", soldWord: "West", perAc: null },
      ]),
    );
    expect(s.number.map((l) => l.text)).toEqual([
      "Split 1: sell the north piece at $5,410/ac or more to break even",
      "Split 2: type the purchase price to see its break-even",
    ]);
    expect(splitResell(input(r({}), { divide: ["no", "1 lot"] }))).toMatchObject({
      eligibility: "no",
      number: [],
    });
  });

  it("camp sites: never Eligible; the county's rules, with the ordinance linked", () => {
    const o = campSites(input(r({ county: county("51077", "Grayson", "VA") })));
    expect(o).toMatchObject({ eligibility: "maybe", reason: "The county's rules decide" });
    expect(o.link?.href).toMatch(/^https:\/\/graysoncountyva\.gov\//);
    expect(campSites(input(r({}), { camp: ["no", "No way in"] }))).toMatchObject({
      eligibility: "no",
      reason: "No way in",
    });
  });
});

describe("on the fixtures", () => {
  it("seven options, in order, each with a cost and a question, and Not eligible with no number", () => {
    for (const slug of [
      "grayson-mud-creek-6273",
      "macks-mountain-35-3",
      "ferney-creek-52-47A",
      "roan-hwy-143-099-046-02",
    ] as const) {
      const opts = howItCouldPay(fixture(slug, { askingPrice: 250_000 }));
      expect(opts.map((o) => o.key)).toEqual(PAY_ORDER);
      for (const o of opts) {
        expect(o.cost.length, `${slug} ${o.key}`).toBeGreaterThan(0);
        expect(o.ask.question, `${slug} ${o.key}`).toMatch(/\?$/);
        if (o.eligibility === "no") expect(o.number, `${slug} ${o.key}`).toEqual([]);
      }
    }
  });

  it("Mud Creek (Grayson): no use-value program; Virginia's slider; timber Eligible", () => {
    const o = byKey(howItCouldPay(fixture("grayson-mud-creek-6273", { askingPrice: 250_000 })));
    expect(o.useValue).toMatchObject({ eligibility: "no", reason: "Grayson has no land use program" });
    expect(o.easement!.slider).toEqual({ state: "VA", max: 250_000, step: 5_000 });
    expect(o.timber!.eligibility).toBe("eligible");
  });

  it("Roan (Carter, Tennessee): no state credit, too little forest for Greenbelt or carbon", () => {
    const o = byKey(howItCouldPay(fixture("roan-hwy-143-099-046-02")));
    expect(o.easement!.slider).toBeUndefined();
    expect(o.useValue).toMatchObject({
      eligibility: "no",
      reason: "8.9 ac of forest, under the 15 ac minimum",
    });
    expect(o.carbon!.eligibility).toBe("no");
  });
});

describe("outside the grade (plan §1)", () => {
  it("nothing in lib/pay reads the card's grading or the rubric", () => {
    for (const f of readdirSync(__dirname).filter((n) => n.endsWith(".ts") && !n.endsWith(".test.ts"))) {
      const src = readFileSync(`${__dirname}/${f}`, "utf8");
      expect(src, f).not.toMatch(/from "\.\.\/(report\/card|rubric\/)/);
    }
  });
});
