/**
 * The Airport row (step 11, plan §2.5): the drive to the nearest airport on Settings' list, from the drives a screen
 * already has; which places count as airports; question 7 in saved priorities.
 */
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { defaultRubric } from "../rubric/default";
import { withFactor } from "../rubric/factorsAdd";
import type { Rubric } from "../rubric/types";
import type { ScreenResult } from "../screen/types";
import { cardFacts, isAirport } from "./card";

const MUD = expectedOf("grayson-mud-creek-6273", "run");
const rowOf = (r: ScreenResult) => cardFacts(r).rows.find((x) => x.key === "airport")!;

/** Mud Creek with the airports' drives set to these minutes, by code. */
function withAirports(min: Record<string, number>): ScreenResult {
  const r = structuredClone(MUD);
  r.drives = r.drives!.map((d) => {
    const code = d.label.match(/\(([A-Z]{3})\)/)?.[1];
    return code && min[code] !== undefined ? { ...d, min: min[code] } : d;
  });
  return r;
}

describe("the Airport row", () => {
  it("names the places that are airports: 'airport' in the name, or a code in parentheses", () => {
    expect(isAirport("Roanoke airport (ROA)")).toBe(true);
    expect(isAirport("Greenville-Spartanburg (GSP)")).toBe(true);
    expect(isAirport("Greensboro (GSO)")).toBe(true);
    expect(isAirport("Mom's house")).toBe(false);
  });

  it("the nearest by drive, graded A within 45 min, B 60, C 90, D 120", () => {
    const at = (m: number) => rowOf(withAirports({ TRI: m, ROA: 300, AVL: 300, GSP: 300, CLT: 300 })).grade;
    expect([at(40), at(60), at(80), at(110), at(130)]).toEqual(["A", "B", "C", "D", "F"]);
    const row = rowOf(MUD);
    expect(row.detail).toBe("a 93-minute drive to Tri-Cities airport (TRI)");
    expect(row.short).toBe("TRI 93 min");
    expect(row.measure).toEqual({ value: 93, unit: "min" });
  });

  it("no airport on the list says so, ungraded; drives that failed are unknown", () => {
    const none = structuredClone(MUD);
    none.drives = none.drives!.filter((d) => !isAirport(d.label));
    expect(rowOf(none)).toMatchObject({ grade: null });
    expect(rowOf(none).detail).toMatch(/^no airport on your list/);
    const failed = { ...structuredClone(MUD), failed: ["drive" as const] };
    expect(rowOf(failed)).toMatchObject({ grade: null, missing: "the drive times" });
  });
});

describe("Airport in saved priorities (plan §5)", () => {
  const SAVED: Rubric = {
    ...defaultRubric(),
    weights: { mode: "rankSum" },
    ranked: [{ factor: "elevation", tier: "should" }],
    wonts: [],
  };

  it("a few times a year: the bottom of Nice to have at 90 min; monthly at 60; rarely or none: Don't care", () => {
    const few = withFactor(SAVED, "airport", { fly: "few" })!;
    expect(few.ranked.at(-1)).toEqual({ factor: "airport", tier: "could" });
    expect(few.bands.airportMin[1]).toBe(90);
    expect(withFactor(SAVED, "airport", { fly: "monthly" })!.bands.airportMin[1]).toBe(60);
    expect(withFactor(SAVED, "airport", { fly: "rarely" })!.wonts).toEqual(["airport"]);
    expect(withFactor(SAVED, "airport", {})!.wonts).toEqual(["airport"]);
  });
});
