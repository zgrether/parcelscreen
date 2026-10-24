/** What limits you (step 14 §3.1, §11): the easements by purpose, the listing's deed and HOA, flood and power. */
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { synthetic } from "@/test/support/uses";
import type { PartialScreenResult } from "../screen/types";
import { limits } from "./limits";
import type { UseLine, UsesInput } from "./types";

const MACKS = expectedOf("macks-mountain-35-3", "run");
const at = (result: PartialScreenResult, over: Partial<Omit<UsesInput, "result" | "facts">> = {}) =>
  limits(synthetic(result, {}, over)).map((f) => `${f.label}: ${f.value}`);
const line = (over: Partial<UseLine>): UseLine => ({
  id: "e",
  name: "Easement 1",
  kind: "easement",
  recordedIn: "",
  ...over,
});

describe("What limits you", () => {
  it("Macks: no easement drawn, nothing typed, no flood zone, a 765 kV line across it, 59 ft from site #1", () => {
    expect(at(MACKS)).toEqual([
      "Easements: None drawn",
      "Deed restrictions: Not known",
      "HOA: Not known",
      "Flood zone: No FEMA flood zone on the parcel",
      "Power lines: A power line crosses the parcel (3,035 ft of it inside)",
      "Power lines: A 765 kV power line 59 ft from the house site",
    ]);
  });

  it("each easement by its purpose and record; the listing's words as typed", () => {
    const out = at(MACKS, {
      lines: [
        line({ easementType: "row", recordedIn: "Floyd DB 12 Pg 3" }),
        line({ id: "u", name: "Power line easement", easementType: "utility" }),
        line({ id: "x", name: "Old easement" }),
        line({ id: "t", name: "Track 1", kind: "track" }),
      ],
      listing: { deedRestrictions: "No mobile homes", hoa: "no" },
    });
    expect(out.slice(0, 5)).toEqual([
      "Easement 1: Road right-of-way; recorded in Floyd DB 12 Pg 3",
      "Power line easement: Utility",
      "Old easement: type not given",
      "Deed restrictions: No mobile homes",
      "HOA: No",
    ]);
  });

  it("flood acres; a line near but not across, from the boundary when none is kept; none within 3 km", () => {
    const flood = { zones: ["AE"], sfha: true, sfhaAcres: 2.34, mapped: true };
    const far = { ...MACKS.power!, lines: [], crosses: false, insideFt: 0, nearestFt: 5113, nearestKV: 161 };
    expect(at({ ...MACKS, flood, power: far }).slice(3)).toEqual([
      "Flood zone: 2.3 ac in the flood zone",
      "Power lines: A 161 kV power line 5,113 ft from the boundary",
    ]);
    const none = { ...far, nearestFt: null, nearestKV: null };
    expect(at({ ...MACKS, power: none }).at(-1)).toBe("Power lines: No power line within 3 km");
  });

  it("what didn't load: said", () => {
    expect(at({ ...MACKS, flood: undefined, power: undefined }).slice(3)).toEqual([
      "Flood zone: The FEMA flood map didn't load",
      "Power lines: Power lines didn't load",
    ]);
  });
});
