/**
 * Follow-up 34 on a real line (owner, 2026-10-12): the drive behind the red gate on Mud Creek Rd beside Grayson 6273,
 * drawn as an easement ("listing's 'road right of way into property', unverified"). Its trace is the driveway
 * validation study's road C (docs/studies/driveway-validation.md: 872 ft, about 20% on average and 41% at its steepest
 * over 30 m on the 3 m lidar), from the gate to the neighbour's pad, 132 ft short of 6273's boundary.
 *
 * A route from its end prices it as an existing drive to upgrade, and reads its raw grade like any section of the
 * route (owner, #116): at 41% it takes the whole over-limit term, so the route from Mud Creek Ln is scored, as drawn
 * and carried on to the boundary alike. The route from it stays listed, with the warning.
 */
import { bearing, destination, nearestPointOnLine, polygon, polygonToLine } from "@turf/turf";
import type { Feature, LineString } from "geojson";
import { describe, expect, it } from "vitest";
import input from "../../test/fixtures/grayson-mud-creek-6273/input.json";
import { runFixture } from "../../test/support/scenarios";
import roads from "../../test/tools/driveway-validation.roads.json";
import { reportCard } from "../report/card";
import { drivewayView } from "../report/driveway";
import { siteDriveways } from "./driveway";
import { routeContext } from "./index";
import { chooseDriveway, drivewayPoints, overLimitPoints } from "./score";
import type { DrawnInput, ScreenResult } from "./types";
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

const gate = (r: ScreenResult, key: string) => reportCard(r, "zach").gates.find((g) => g.key === key)!;
const STEEP =
  /^The existing drive is steeper than your limit \(2\d% avg, 41% steepest over 30 m on raw ground; a built road grades out 1–4 points\)$/;

/** Site #1's candidates on a run with the line drawn, and the one it's scored on. */
async function screened(line: DrawnInput) {
  const out = await runFixture("grayson-mud-creek-6273", { lines: [line] });
  const s = out.session;
  const [routes] = siteDriveways(routeContext(s), s.roads ?? [], s.parcel, [out.result.sites![0]!.ll], 15);
  return { ...out, routes: routes!, chosen: chooseDriveway(routes!, 25) };
}

describe("the red-gate drive on Grayson 6273, drawn as an easement", () => {
  it("as drawn: measured as the study measured it; the route from its end needs an easement and loses on points", async () => {
    const { result, routes, chosen } = await screened(redGate);
    const [l] = result.lines;
    expect(l!.lengthFt).toBeCloseTo(872, -1);
    expect(l!.avgGradePct).toBeGreaterThan(19);
    expect(l!.avgGradePct).toBeLessThan(23);
    expect(l!.maxGradePct).toBeCloseTo(41, 0);
    expect(l!.outsideFt).toBeCloseTo(l!.lengthFt, 3); // all of it on the neighbour's land
    const d = result.driveway!;
    const e = d.entrances.findIndex((x) => x.source === "drawn");
    expect(d.entrances[e]).toMatchObject({ line: 0, ll: redGate.line[redGate.line.length - 1] });

    // The route from its end: the drive priced as an upgrade, in its cost; graded on its raw ground (41%: the whole
    // over-limit term); 266 ft more of neighbouring land to the boundary, beyond the easement: an easement need.
    const drawn = routes.drawn!;
    expect(drawn.entranceIndex).toBe(e);
    const x = drawn.route!.existing!;
    expect(x).toMatchObject({ line: 0, limitPct: 15, vetoPct: 25, outsideFt: 0 });
    expect(x.lengthFt).toBeCloseTo(l!.lengthFt, 6);
    expect(x.maxGradePct).toBeCloseTo(l!.maxGradePct!, 6);
    expect(x.pavedFt).toBeGreaterThan(600);
    expect(x.cost.mid).toBeGreaterThan(15_000);
    expect(drawn.route!.needsEasement).toBe(true);
    expect(overLimitPoints(drawn)).toBe(20);
    // Mud Creek Ln's route, on the parcel and within the limit, has fewer points: it's the one scored.
    expect(chosen.entranceIndex).not.toBe(e);
    expect(drivewayPoints(chosen)).toBeLessThan(drivewayPoints(drawn));
    expect(d.routes[0]!.entranceIndex).toBe(chosen.entranceIndex);
    expect(gate(result, "access").status).toBe("pass");
    expect(gate(result, "easement").status).toBe("pass");
    expect(result.flags.some((f) => /existing drive/.test(f.t))).toBe(false); // the scored route doesn't use it

    // The driveway section: the entrance, and the route from it with its upgrade and the warning (appended).
    const v = drivewayView(result)!;
    expect(v.entrances).toMatch(
      /^Entrance candidates on the frontage \(E1 best\): .*\. E4 is the end of Easement \(user-drawn\) \(872 ft · avg 2\d% · steepest 41% over 30 m\)\.$/,
    );
    const fromE4 = v.routes.find((rv) => rv.from === "from E4")!;
    const upgrade = fromE4.rows.find((row) => row.label === "Upgrade existing drive: 872 ft")!;
    expect(upgrade.value).toMatch(
      /^\d+ tons of stone resurfacing, \d+ relief culverts, ~\d+ ft over 12% to pave \(cost TBD\) · \$\d+–\d+k\. $/,
    );
    expect(upgrade.strong).toMatch(STEEP);
    // No entrance of its own: the drive's is shared (owner, #116).
    expect(fromE4.rows.find((row) => row.label === "Entrance")!.value).toBe(
      "Shared entrance: confirm the neighbour's and the state's permission.",
    );
    expect(fromE4.rows.find((row) => row.label === "Leaves the boundary")!.strong).toBe(
      "266 ft outside the line — needs an easement",
    );
  });

  it("carried on to the boundary: no easement need, but the 41% drive still loses on points", async () => {
    const { result, routes, chosen } = await screened(toTheBoundary(redGate));
    const drawn = routes.drawn!;
    expect(drawn.route!.needsEasement).toBe(false);
    expect(drawn.route!.lines).toEqual([0]);
    expect(drawn.route!.metrics.lengthFt).toBeLessThan(2500); // shorter than Mud Creek Ln's 2,888 ft
    expect(overLimitPoints(drawn)).toBe(20);
    expect(chosen.entranceIndex).not.toBe(drawn.entranceIndex);
    expect(drivewayPoints(chosen)).toBeLessThan(drivewayPoints(drawn));

    // Were it scored: both gates ask for it to be verified, appended to what they say, and the Easement gate warns of
    // the 41% drive, as for any route (owner, #116; Access stays about legal access).
    const d = result.driveway!;
    const asScored = d.routes.find((r) => r.entranceIndex === drawn.entranceIndex)!;
    const r: ScreenResult = { ...result, driveway: { ...d, routes: [asScored] } };
    expect(gate(r, "access")).toMatchObject({
      status: "warn",
      reason: "Frontage on Mud Creek Ln; easement (user-drawn): verify it's a legal right-of-way",
    });
    expect(gate(r, "easement")).toMatchObject({
      status: "warn",
      reason:
        "Easement (user-drawn): verify it's a legal right-of-way; the existing drive is steeper than your limit (21% avg, 41% steepest over 30 m on raw ground; a built road grades out 1–4 points)",
    });
  });
});
