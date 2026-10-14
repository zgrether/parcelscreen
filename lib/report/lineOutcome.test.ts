/** What a run made of each drawn line (owner, A, 2026-10-13), as the Easement panel says it. */
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import type { ScreenResult } from "../screen/types";
import { lineOutcome } from "./lines";

type Route = NonNullable<ScreenResult["driveway"]>["routes"][number];

/** Grayson's run with one drawn track (868 ft): its entrance, and a route from it, when `mine` is given. */
function withLine(mine?: (scored: Route) => Partial<Route>): ScreenResult {
  const r = structuredClone(expectedOf("grayson-mud-creek-6273", "run"));
  const d = r.driveway!;
  r.lines = [
    {
      id: "red-gate",
      kind: "track",
      lengthFt: 868,
      widthFt: null,
      outsideFt: 0,
      gradedFt: 868,
      avgGradePct: 18,
      maxGradePct: 41,
    },
  ];
  if (mine) {
    d.entrances.push({ ...d.entrances[0]!, source: "drawn", line: 0, roadClass: null });
    const scored = d.routes[0]!;
    d.routes.push({ ...scored, entranceIndex: d.entrances.length - 1, lines: [0], ...mine(scored) });
  }
  return r;
}

describe("what the run made of a drawn line", () => {
  it("used: the scored route starts from it, or runs along it", () => {
    const r = withLine((s) => ({ cost: s.cost }));
    // Make the line's route the scored one (first).
    const d = r.driveway!;
    d.routes.unshift(d.routes.pop()!);
    expect(lineOutcome(r, 0, "existing drive")).toBe(
      "Your line (existing drive, 868 ft) was used: the driveway starts from its far end, and follows it to the road.",
    );
    const along = withLine();
    along.driveway!.routes[0] = { ...along.driveway!.routes[0]!, lines: [0] };
    expect(lineOutcome(along, 0, "track")).toBe(
      "Your line (track, 868 ft) was used: the driveway runs along it.",
    );
  });

  it("considered but not used: steeper than the veto on the raw ground, and costlier, both said", () => {
    const r = withLine((s) => ({
      cost: { ...s.cost, mid: s.cost.mid + 12_430 },
      metrics: { ...s.metrics, lengthFt: s.metrics.lengthFt + 400 },
      existing: {
        line: 0,
        lengthFt: 868,
        maxGradePct: 41.2,
        avgGradePct: 18,
        limitPct: 15,
        vetoPct: 25,
        pavedFt: 0,
        reliefCulverts: 2,
        stoneTons: 90,
        outsideFt: 0,
        cost: { low: 9000, mid: 11000, high: 14000 },
      },
    }));
    expect(lineOutcome(r, 0, "track")).toBe(
      "Your line (track, 868 ft) was considered but not used: 41% on the raw ground is over the 25% veto; longer and costlier than the app's pick by $12,400.",
    );
  });

  it("considered but not used: only costlier; or neither, the app's pick scores better", () => {
    expect(
      lineOutcome(
        withLine((s) => ({ cost: { ...s.cost, mid: s.cost.mid + 3_000 } })),
        0,
        "track",
      ),
    ).toBe("Your line (track, 868 ft) was considered but not used: costlier than the app's pick by $3,000.");
    expect(
      lineOutcome(
        withLine((s) => ({ cost: s.cost })),
        0,
        "track",
      ),
    ).toBe(
      "Your line (track, 868 ft) was considered but not used: the app's pick scores better on its grade and cost.",
    );
  });

  it("not near a road, and not followed: why the driveway didn't start from it", () => {
    expect(lineOutcome(withLine(), 0, "easement")).toBe(
      "Your line (easement, 868 ft) was considered but not used: neither end comes within 98 ft of a road, so the driveway can't start from it, and the app's route doesn't follow it.",
    );
  });

  it("drawn after the screen: nothing to say yet", () => {
    expect(lineOutcome(withLine(), 1, "track")).toBeNull();
  });
});
