/**
 * Follow-up 34 on a real line (owner, 2026-10-12): the drive behind the red gate on Mud Creek Rd beside Grayson 6273,
 * drawn as an easement ("listing's 'road right of way into property', unverified"). Its trace is the driveway
 * validation study's road C (docs/studies/driveway-validation.md: 872 ft, about 20% on average and 41% at its steepest
 * over 30 m on the 3 m lidar), from the gate to the neighbour's pad, 132 ft short of 6273's boundary.
 */
import { bearing, destination, nearestPointOnLine, polygon, polygonToLine } from "@turf/turf";
import type { Feature, LineString } from "geojson";
import { describe, expect, it } from "vitest";
import input from "../../test/fixtures/grayson-mud-creek-6273/input.json";
import { runFixture } from "../../test/support/scenarios";
import roads from "../../test/tools/driveway-validation.roads.json";
import { reportCard } from "../report/card";
import { drivewayView } from "../report/driveway";
import type { DrawnInput } from "./types";
import type { LatLon } from "./util";

const redGate: DrawnInput = {
  id: "red-gate",
  kind: "easement",
  line: (roads.c.coordinates as [number, number][]).map(([lon, lat]) => [lat, lon]),
  widthFt: 30,
};

/** The same line carried on from the pad to 5 m inside 6273's boundary, at the nearest point: had the right-of-way gone on. */
function toTheBoundary(l: DrawnInput): DrawnInput {
  const end = l.line[l.line.length - 1]!;
  const ring = polygonToLine(
    polygon(input.polygon.geometry.coordinates as number[][][]),
  ) as Feature<LineString>;
  const np = nearestPointOnLine(ring, [end[1], end[0]]).geometry.coordinates;
  const [lon, lat] = destination(np, 5, bearing([end[1], end[0]], np), { units: "meters" }).geometry
    .coordinates;
  return { ...l, line: [...l.line, [lat!, lon!] as LatLon] };
}

const gate = (r: Parameters<typeof reportCard>[0], key: string) =>
  reportCard(r, "zach").gates.find((g) => g.key === key)!;

describe("the red-gate drive on Grayson 6273, drawn as an easement", () => {
  it("is measured on the lidar as the study measured it, and its end is an entrance", async () => {
    const { result } = await runFixture("grayson-mud-creek-6273", { lines: [redGate] });
    const [l] = result.lines;
    expect(l!.lengthFt).toBeCloseTo(872, -1);
    expect(l!.avgGradePct).toBeGreaterThan(19);
    expect(l!.avgGradePct).toBeLessThan(23);
    expect(l!.maxGradePct).toBeCloseTo(41, 0);
    expect(l!.outsideFt).toBeCloseTo(l!.lengthFt, 3); // all of it on the neighbour's land
    const d = result.driveway!;
    const e = d.entrances.findIndex((x) => x.source === "drawn");
    expect(d.entrances[e]).toMatchObject({ line: 0, ll: redGate.line[redGate.line.length - 1] });
    // From its end a route still crosses the neighbour's land to the boundary, beyond the drawn easement: it needs an
    // easement, so the scored route stays the one from Mud Creek Ln, on the parcel, and the gates don't ask.
    const fromEnd = d.routes.find((r) => r.entranceIndex === e)!;
    expect(fromEnd.lines).toEqual([0]);
    expect(fromEnd.needsEasement).toBe(true);
    expect(d.routes[0]!.entranceIndex).not.toBe(e);
    expect(gate(result, "access").status).toBe("pass");
    expect(gate(result, "easement").status).toBe("pass");
  });

  it("carried on to the boundary: the route starts at its end, on the parcel, and both gates ask for it to be verified", async () => {
    const { result } = await runFixture("grayson-mud-creek-6273", { lines: [toTheBoundary(redGate)] });
    const d = result.driveway!;
    const scored = d.overLimit ?? d.routes[0]!;
    expect(d.entrances[scored.entranceIndex]).toMatchObject({ source: "drawn", line: 0 });
    expect(scored.needsEasement).toBe(false);
    expect(scored.lines).toEqual([0]);
    // Shorter than the route from Mud Creek Ln (2,888 ft, 5 switchbacks, ~$166k mid).
    expect(scored.metrics.lengthFt).toBeLessThan(2500);
    expect(gate(result, "access")).toMatchObject({
      status: "warn",
      reason: "Frontage on Mud Creek Ln; easement (user-drawn): verify it's a legal right-of-way",
    });
    expect(gate(result, "easement")).toMatchObject({
      status: "warn",
      reason: "Easement (user-drawn): verify it's a legal right-of-way",
    });
    // The driveway section names it, after the frontage's entrances, and on the route (appended: rule 7).
    const v = drivewayView(result)!;
    expect(v.entrances).toMatch(
      /^Entrance candidates on the frontage \(E1 best\): .*\. E4 is the end of Easement \(user-drawn\) \(1,0\d\d ft · avg 2\d% · steepest 41% over 30 m\)\.$/,
    );
    const row = v.routes[0]!.rows.find((r) => r.label === "Drawn lines")!;
    expect(row.value).toMatch(
      /^from the end of Easement \(user-drawn\) \(1,0\d\d ft · .*\), not in this cost$/,
    );
  });
});
