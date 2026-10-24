/** A piece's county check and its rows (step 14 §5.1, §11), on Mud Creek's result (Grayson: 0.69 ac, 100 ft per lot). */
import { describe, expect, it } from "vitest";
import { DEFAULT_RATES } from "@/lib/config/costs";
import { reportCard } from "@/lib/report/card";
import { drawnOf } from "@/lib/report/marks";
import { expectedOf } from "@/test/support/expected";
import { ZACH } from "@/test/support/rubrics";
import type { PartialScreenResult } from "../screen/types";
import { pieceCountyCheck } from "./countyCheck";
import { pieceRows } from "./pieceRows";

const MUD = expectedOf("grayson-mud-creek-6273", "run");
const GRAYSON = MUD.county!;
const r = (over: Partial<PartialScreenResult>): PartialScreenResult => ({ ...MUD, ...over });
const frontage = (publicFt: number) => ({
  publicFt,
  roads: [{ name: "Mud Creek Rd", ft: publicFt, public: true }],
});

describe("a piece's county check", () => {
  it("over the minimum lot, with the frontage per lot: passes both", () => {
    expect(pieceCountyCheck(r({ acres: 14.2, frontage: frontage(400) }))).toEqual({
      pass: true,
      text: "Passes the county's lot size and frontage",
    });
  });

  it("short of frontage, or of acres, or both: under the county's rule, each named", () => {
    expect(pieceCountyCheck(r({ acres: 14.2, frontage: frontage(60) }))).toEqual({
      pass: false,
      text: "Under the county's 100 ft of road frontage per lot",
    });
    expect(pieceCountyCheck(r({ acres: 0.5, frontage: frontage(400) }))).toEqual({
      pass: false,
      text: "Under the county's 0.69 ac minimum lot",
    });
    expect(pieceCountyCheck(r({ acres: 0.5, frontage: frontage(0) }))).toEqual({
      pass: false,
      text: "Under the county's 0.69 ac minimum lot and 100 ft of road frontage per lot",
    });
  });

  it("frontage not measured: the lot size passes, the frontage isn't known", () => {
    expect(pieceCountyCheck(r({ acres: 14.2, frontage: undefined }))).toEqual({
      pass: null,
      text: "Passes the county's lot size; road frontage wasn't measured",
    });
  });

  it("a county not covered, or none loaded: said, with no pass or fail; the parent's county fills a missing one", () => {
    expect(
      pieceCountyCheck(r({ county: { fips: "51197", name: "Wythe", state: "VA", zoning: null } })),
    ).toEqual({ pass: null, text: "Not covered here yet" });
    expect(pieceCountyCheck(r({ county: undefined }))).toEqual({
      pass: null,
      text: "The county didn't load: grade again",
    });
    expect(pieceCountyCheck(r({ county: undefined, acres: 14.2, frontage: frontage(400) }), GRAYSON)).toEqual(
      { pass: true, text: "Passes the county's lot size and frontage" },
    );
  });
});

describe("a piece's rows", () => {
  it("its grade, its cost to camp and to build with no land price, and its county check, in that order", () => {
    const card = reportCard(MUD, ZACH, drawnOf([], null, { askingPrice: null, rates: DEFAULT_RATES }));
    const rows = pieceRows(card, pieceCountyCheck(MUD), "Your grade");
    expect(rows.map((x) => x.key)).toEqual(["grade", "camp", "build", "county"]);
    expect(rows[0]).toMatchObject({ label: "Your grade", grade: card.grade });
    expect(rows[1]?.label).toBe("Ready to camp");
    expect(rows[1]?.value).toMatch(/plus the land$/);
    expect(rows[2]?.label).toBe("Ready to build");
    expect(rows[3]).toMatchObject({ label: "County", tone: "pass" });
  });

  it("not priced yet: one cost row says so", () => {
    const card = reportCard(MUD, ZACH); // no drawn costs: the cost isn't priced
    const rows = pieceRows(
      card,
      { pass: false, text: "Under the county's 0.69 ac minimum lot" },
      "Your grade",
    );
    expect(rows.map((x) => x.key)).toEqual(["grade", "cost", "county"]);
    expect(rows[2]).toMatchObject({ tone: "fail" });
  });
});
