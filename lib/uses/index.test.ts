/**
 * Every use on the four fixtures' recorded runs (step 14 §11): the answers and reasons, for review. Graded as the panel
 * will grade them: the card's facts at the default rubric's best site, priced at the default rates, with no marks, no
 * lines and an empty listing.
 */
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { usesInput as inputOf } from "@/test/support/uses";
import type { PartialScreenResult } from "../screen/types";
import { landUses } from "./index";

const view = (r: PartialScreenResult) => {
  const v = landUses(inputOf(r));
  return {
    uses: Object.fromEntries(v.uses.map((u) => [u.key, `${u.answer.answer}: ${u.answer.reason}`])),
    limits: v.limits.map((f) => `${f.label}: ${f.value}`),
  };
};

describe("the uses on the fixtures", () => {
  it("Mud Creek", () => {
    expect(view(expectedOf("grayson-mud-creek-6273", "run"))).toMatchInlineSnapshot(`
      {
        "limits": [
          "Easements: None drawn",
          "Deed restrictions: Not known",
          "HOA: Not known",
          "Flood zone: 0.5 ac in the flood zone",
          "Power lines: No power line within 3 km",
        ],
        "uses": {
          "build": "maybe: No soil on the parcel rates better than very limited for a septic field",
          "camp": "maybe: Reachable only after a pioneer track (2,888 ft to cut)",
          "divide": "yes: Up to 11 lots: limited by 1,116 ft of road frontage at 100 ft per lot",
          "garden": "maybe: Garden ground, but no water found: no spring, stream or well marked, and no year-round stream mapped",
          "hunt": "maybe: 1 house within a quarter mile of site #1",
          "ride": "no: No public land next door, and the nearest long trail is 22 mi away by road; neighbours' corridors are private unless they agree",
          "trails": "no: Mostly steeper than 15%",
        },
      }
    `);
  });
  it("Macks", () => {
    expect(view(expectedOf("macks-mountain-35-3", "run"))).toMatchInlineSnapshot(`
      {
        "limits": [
          "Easements: None drawn",
          "Deed restrictions: Not known",
          "HOA: Not known",
          "Flood zone: No FEMA flood zone on the parcel",
          "Power lines: A power line crosses the parcel (3,035 ft of it inside)",
          "Power lines: A 765 kV power line 1,113 ft from the house site",
        ],
        "uses": {
          "build": "maybe: Frontage on an unnamed road; the road in is a track (OpenStreetMap); check that it's public and drivable year-round",
          "camp": "yes: 0.40 ac of open gentle ground within 300 ft of a road; ready to camp $6–21k",
          "divide": "yes: Up to 24 lots: limited by 2,494 ft of road frontage at 100 ft per lot",
          "garden": "maybe: Garden ground, but no water found: no spring, stream or well marked, and no year-round stream mapped",
          "hunt": "yes: 292 ac, 93% forest",
          "ride": "maybe: Gentle ground for your own loop (about 1.4 mi of trail); neighbours' corridors are private unless they agree",
          "trails": "yes: About 1.4 mi of trail on 16 ac of gentle ground, at a path every 100 ft",
        },
      }
    `);
  });
  it("Ferney", () => {
    expect(view(expectedOf("ferney-creek-52-47A", "run"))).toMatchInlineSnapshot(`
      {
        "limits": [
          "Easements: None drawn",
          "Deed restrictions: Not known",
          "HOA: Not known",
          "Flood zone: No FEMA flood zone on the parcel",
          "Power lines: A 765 kV power line 1,649 ft from the house site",
        ],
        "uses": {
          "build": "maybe: Frontage on an unnamed road; the road in is marked private (OpenStreetMap); if it isn't this parcel's own drive, you need a recorded right to use it",
          "camp": "yes: 12 ac of open gentle ground within 300 ft of a road; ready to camp $3–9k",
          "divide": "yes: Up to 21 lots: limited by 44 ac at a 2 ac minimum",
          "garden": "maybe: Garden ground, but no water found: no spring, stream or well marked, and no year-round stream mapped",
          "hunt": "maybe: 36% forest, under 50%",
          "ride": "maybe: Gentle ground for your own loop (about 1.5 mi of trail); neighbours' corridors are private unless they agree",
          "trails": "yes: About 1.5 mi of trail on 18 ac of gentle ground, at a path every 100 ft",
        },
      }
    `);
  });
  it("Roan", () => {
    expect(view(expectedOf("roan-hwy-143-099-046-02", "run"))).toMatchInlineSnapshot(`
      {
        "limits": [
          "Easements: None drawn",
          "Deed restrictions: Not known",
          "HOA: Not known",
          "Flood zone: No FEMA flood zone on the parcel",
          "Power lines: A 161 kV power line 5,113 ft from the boundary",
        ],
        "uses": {
          "build": "maybe: The driveway needs an easement across neighbouring land",
          "camp": "maybe: The way in needs an easement first",
          "divide": "no: 1 lot: limited by 0 ft of road frontage at 40 ft per lot",
          "garden": "maybe: Garden ground, but no water found: no spring, stream or well marked, and no year-round stream mapped",
          "hunt": "maybe: 27 houses within a quarter mile of site #1",
          "ride": "no: No public land next door, and the nearest long trail is 17 mi away by road; neighbours' corridors are private unless they agree",
          "trails": "no: Mostly steeper than 15%",
        },
      }
    `);
  });

  it("every use answers, with a reason, and every fact has a value", () => {
    for (const slug of [
      "grayson-mud-creek-6273",
      "macks-mountain-35-3",
      "ferney-creek-52-47A",
      "roan-hwy-143-099-046-02",
    ] as const) {
      const v = landUses(inputOf(expectedOf(slug, "run")));
      expect(v.uses.map((u) => u.key)).toEqual([
        "camp",
        "build",
        "trails",
        "garden",
        "hunt",
        "ride",
        "divide",
      ]);
      for (const u of v.uses) {
        expect(u.answer.reason.length, `${slug} ${u.key}`).toBeGreaterThan(0);
        for (const f of u.answer.decides)
          expect(f.value.length, `${slug} ${u.key} ${f.label}`).toBeGreaterThan(0);
      }
    }
  });
});
