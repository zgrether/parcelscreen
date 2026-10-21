/**
 * The Driveway section's Paving row and the cost breakdown's paving line read one length (owner, #256 review): the
 * route's steep stretches at Settings' threshold, less any paved line, from lib/report/ground.ts. Mud Creek's route.
 */
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { DEFAULT_RATES, type Paving } from "../config/costs";
import type { LatLon } from "../geo/types";
import type { PartialScreenResult } from "../screen/types";
import { costToEnjoy, type CostLine } from "./cost";
import { drivewayView } from "./driveway";
import { routeRuns, steepStretchFt } from "./ground";
import { scoredRoute } from "./lines";

const MUD = (): PartialScreenResult => expectedOf("grayson-mud-creek-6273", "run");
const ft = (s: string): number => Number(/([\d,]+) ft/.exec(s)![1]!.replace(/,/g, ""));

/** The Driveway section's Paving row on the scored route (Mud Creek's first). */
function row(r: PartialScreenResult, paving: Paving, lines: readonly CostLine[] = []) {
  const v = drivewayView(r, undefined, null, { paving, lines })!;
  return v.routes[0]!.rows.find((x) => x.label.startsWith("Paving"))!;
}

/** The breakdown's paving line, paving on at this threshold. */
function breakdown(r: PartialScreenResult, abovePct: number, lines: readonly CostLine[] = []) {
  const c = costToEnjoy({
    result: r,
    lines,
    marks: [],
    askingPrice: 185_000,
    rates: DEFAULT_RATES,
    paving: { on: true, abovePct },
  });
  if (c?.kind !== "priced") throw new Error("not priced");
  return c.build.items.find((i) => i.label.startsWith("Paving"))!;
}

/** A paved drive drawn along the first third of the route. */
function pavedThird(r: PartialScreenResult): CostLine[] {
  const coords = scoredRoute(r.driveway!)!.line.geometry.coordinates;
  const line = coords.slice(0, Math.ceil(coords.length / 3)).map(([lon, lat]) => [lat!, lon!] as LatLon);
  return [{ id: "d1", kind: "drive", condition: "paved", line, recordedIn: "" }];
}

describe("one paving length for the Driveway section and the breakdown", () => {
  it("at 12%: the same length, and the row reads as it did before step 10", () => {
    const r = MUD();
    const x = row(r, { on: true, abovePct: 12 });
    expect(x).toEqual({ label: "Paving (over 12%)", value: "~2,185 ft (cost TBD)" });
    expect(breakdown(r, 12).label).toBe("Paving, 2,185 ft over 12%");
  });

  it("at 15%: the same, shorter length", () => {
    const r = MUD();
    const x = row(r, { on: true, abovePct: 15 });
    expect(x.label).toBe("Paving (over 15%)");
    const p = breakdown(r, 15);
    expect(ft(x.value)).toBe(ft(p.label));
    expect(ft(x.value)).toBeLessThan(2_185);
  });

  it("paving off: the row says steep gravel, at the same length the breakdown would pave", () => {
    const r = MUD();
    for (const abovePct of [12, 15]) {
      const x = row(r, { on: false, abovePct });
      expect(x.label).toBe("Paving");
      expect(x.value).toMatch(new RegExp(`^[\\d,]+ ft over ${abovePct}%: steep gravel, more upkeep$`));
      expect(ft(x.value)).toBe(ft(breakdown(r, abovePct).label));
    }
  });

  it("less a paved line along the route, in both", () => {
    const r = MUD();
    const lines = pavedThird(r);
    const x = row(r, { on: true, abovePct: 12 }, lines);
    const p = breakdown(r, 12, lines);
    expect(ft(x.value)).toBe(ft(p.label));
    expect(ft(x.value)).toBeLessThan(2_185);
    // Both are the shared function's.
    const rt = scoredRoute(r.driveway!)!;
    expect(Math.round(steepStretchFt(rt, 12, routeRuns(rt, lines)))).toBe(ft(x.value));
  });
});
