/** Camp now's yes / maybe / no (step 14 §3.1, §11), on Mud Creek's result with the parts that decide it replaced. */
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { point, pricedCamp, synthetic } from "@/test/support/uses";
import type { PartialScreenResult } from "../screen/types";
import { campNow } from "./camp";

const MUD = expectedOf("grayson-mud-creek-6273", "run");
const cover = (openGentleAc: number, openNearRoadAc: number) => ({
  forestPct: 50,
  openPct: 10,
  openGentleAc,
  openNearRoadAc,
  year: 2021,
});
const r = (over: Partial<PartialScreenResult>): PartialScreenResult => ({ ...MUD, ...over });
const site1 = MUD.sites![0]!.ll;

describe("Camp now", () => {
  const rows: [string, Parameters<typeof synthetic>, string, string][] = [
    [
      "open gentle ground near a road, priced: yes, with its cost",
      [r({ cover: cover(1, 0.4) }), { cost: pricedCamp(800) }],
      "yes",
      "0.40 ac of open gentle ground within 300 ft of a road; ready to camp $10k",
    ],
    [
      "a campsite mark the drawn way reaches: yes",
      [r({ cover: cover(0, 0) }), { cost: pricedCamp(0) }, { marks: [point("campsite", site1)] }],
      "yes",
      "Your campsite mark, reached by the way you drew; ready to camp $10k",
    ],
    [
      "a campsite mark past new ground: maybe, the track to cut",
      [r({ cover: cover(0, 0) }), { cost: pricedCamp(1234) }, { marks: [point("campsite", site1)] }],
      "maybe",
      "Reachable only after a pioneer track (1,234 ft to cut)",
    ],
    [
      "open ground only far from a road: maybe",
      [r({ cover: cover(2, 0.1) }), { cost: pricedCamp(900) }],
      "maybe",
      "Open ground only, farther than 300 ft from a road",
    ],
    [
      "the camp needs an easement: maybe",
      [r({ cover: cover(1, 1) }), { cost: pricedCamp(0, true) }],
      "maybe",
      "The way in needs an easement first",
    ],
    [
      "no open or marked spot, a site that fits: maybe, camp at the site",
      [r({ cover: cover(0, 0) }), { cost: pricedCamp(600) }],
      "maybe",
      "Reachable only after a pioneer track (600 ft to cut)",
    ],
    [
      "no practical way in: no",
      [r({ cover: cover(1, 1) }), { cost: { kind: "noWay" } }],
      "no",
      "No practical drive: the costs need a way in",
    ],
    [
      "no open or marked spot and the best site too small: no",
      [
        r({ cover: cover(0, 0), sites: MUD.sites!.map((s) => ({ ...s, fit: "too small" as const })) }),
        { cost: pricedCamp(600) },
      ],
      "no",
      "No open or marked spot, and the best site is too small",
    ],
    [
      "land cover didn't load, nothing marked: maybe, said",
      [r({ cover: undefined }), { cost: pricedCamp(600) }],
      "maybe",
      "Land cover didn't load: open ground not known",
    ],
    [
      "not priced (the driveway wasn't routed): maybe, said",
      [r({ cover: cover(1, 1) }), { cost: null }],
      "maybe",
      "The way in isn't priced yet: the driveway hasn't been routed",
    ],
  ];
  it.each(rows)("%s", (_, args, answer, reason) => {
    expect(campNow(synthetic(...args))).toMatchObject({ answer, reason });
  });

  it("says what decides it: the marks, the open ground with its source and year, the track and the cost", () => {
    const a = campNow(synthetic(r({ cover: cover(1, 0.4) }), { cost: pricedCamp(800) }));
    expect(a.decides.map((f) => [f.label, f.value])).toEqual([
      ["Campsite marks", "none"],
      ["Open gentle ground within 300 ft of a road", "0.40 ac"],
      ["Open gentle ground", "1.0 ac"],
      ["Pioneer track to camp", "800 ft"],
      ["Ready to camp", "$10k, plus the land"],
    ]);
    expect(a.decides[1]).toMatchObject({ source: "NLCD land cover", date: "2021" });
  });
});
