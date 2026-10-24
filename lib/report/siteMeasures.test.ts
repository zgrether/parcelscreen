/** A homesite's measurements line, and the household's chosen driveway in it (the UX audit's B-6). */
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import type { ScreenResult } from "../screen/types";
import { siteMeasures, yourDrive } from "./siteMeasures";

/** Grayson's run with a drawn track (972 ft) and a route from it: 33% over 30 m, the drawn drive's own 49% steepest. */
function withTrack(): ScreenResult {
  const r = structuredClone(expectedOf("grayson-mud-creek-6273", "run"));
  const d = r.driveway!;
  r.lines = [
    {
      id: "track-1",
      kind: "track",
      lengthFt: 972,
      widthFt: null,
      outsideFt: 0,
      gradedFt: 972,
      avgGradePct: 33,
      maxGradePct: 49,
    },
  ];
  d.entrances.push({ ...d.entrances[0]!, source: "drawn", line: 0, roadClass: null });
  const scored = d.routes[0]!;
  d.routes.push({
    ...scored,
    entranceIndex: d.entrances.length - 1,
    lines: [0],
    needsEasement: false,
    maxGrade: 33,
    metrics: { ...scored.metrics, lengthFt: 972 },
    existing: {
      line: 0,
      lengthFt: 972,
      maxGradePct: 49,
      avgGradePct: 33,
      limitPct: 15,
      vetoPct: 25,
      pavedFt: 0,
      reliefCulverts: 0,
      stoneTons: 0,
    },
  } as typeof scored);
  return r;
}

describe("the homesite's line and the chosen driveway (B-6)", () => {
  it("quotes the route from the line the household chose, at its steepest", () => {
    const r = withTrack();
    const yours = yourDrive(r, "track-1");
    expect(yours).toEqual({ lengthFt: 972, gradePct: 49, needsEasement: false });
    expect(siteMeasures(r, 0, undefined, yours)).toMatch(/ · 972 ft drive at 49%$/);
  });

  it("quotes the app's own route with no line chosen, or one this screen has no route from", () => {
    const r = withTrack();
    expect(yourDrive(r, null)).toBeNull();
    expect(yourDrive(r, "gone")).toBeNull();
    expect(siteMeasures(r, 0, undefined, null)).toBe(siteMeasures(r, 0));
    expect(siteMeasures(r, 0)).not.toMatch(/972 ft/);
  });
});
