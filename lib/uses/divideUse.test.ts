/** Divide's answer (step 14 §3.1, §3.3, §11): divide.ts's count as Yes / Maybe / No, on Mud Creek (Grayson, zoned RF). */
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { synthetic } from "@/test/support/uses";
import type { PartialScreenResult } from "../screen/types";
import { divideUse } from "./divideUse";

const MUD = expectedOf("grayson-mud-creek-6273", "run");
const GRAYSON = MUD.county!;
const r = (over: Partial<PartialScreenResult>): PartialScreenResult => ({ ...MUD, ...over });
const at = (result: PartialScreenResult) => divideUse(synthetic(result));
const frontage = (publicFt: number) => ({
  publicFt,
  roads: [{ name: "Mud Creek Rd", ft: publicFt, public: true }],
});

describe("Divide's answer", () => {
  it("2 lots or more, the district read from the map: yes, the binding limit named", () => {
    expect(at(MUD)).toMatchObject({
      answer: "yes",
      reason: "Up to 11 lots: limited by 1,116 ft of road frontage at 100 ft per lot",
    });
  });

  it("the district not read: maybe, the rural default assumed and said", () => {
    expect(at(r({ county: { ...GRAYSON, zoning: null } }))).toMatchObject({
      answer: "maybe",
      reason:
        "Up to 11 lots: limited by 1,116 ft of road frontage at 100 ft per lot; assumes the rural default (no zoning map online)",
    });
  });

  it("frontage not measured where the county counts it: maybe, said", () => {
    expect(at(r({ frontage: undefined }))).toMatchObject({
      answer: "maybe",
      reason: "Up to 43 lots: limited by 30 ac at a 0.69 ac minimum; road frontage wasn't measured",
    });
  });

  it("1 lot by the frontage where the acres allow more and a private street could serve: maybe, never counted", () => {
    expect(at(r({ frontage: frontage(50) }))).toMatchObject({
      answer: "maybe",
      reason: "1 lot: limited by 50 ft of road frontage at 100 ft per lot; could allow more: Private street",
    });
  });

  it("1 lot by the acres: no", () => {
    expect(at(r({ acres: 1.2 }))).toMatchObject({
      answer: "no",
      reason: "1 lot: limited by 1.2 ac at a 0.69 ac minimum",
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

  it("the county's rules are the facts, each with its source, date and confidence; exceptions could allow more", () => {
    const a = at(MUD);
    const labels = a.decides.map((f) => f.label);
    expect(labels.slice(0, 7)).toEqual([
      "County",
      "Ordinance",
      "Zoning",
      "Acres",
      "Minimum lot",
      "Road frontage per lot",
      "Public road frontage",
    ]);
    expect(a.decides.find((f) => f.label === "Zoning")?.value).toBe("Rural Farm (RF)");
    const exceptions = a.decides.filter((f) => f.label === "Exception");
    expect(exceptions.map((f) => f.value)).toEqual([
      "Could allow more: A farm division: up to 4 parcels of at least 10 ac each, approved by staff (§6-6)",
      "Could allow more: A family division: one lot per family member, approved by staff, meeting zoning (§6-5)",
      "Could allow more: A Class II private street: a 40 ft easement, 20 ft surfaced, at most 17% grade (§9-6)",
      "Could allow more: A lot without frontage can use a 40 ft right-of-way (§9-2); a house needs 30 ft of frontage on a state road or a 30 ft deeded right-of-way (zoning §3-7)",
    ]);
    for (const f of exceptions) expect(f).toMatchObject({ date: "2026-10-23" });
  });
});
