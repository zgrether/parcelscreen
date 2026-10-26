/**
 * Scoring an area (step 13 plan §4, §10): each area-scale row's letter is the card's own for the same numbers; the fit
 * letter is the parcel grade's arithmetic; Musts are a share of the points, one, two or none; an area where under 10%
 * passes isn't suggested; the ranking puts suggestable areas first.
 */
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { defaultRubric } from "../rubric/default";
import { MINE, type NamedRubric, type Rubric } from "../rubric/types";
import { reportCard } from "../report/card";
import { AREA_FACTORS, areaCard, areaLetter, fitLabel, rankAreas } from "./score";
import { AREA_FILE_VERSION, MEASURES, type AreaFile, type Measure } from "./types";

const nr = (rubric: Rubric = defaultRubric()): NamedRubric => ({ id: MINE, name: "Mine", rubric });

/** A synthetic area: the given per-point columns, every other measure at a middling value. */
function area(id: string, cols: Partial<Record<Measure, (number | null)[]>>, n = 10): AreaFile {
  const base: Record<Measure, number> = {
    elevFt: 2800,
    skyMag: 21.5,
    janLowF: 22,
    julHighF: 82,
    viewOpenPct: 10,
    erMin: 30,
    groceryMin: 20,
    airportMin: 90,
    trailheadMin: 15,
    openLandFt: 5000,
    longTrailMin: 40,
    paddleMin: 35,
  };
  const points = Object.fromEntries(
    MEASURES.map((m) => [m, cols[m] ?? Array.from({ length: n }, () => base[m])]),
  ) as Record<Measure, (number | null)[]>;
  const median = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x !== null).sort((a, b) => a - b);
    return v.length ? v[v.length >> 1]! : null;
  };
  return {
    version: AREA_FILE_VERSION,
    id,
    name: id,
    description: ["a", "b"],
    outline: { type: "Polygon", coordinates: [] },
    profiledAt: "2026-10-22",
    sources: {},
    candidates: n,
    thin: false,
    points: { ll: Array.from({ length: n }, (_, i): [number, number] => [36 + i / 100, -81]), ...points },
    medians: Object.fromEntries(MEASURES.map((m) => [m, median(points[m])])) as Record<
      Measure,
      number | null
    >,
  };
}

describe("a row's letter, the card's own", () => {
  it("Mud Creek's numbers give Mud Creek's card letters, row for row", () => {
    const r = expectedOf("grayson-mud-creek-6273", "run");
    const card = reportCard(r, nr());
    const m = (k: string) => card.rows.find((x) => x.key === k)?.measure?.value ?? null;
    const values = {
      elevFt: m("elevation"),
      skyMag: m("sky"),
      erMin: m("hospital"),
      groceryMin: m("town"),
      airportMin: m("airport"),
      longTrailMin: m("longTrail"),
      paddleMin: m("paddling"),
    };
    for (const [f, k] of [
      ["elevation", "elevation"],
      ["sky", "sky"],
      ["hospital", "hospital"],
      ["town", "town"],
      ["airport", "airport"],
      ["longTrail", "longTrail"],
      ["paddling", "paddling"],
    ] as const)
      if (card.rows.some((x) => x.key === k && x.measure))
        expect(areaLetter(f, values, defaultRubric()), f).toBe(card.rows.find((x) => x.key === k)!.grade);
  });

  it("Trails: adjoining open land is an A; open land near raises a slow trailhead to B", () => {
    const R = defaultRubric();
    expect(areaLetter("trails", { openLandFt: 0, trailheadMin: 90 }, R)).toBe("A");
    expect(areaLetter("trails", { openLandFt: 500, trailheadMin: 90 }, R)).toBe("B");
    expect(areaLetter("trails", { openLandFt: 50_000, trailheadMin: 90 }, R)).toBe("F");
    expect(areaLetter("trails", { openLandFt: null, trailheadMin: null }, R)).toBeNull();
  });

  it("Paddling (step 14d): the drive to a lake launch on paddleMin's bands, unmeasured when no table answered", () => {
    const R = defaultRubric();
    const at = (paddleMin: number | null) => areaLetter("paddling", { paddleMin }, R);
    expect([15, 30, 31, 60, 61].map(at)).toEqual(["A", "B", "C", "D", "F"]);
    expect(at(null)).toBeNull();
  });
});

describe("the fit letter", () => {
  it("every area-scale factor graded, and a letter", () => {
    const c = areaCard(area("x", {}), nr());
    expect(c.rows.map((x) => x.key)).toEqual(AREA_FACTORS.filter((f) => !defaultRubric().wonts.includes(f)));
    expect(c.grade).not.toBeNull();
  });
});

describe("Musts as a share", () => {
  const withMusts = (musts: Rubric["musts"]) => nr({ ...defaultRubric(), musts });

  it("one limit: the share of points meeting it", () => {
    const a = area("x", { elevFt: [2000, 2500, 3100, 3200, 3300, 3400, 2900, 2800, 3500, 3600] });
    const c = areaCard(a, withMusts([{ factor: "elevation", threshold: 3000 }]));
    expect(c.mustShare).toBeCloseTo(0.6);
    expect(c.suggestable).toBe(true);
  });

  it("two limits: the points meeting both", () => {
    const a = area("x", {
      elevFt: [3100, 3100, 3100, 3100, 3100, 2000, 2000, 2000, 2000, 2000],
      erMin: [20, 20, 40, 40, 40, 20, 20, 20, 20, 20],
    });
    const c = areaCard(
      a,
      withMusts([
        { factor: "elevation", threshold: 3000 },
        { factor: "hospital", threshold: 30 },
      ]),
    );
    expect(c.mustShare).toBeCloseTo(0.2);
  });

  it("no area-scale limits: everything passes; a parcel-scale Must is ignored", () => {
    const c = areaCard(area("x", {}), withMusts([{ factor: "floodplain" }]));
    expect(c.limits).toEqual([]);
    expect(c.mustShare).toBe(1);
  });

  it("under 10% passing: not suggested, and ranked after every suggestable area", () => {
    const low = area(
      "low",
      { elevFt: [3100, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000] },
      12,
    );
    const ok = area("ok", { elevFt: Array.from({ length: 10 }, () => 3200) });
    const R = withMusts([{ factor: "elevation", threshold: 3000 }]);
    const cards = [areaCard(low, R), areaCard(ok, R)];
    expect(cards[0]!.suggestable).toBe(false);
    expect(rankAreas(cards, new Map()).map((c) => c.id)).toEqual(["ok", "low"]);
  });

  it("a point without a reading isn't counted either way", () => {
    const a = area("x", { elevFt: [3100, null, null, null, null, null, null, null, null, 2000] });
    const c = areaCard(a, withMusts([{ factor: "elevation", threshold: 3000 }]));
    expect(c.sharePoints).toBe(2);
    expect(c.mustShare).toBeCloseTo(0.5);
  });
});

describe("the fit's sign (owner, #298 answers)", () => {
  const R = defaultRubric();
  it("thirds of each letter's band: B+ from 3.17, B− under 2.83; A's band runs to A's points; no sign on an F", () => {
    expect(R.gradeCutoffs).toEqual([3.5, 2.5, 1.5, 0.5]);
    expect(fitLabel(3.3, R)).toBe("B+");
    expect(fitLabel(3.0, R)).toBe("B");
    expect(fitLabel(2.6, R)).toBe("B−");
    expect(fitLabel(3.9, R)).toBe("A+");
    expect(fitLabel(3.6, R)).toBe("A−");
    expect(fitLabel(0.2, R)).toBe("F");
    expect(fitLabel(null, R)).toBeNull();
  });

  it("an area's card carries it; a parcel's grade is untouched", () => {
    const c = areaCard(area("x", {}), nr());
    expect(c.fit!.startsWith(c.grade!)).toBe(true);
  });
});
