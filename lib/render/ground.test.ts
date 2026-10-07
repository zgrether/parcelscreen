import { describe, expect, it } from "vitest";
import { SCREEN_CONSTANTS } from "@/lib/screen/config";
import { sunHours } from "@/lib/screen/sun";
import type { ScreenResult } from "@/lib/screen/types";
import { loadFixture, type FixtureSlug } from "@/test/support/fixtures";
import { fromPrototype } from "@/test/support/fromPrototype";
import {
  canopyVertices,
  dateLabel,
  dayHours,
  dayOfYear,
  ALT_GRID,
  altToY,
  yToAlt,
  lowScale,
  fmtSolar,
  groundDate,
  groundInputs,
  halfDay,
  halfWidthDeg,
  horizonOf,
  hourMarks,
  isClear,
  project,
  skylineAt,
  skylineVertices,
  sunAt,
  todayIn,
  turn,
} from "./ground";

const K = SCREEN_CONSTANTS.sun;
const GOLDENS: [FixtureSlug, string][] = [
  ["ferney-creek-52-47A", "run"],
  ["ferney-creek-52-47A", "setHouse"],
  ["ferney-creek-52-47A", "houseRun"],
  ["macks-mountain-35-3", "run"],
  ["macks-mountain-35-3", "evaluateSite2"],
];
const result = (slug: FixtureSlug, key: string) =>
  fromPrototype((loadFixture(slug).goldens as unknown as Record<string, never>)[key]!) as ScreenResult;

describe.each(GOLDENS)("the viewer's numbers on %s %s (plan §3)", (slug, key) => {
  const r = result(slug, key);
  const g = groundInputs(r)!;

  it("sunHours on the stored profile reproduces the report's Dec 21 and Jun 21 hours exactly", () => {
    const h = horizonOf(r.sun!.profile);
    const dec = sunHours(g.lat, h, K.decemberDoy, g.canopyDeg),
      jun = sunHours(g.lat, h, K.juneDoy, g.canopyDeg);
    expect([dec.directH, dec.daylightH]).toEqual([r.sun!.decDirectH, r.sun!.decDaylightH]);
    expect([jun.directH, jun.daylightH]).toEqual([r.sun!.junDirectH, r.sun!.junDaylightH]);
    // So the viewer shows the report's own for those days, and the same method for any other.
    expect(dayHours(r, 355)).toEqual({
      directH: r.sun!.decDirectH,
      daylightH: r.sun!.decDaylightH,
      stored: true,
    });
    expect(dayHours(r, 172)).toEqual({
      directH: r.sun!.junDirectH,
      daylightH: r.sun!.junDaylightH,
      stored: true,
    });
    const mar = sunHours(g.lat, h, 79, g.canopyDeg);
    expect(dayHours(r, 79)).toEqual({ directH: mar.directH, daylightH: mar.daylightH, stored: false });
  });

  it("each moment's clear/blocked, counted over the day, is the day's direct hours", () => {
    for (const doy of [K.decemberDoy, 79, K.juneDoy, 250]) {
      let clear = 0;
      for (let H = -180; H <= 180; H += K.hourAngleStepDeg)
        if (isClear(g.lat, doy, H, g.profile, g.canopyDeg)) clear++;
      expect(clear / 60, `doy ${doy}`).toBe(sunHours(g.lat, horizonOf(g.profile), doy, g.canopyDeg).directH);
    }
  });

  it("the skyline is exactly the stored profile's 72 points, and the canopy band the same points higher", () => {
    const v = skylineVertices(r.sun!.profile);
    expect(v).toHaveLength(72);
    expect(v.map((p) => [p.az, p.alt])).toEqual(r.sun!.profile);
    expect(canopyVertices(r.sun!.profile, 3).map((p) => p.alt)).toEqual(r.sun!.profile.map(([, a]) => a + 3));
  });

  it("hour marks are the whole solar hours the sun is up, blocked by the engine's rule", () => {
    const marks = hourMarks(g.lat, K.decemberDoy, g.profile, g.canopyDeg);
    // Dec 21 here: 8 am to 4 pm. The prototype tried 7 to 5 and skipped the hours outside daylight (L1773),
    // and its own rule gives the same hours.
    const proto = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17].filter(
      (hr) => Math.abs((hr - 12) * 15) <= halfDay(g.lat, 355),
    );
    expect(marks.map((m) => m.hour)).toEqual(proto);
    expect(marks.map((m) => m.label)).toEqual([
      "8 am",
      "9 am",
      "10 am",
      "11 am",
      "noon",
      "1 pm",
      "2 pm",
      "3 pm",
      "4 pm",
    ]);
    for (const m of marks) {
      expect(m.ridge).toBe(skylineAt(g.profile, m.sun.az) + g.canopyDeg);
      expect(m.blocked).toBe(!(m.sun.alt > m.ridge));
    }
  });
});

describe("the cylindrical panorama and its altitude scale (owner, after the 17a review)", () => {
  const v = { heading: 180, width: 800, height: 1000, kx: 10 };
  it("azimuth across, wrapping round; the heading at the centre", () => {
    expect(project(v, 180, -5)).toEqual({ x: 400, y: 1000 });
    expect(project(v, 190, 0).x).toBe(500);
    expect(project(v, 350, 0).x).toBe(400 + 170 * 10); // the short way round
    expect(halfWidthDeg(v)).toBe(40);
  });
  it("−5° to 30° is linear over the lower 70%; 30° to 90° shares the rest; the sun is always in frame", () => {
    expect(altToY(-5, 1000)).toBe(1000);
    expect(altToY(30, 1000)).toBeCloseTo(300, 9);
    expect(altToY(12.5, 1000)).toBeCloseTo(650, 9); // halfway through the linear part
    expect(altToY(60, 1000)).toBeCloseTo(150, 9);
    expect(altToY(90, 1000)).toBeCloseTo(0, 9);
    expect(altToY(95, 1000)).toBeCloseTo(0, 9);
    expect(lowScale(1000)).toBe(20);
    // The ground below the horizontal stays a small share of the view: 10% (the owner's limit is ~25%).
    expect((1000 - altToY(0, 1000)) / 1000).toBeCloseTo(0.1, 9);
    expect(ALT_GRID).toEqual([0, 10, 20, 30, 45, 60, 90]);
  });
  it("turns the short way", () => {
    expect(turn(350, 10)).toBe(20);
    expect(turn(10, 350)).toBe(-20);
  });
});

describe("dates", () => {
  it("days of year on the engine's calendar: Dec 21 is 355 and Jun 21 172, in any year", () => {
    expect(dayOfYear(12, 21)).toBe(K.decemberDoy);
    expect(dayOfYear(6, 21)).toBe(K.juneDoy);
    expect(dayOfYear(1, 1)).toBe(1);
    expect(dayOfYear(3, 20)).toBe(79);
    expect(dayOfYear(2, 29)).toBe(dayOfYear(3, 1));
    expect(groundDate("2028-12-21")).toEqual({ iso: "2028-12-21", doy: 355 });
    expect(groundDate("2026-02-30")).toBeNull();
    expect(groundDate("garbage")).toBeNull();
    expect(dateLabel("2026-03-20")).toBe("Mar 20");
    expect(dateLabel("2026-12-21", true)).toBe("December 21");
  });
  it("today is the time zone's", () => {
    const t = new Date("2026-10-08T02:30:00Z"); // still Oct 7 in New York
    expect(todayIn("America/New_York", t)).toBe("2026-10-07");
    expect(todayIn("Europe/Dublin", t)).toBe("2026-10-08");
  });
});

describe("the sun", () => {
  it("the solar clock reads as the prototype's", () => {
    expect(fmtSolar(0)).toBe("12:00 pm");
    expect(fmtSolar(-45)).toBe("9:00 am");
    expect(fmtSolar(22.5)).toBe("1:30 pm");
  });
  it("rises and sets at the day's limits", () => {
    const lat = 36.89,
      lim = halfDay(lat, 355);
    expect(Math.abs(sunAt(lat, 355, lim).alt)).toBeLessThan(0.01);
    expect(sunAt(lat, 355, 0).az).toBeCloseTo(180, 5);
  });
  it("a result with no sun has no viewer", () => {
    expect(groundInputs(null)).toBeNull();
    expect(groundInputs({ ...result("ferney-creek-52-47A", "run"), sun: null } as never)).toBeNull();
  });
});

describe("the altitude scale's inverse and the day's ticks", () => {
  it("yToAlt undoes altToY", () => {
    for (const a of [-5, 0, 12.3, 30, 44, 90]) expect(yToAlt(altToY(a, 600), 600)).toBeCloseTo(a, 9);
  });
});
