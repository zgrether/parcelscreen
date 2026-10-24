/**
 * The uses as the panel and the report build them (step 14 §6, §7): the input from the card and the parcel, Grade's
 * shortcut tally, One page's Divide line, and the power lines on the map.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_RATES } from "@/lib/config/costs";
import { expectedOf } from "@/test/support/expected";
import { usesInput } from "@/test/support/uses";
import { ZACH } from "@/test/support/rubrics";
import type { LineMarkup } from "../client/parcelStore";
import { reportCard } from "../report/card";
import { drawnOf } from "../report/marks";
import { powerFeatures } from "../render/resultGeo";
import { divideReportLine } from "./divideUse";
import { landUses } from "./index";
import { tallyOf, usesInputOf } from "./input";
import { USE_WORDS } from "./words";

const MUD = expectedOf("grayson-mud-creek-6273", "run");
const ROAN = expectedOf("roan-hwy-143-099-046-02", "run");
const MACKS = expectedOf("macks-mountain-35-3", "run");

const easement = (over: Partial<LineMarkup> = {}): LineMarkup => ({
  id: "e",
  name: "Red gate",
  shape: "line",
  kind: "easement",
  condition: "uncleared",
  line: [
    [36.6, -81.3],
    [36.601, -81.301],
  ],
  widthFt: 30,
  note: "",
  recordedIn: "Plat Bk 5 Pg 12",
  at: "2026-10-24T12:00:00.000Z",
  ...over,
});

describe("usesInputOf", () => {
  const drawn = drawnOf([], null, { askingPrice: null, rates: DEFAULT_RATES });

  it("the card's facts at the card's site, as the tests' own input builds them", () => {
    const card = reportCard(MUD, ZACH, drawn);
    const parcel = { markup: [], deedRestrictions: "", hoa: "unknown" as const };
    expect(landUses(usesInputOf(MUD, card, drawn, parcel))).toEqual(landUses(usesInput(MUD)));
  });

  it("the parcel's easements with their purpose, and the listing's deed restrictions and HOA", () => {
    const card = reportCard(MUD, ZACH, drawn);
    const input = usesInputOf(MUD, card, drawn, {
      markup: [easement({ easementType: "row" }), easement({ id: "t", kind: "track", name: "Track 1" })],
      deedRestrictions: "No mobile homes",
      hoa: "no",
    });
    expect(input.lines).toEqual([
      { id: "e", name: "Red gate", kind: "easement", easementType: "row", recordedIn: "Plat Bk 5 Pg 12" },
      { id: "t", name: "Track 1", kind: "track", easementType: null, recordedIn: "Plat Bk 5 Pg 12" },
    ]);
    const limits = landUses(input).limits.map((f) => `${f.label}: ${f.value}`);
    expect(limits).toContain("Red gate: Road right-of-way; recorded in Plat Bk 5 Pg 12");
    expect(limits).toContain("Deed restrictions: No mobile homes");
    expect(limits).toContain("HOA: No");
  });
});

describe("Grade's shortcut line", () => {
  it("counts each answer, leaving out a count of none", () => {
    const t = tallyOf(landUses(usesInput(MUD)));
    expect(t).toEqual({ yes: 1, maybe: 4, no: 2 });
    expect(USE_WORDS.tally(t)).toBe("What you can do here: 1 yes, 4 maybe, 2 no");
    expect(USE_WORDS.tally({ yes: 0, maybe: 7, no: 0 })).toBe("What you can do here: 7 maybe");
  });
});

describe("One page's Divide line", () => {
  it("2 lots or more: how many; 1 lot: why not; a county not covered or unread: nothing", () => {
    expect(divideReportLine(MUD)).toBe(
      "Can divide: up to 3 lots without subdivision review (a farm division approved by staff; limited by 30.15 ac at 10 ac a lot) · up to 11 with an approved subdivision plat (limited by 1,116 ft of road frontage at 100 ft per lot; more lots need a road built to the county's standard)",
    );
    expect(divideReportLine(ROAN)).toBe(
      "Can divide: up to 2 lots without subdivision review (an exempt division with no new street or utility; limited by 13.29 ac at 5 ac a lot)",
    );
    expect(divideReportLine({ ...MUD, acres: 1.2 })).toBe(
      "Can't divide: limited by 1.2 ac at a 0.69 ac minimum",
    );
    expect(divideReportLine({ ...MUD, county: undefined })).toBeNull();
    expect(divideReportLine({ ...MUD, county: { ...MUD.county!, fips: "99999" } })).toBeNull();
  });
});

describe("the power lines on the map", () => {
  it("each kept line as a line, with its voltage (and owner) as its tip; none without the measurement", () => {
    const fc = powerFeatures(MACKS);
    expect(fc.features.length).toBe(MACKS.power!.lines.filter((l) => l.coords.length >= 2).length);
    expect(fc.features.length).toBeGreaterThan(0);
    expect(fc.features.some((f) => f.properties.tip.startsWith("A 765 kV power line"))).toBe(true);
    expect(powerFeatures({ ...MACKS, power: undefined }).features).toEqual([]);
  });
});
