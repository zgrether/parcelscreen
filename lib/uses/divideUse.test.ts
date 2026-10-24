/**
 * Divide's answer (step 14 §3.1, §3.3, §11; owner, #311): two numbers, each with what binds it, on Mud Creek (Grayson,
 * zoned RF): without subdivision review by the county's farm division, and with an approved subdivision plat by the
 * standard lots; What decides it shows the arithmetic, each line with the ordinance's section and URL.
 */
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { synthetic } from "@/test/support/uses";
import type { PartialScreenResult } from "../screen/types";
import { divideReportLine, divideUse } from "./divideUse";

const MUD = expectedOf("grayson-mud-creek-6273", "run");
const ROAN = expectedOf("roan-hwy-143-099-046-02", "run");
const GRAYSON = MUD.county!;
const r = (over: Partial<PartialScreenResult>): PartialScreenResult => ({ ...MUD, ...over });
const at = (result: PartialScreenResult) => divideUse(synthetic(result));
const frontage = (publicFt: number) => ({
  publicFt,
  roads: [{ name: "Mud Creek Rd", ft: publicFt, public: true }],
});

const FARM =
  "Up to 3 lots without subdivision review (a farm division approved by staff; limited by 30.15 ac at 10 ac a lot)";
const PLAT =
  "up to 11 with an approved subdivision plat (limited by 1,116 ft of road frontage at 100 ft per lot; more lots need a road built to the county's standard)";
const GRAYSON_SO = "https://graysoncountyva.gov/DocumentCenter/View/262/Subdivision-Ordinance--PDF";
const GRAYSON_ZO = "https://graysoncountyva.gov/DocumentCenter/View/257/Zoning-Ordinance-PDF";

describe("Divide's answer", () => {
  it("Mud Creek: two numbers, each with what binds it, in the county's terms", () => {
    expect(at(MUD)).toMatchObject({ answer: "yes", reason: `${FARM} · ${PLAT}` });
  });

  it("What decides it: Mud Creek's arithmetic, what binds each number, with the section and the ordinance's URL", () => {
    const facts = at(MUD).decides;
    const fact = (label: string) => facts.find((f) => f.label === label)!;
    expect(facts.map((f) => f.label).slice(0, 8)).toEqual([
      "County",
      "Ordinance",
      "Zoning",
      "Acres",
      "Without subdivision review",
      "Lots by size",
      "Lots by frontage",
      "With a subdivision plat",
    ]);
    expect(fact("Acres").value).toBe("30.15 ac");
    expect(fact("Without subdivision review")).toEqual({
      label: "Without subdivision review",
      value: "30.15 ac ÷ 10 ac a lot = 3 lots; the rule allows at most 4; 3 lots: lot size binds (§6-6)",
      source: GRAYSON_SO,
      date: "2026-10-23",
    });
    expect(fact("Lots by size")).toMatchObject({
      value: "30.15 ac ÷ 0.69 ac minimum lot = 43 lots (§4-6.3)",
      source: GRAYSON_ZO,
    });
    expect(fact("Lots by frontage")).toMatchObject({
      value: "1,116 ft of public road frontage ÷ 100 ft a lot = 11 lots (§9-2)",
      source: GRAYSON_SO,
    });
    expect(fact("With a subdivision plat").value).toBe("11 lots: road frontage binds");
    // The county's own rules follow, the exceptions in its words.
    const exceptions = facts.filter((f) => f.label === "Also allowed");
    expect(exceptions.map((f) => f.value)).toEqual([
      "A farm division: up to 4 parcels of at least 10 ac each, approved by staff (§6-6)",
      "A family division: one lot per family member, approved by staff, meeting zoning (§6-5)",
      "A Class II private street: a 40 ft easement, 20 ft surfaced, at most 17% grade (§9-6)",
      "A lot without frontage can use a 40 ft right-of-way (§9-2); a house needs 30 ft of frontage on a state road or a 30 ft deeded right-of-way (zoning §3-7)",
    ]);
    for (const f of exceptions) expect(f).toMatchObject({ date: "2026-10-23" });
  });

  it("the farm division's cap binds on more land: limited to 4 lots by the county's rule", () => {
    const a = at(r({ acres: 52 }));
    expect(
      a.reason.startsWith(
        "Up to 4 lots without subdivision review (a farm division approved by staff; limited to 4 lots by the county's rule)",
      ),
    ).toBe(true);
    expect(a.decides.find((f) => f.label === "Without subdivision review")?.value).toBe(
      "52.00 ac ÷ 10 ac a lot = 5 lots; the rule allows at most 4; 4 lots: the county's cap binds (§6-6)",
    );
  });

  it("the district not read: the farm division still stands, the plat's default said", () => {
    expect(at(r({ county: { ...GRAYSON, zoning: null } }))).toMatchObject({
      answer: "yes",
      reason: `${FARM} · ${PLAT}; assumes the rural default (no zoning map online)`,
    });
  });

  it("frontage not measured where the county counts it: said after the two numbers", () => {
    expect(at(r({ frontage: undefined }))).toMatchObject({
      answer: "yes",
      reason: `${FARM} · up to 43 with an approved subdivision plat (limited by 30 ac at a 0.69 ac minimum); road frontage wasn't measured`,
    });
  });

  it("too small for a farm division, 1 lot by the frontage where a private street could serve: maybe", () => {
    expect(at(r({ acres: 15, frontage: frontage(50) }))).toMatchObject({
      answer: "maybe",
      reason: "1 lot: limited by 50 ft of road frontage at 100 ft per lot; could allow more: Private street",
    });
  });

  it("1 lot by the acres, both ways: no", () => {
    expect(at(r({ acres: 1.2 }))).toMatchObject({
      answer: "no",
      reason: "1 lot: limited by 1.2 ac at a 0.69 ac minimum",
    });
  });

  it("Roan: lots of 5 ac or more without review, but no public road frontage: maybe, each lot's way in said", () => {
    expect(at(ROAN)).toMatchObject({
      answer: "maybe",
      reason:
        "Up to 2 lots without subdivision review (an exempt division with no new street or utility; limited by 13.29 ac at 5 ac a lot); each new lot still needs legal access to a road",
    });
  });

  it("a county not covered: no, not covered here yet; the county not loaded: maybe", () => {
    expect(at(r({ county: { fips: "51197", name: "Wythe", state: "VA", zoning: null } }))).toMatchObject({
      answer: "no",
      reason: "Not covered here yet",
    });
    expect(at(r({ county: undefined }))).toMatchObject({
      answer: "maybe",
      reason: "The county didn't load: grade again",
    });
  });

  it("no minimum lot size online: maybe, ask the county", () => {
    expect(at(r({ county: { fips: "47091", name: "Johnson", state: "TN", zoning: null } }))).toMatchObject({
      answer: "maybe",
      reason: "Johnson County's minimum lot size isn't online: ask the county",
    });
  });

  it("One page's line: the same two numbers", () => {
    expect(divideReportLine(MUD)).toBe(`Can divide: u${FARM.slice(1)} · ${PLAT}`);
    expect(divideReportLine(r({ acres: 1.2 }))).toBe("Can't divide: limited by 1.2 ac at a 0.69 ac minimum");
  });
});
