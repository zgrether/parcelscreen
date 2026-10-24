/** Hunt's yes / maybe (step 14 §3.1, §11), on Macks (292 ac, Floyd County) with the parts that decide it replaced. */
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { synthetic } from "@/test/support/uses";
import type { PartialScreenResult } from "../screen/types";
import { hunt } from "./hunt";

const MACKS = expectedOf("macks-mountain-35-3", "run");
const cover = (forestPct: number) => ({
  forestPct,
  openPct: 0,
  openGentleAc: 0,
  openNearRoadAc: 0,
  year: 2021,
});
const near = (n: number) =>
  MACKS.sites!.map((s) => ({ ...s, privacy: { near: n, inSight: 0, nearestFt: n ? 900 : 4000 } }));
const r = (over: Partial<PartialScreenResult>): PartialScreenResult => ({
  ...MACKS,
  cover: cover(80),
  sites: near(0),
  ...over,
});
const at = (result: PartialScreenResult) => hunt(synthetic(result));
const NATIONAL_FOREST = {
  name: "Jefferson National Forest",
  manager: "USFS",
  type: "FED",
  access: "OA",
  gap: "3",
  adjoins: true,
  distFt: null,
};

describe("Hunt", () => {
  it("10 ac and more, half forest, no house near, a covered county: yes", () => {
    expect(at(r({}))).toMatchObject({ answer: "yes", reason: "292 ac, 80% forest" });
  });

  it("open public land next door stands in for the size and the forest", () => {
    expect(at(r({ acres: 4, cover: cover(10), protected: [NATIONAL_FOREST] }))).toMatchObject({
      answer: "yes",
      reason: "Adjoins open public land (Jefferson National Forest)",
    });
  });

  it("smaller, thinner or with houses near: maybe, said", () => {
    expect(at(r({ acres: 6.5 }))).toMatchObject({ answer: "maybe", reason: "Under 10 ac (6.5 ac)" });
    expect(at(r({ cover: cover(36) }))).toMatchObject({ answer: "maybe", reason: "36% forest, under 50%" });
    expect(at(r({ sites: near(3) }))).toMatchObject({
      answer: "maybe",
      reason: "3 houses within a quarter mile of site #1",
    });
  });

  it("a county not covered: maybe, said; and the county line says so", () => {
    const a = at(r({ county: { fips: "51197", name: "Wythe", state: "VA", zoning: null } }));
    expect(a).toMatchObject({ answer: "maybe", reason: "The county's rules aren't covered here yet" });
    expect(a.decides.find((f) => f.label === "The county's rule on where you can shoot")?.value).toBe(
      "Not covered here yet",
    );
  });

  it("what didn't load: maybe, said", () => {
    expect(at(r({ cover: undefined })).reason).toBe("Land cover didn't load: forest share not known");
    expect(at(r({ sites: MACKS.sites!.map(({ privacy: _, ...s }) => s) })).reason).toBe(
      "Houses nearby weren't measured",
    );
    expect(at(r({ county: undefined })).reason).toBe("The county didn't load: grade again");
  });

  it("the state's basics and the county's rule, each with its source and date", () => {
    const a = at(r({}));
    const by = (label: string) => a.decides.find((f) => f.label === label);
    expect(by("License")).toMatchObject({
      value:
        "Landowners, their spouses, children, grandchildren and parents need no license on their own land (Va. Code §29.1-301)",
      source: "https://law.lis.virginia.gov/vacode/title29.1/chapter3/section29.1-301/",
      date: "2026-10-23",
    });
    expect(by("Floyd County's rule on where you can shoot")?.value).toMatch(/100 yards .*\(to confirm\)$/);
    expect(a.decides.map((f) => f.label)).toEqual([
      "Acres",
      "Forest",
      "Open public land next door",
      "Houses within a quarter mile",
      "Floyd County's rule on where you can shoot",
      "License",
      "Sunday hunting",
      "Hunter orange",
      "Near roads",
    ]);
  });
});
