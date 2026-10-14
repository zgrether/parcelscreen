/**
 * The parcel report card (value-ranking.md §3.2; VR2): the three fixtures' cards, the gates' and rows' rules on
 * edited copies of Ferney Creek, config-driven cutoffs, and each person's weights.
 */
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { SCREEN_CONSTANTS } from "../screen/config";
import { TRAILHEAD_DRIVES } from "../screen/driveList";
import { NO_PRACTICAL_ROUTE } from "../screen/score";
import type { RoadClass, ScreenResult } from "../screen/types";
import {
  articleFor,
  atLeast,
  atMost,
  cardFacts,
  cardFor,
  footprintFt2,
  markedPrivateOutside,
  MARKED_PRIVATE,
  reportCard,
  roadInWords,
  type CardConfig,
} from "./card";

const K = SCREEN_CONSTANTS.card;
/**
 * Ferney, for the tests of the other gates and rows: its entrance road (a private driveway, 640 ft of it off the
 * parcel, owner #126) taken as its own drive, so the Access gate passes as it did before follow-up 55. The fixture's
 * own test and the private-road test read the real result.
 */
const ferney = () => {
  const r = structuredClone(expectedOf("ferney-creek-52-47A", "run"));
  const d = r.driveway!;
  const e = d.entrances[d.routes[0]!.entranceIndex]!;
  e.roadClass = { ...e.roadClass!, osm: { ...e.roadClass!.osm!, outsideFt: 0 } };
  for (const rt of d.routes) rt.metrics.privateFt = 0;
  return r;
};
const gates = (r: ScreenResult) => Object.fromEntries(cardFacts(r).gates.map((g) => [g.key, g.status]));
const grades = (r: ScreenResult) => Object.fromEntries(cardFacts(r).rows.map((x) => [x.key, x.grade]));
const gateOf = (r: ScreenResult, key: string) => cardFacts(r).gates.find((g) => g.key === key)!;
const rowOf = (r: ScreenResult, key: string) => cardFacts(r).rows.find((x) => x.key === key)!;
const SEPTIC_WARN = "no soil on the parcel rates better than very limited for a septic field";

describe("the report card on the fixtures (engine 13)", () => {
  it("Ferney Creek 52-47A: the road in is marked private; a Contender for both", () => {
    const r = expectedOf("ferney-creek-52-47A", "run");
    // Follow-up 55 (owner, #126): its entrance road is a private driveway, most of it off the parcel.
    expect(gates(r)).toEqual({ floodplain: "pass", access: "warn", easement: "pass", septic: "pass" });
    expect(grades(r)).toEqual({
      elevation: "B",
      homesite: "A",
      sky: "B",
      room: "A",
      trails: "D", // follow-up 54: 47 min by road to Buffalo Mountain's parking (it read C, 6.5 mi straight)
      town: "D",
      garden: "A",
    });
    const zach = reportCard(r, "zach");
    expect(zach.points).toBeCloseTo(3.2, 9);
    expect([zach.grade, zach.verdict]).toEqual(["B", "Contender"]);
    // One warn: the first thing to check (it read: the weakest part, trails and public land).
    expect(zach.reason).toBe(`Contender. Check first: frontage on an unnamed road; ${MARKED_PRIVATE}.`);
    expect(zach.incomplete).toEqual([]);
    expect(rowOf(r, "town").detail).toBe("a 47-minute drive to an ER, 15 to a grocery"); // from the entrance
    expect(reportCard(r, "julie").points).toBeCloseTo(2.75, 9);
    expect(rowOf(r, "garden").detail).toBe("a 2.48 ac garden on prime farmland");
    expect(rowOf(r, "room").detail).toBe(
      "4.3 ac of gentle ground near the house site, 9.4× the build footprint",
    );
    expect(rowOf(r, "sky").detail).toBe("rural sky (zone 3b)");
    expect(rowOf(r, "trails").detail).toBe(
      "a trailhead 47 min (11.5 mi) by road, 6.4 mi straight (Buffalo Mountain Trailhead)",
    );
  });

  it("Macks Mountain 35-3: the septic warn, the road in a track, the closer grocery", () => {
    const r = expectedOf("macks-mountain-35-3", "run");
    // Follow-up 55: its entrance road is an unnamed local road to the Census (S1400), a track to OpenStreetMap.
    expect(gates(r)).toEqual({ floodplain: "pass", access: "warn", easement: "pass", septic: "warn" });
    expect(gateOf(r, "access").reason).toBe(
      "Frontage on an unnamed road; the road in is a track (OpenStreetMap); check that it's public and drivable year-round",
    );
    expect(grades(r)).toEqual({
      elevation: "A",
      homesite: "A",
      sky: "B",
      room: "B", // VR3b: site #1's gentle ground near the house, 2.8× (it read 20.9 ac parcel-wide)
      // Follow-up 54: from the entrance, whose road OSRM drives as a track at about 6 mph (followup-54 plan §4).
      trails: "F",
      town: "F",
      garden: "B",
    });
    // The nearer grocery is the closer one, 76 min, but over every cutoff.
    // "an" (owner, #124: an approved correction), and the track note appended, as on Trails.
    expect(rowOf(r, "town").detail).toBe(
      "an 82-minute drive to an ER, 76 to a grocery (the first 2.6 mi on unnamed tracks)",
    );
    expect(rowOf(r, "trails").detail).toBe(
      "a trailhead 92 min (17.4 mi) by road (the first 2.6 mi on unnamed tracks), 10.4 mi straight (Heritage Park)",
    );
    const zach = reportCard(r, "zach"),
      julie = reportCard(r, "julie");
    expect(zach.points).toBeCloseTo(3.05, 9);
    // Two warns (the road in, the septic) are a Maybe.
    expect([zach.grade, zach.verdict]).toEqual(["B", "Maybe"]);
    expect(julie.points).toBeCloseTo(2.2, 9);
    expect([julie.grade, julie.verdict]).toEqual(["C", "Maybe"]);
    expect(zach.reason).toBe(
      "Maybe. Check first: frontage on an unnamed road; the road in is a track (OpenStreetMap); check that it's public and drivable year-round.",
    );
  });

  it("the road in (follow-up 55): a 4WD trail or private road to the Census, a track to OpenStreetMap", () => {
    const words = (mtfcc: string | null, osm: Partial<NonNullable<RoadClass["osm"]>> | null = null) =>
      roadInWords({
        mtfcc,
        osm: osm
          ? { highway: "unclassified", tracktype: null, access: null, service: null, outsideFt: 0, ...osm }
          : null,
      });
    expect(words("S1500")).toBe("the road in is a 4WD trail (Census)");
    expect(words("S1740")).toBe("the road in is a private road (Census)");
    expect(words("S1400", { highway: "track" })).toBe("the road in is a track (OpenStreetMap)");
    expect(words("S1400", { tracktype: "grade4" })).toBe("the road in is a track (OpenStreetMap)");
    expect(words("S1740", { highway: "track" })).toBe(
      "the road in is a private track (Census and OpenStreetMap)",
    );
    expect(words("S1500", { highway: "track" })).toBe(
      "the road in is a 4WD trail (Census and OpenStreetMap)",
    );
    // An ordinary road says nothing here; OSM's access=private is markedPrivateOutside's (owner, #126).
    expect(words("S1400")).toBeNull();
    expect(words("S1400", { highway: "service", service: "driveway", access: "private" })).toBeNull();
    expect(roadInWords(null)).toBeNull();
    const m = expectedOf("macks-mountain-35-3", "run");
    expect(gateOf(m, "access").reason).toMatch(
      /; the road in is a track \(OpenStreetMap\); check that it's public/,
    );
  });

  it("a road marked private outside the parcel asks for a recorded right; one inside is its own drive (owner, #126)", () => {
    // Ferney: its entrance road is OSM's way 19995821, a private driveway from State Rte 750, 640 ft of it outside the
    // parcel; the scored route runs 49 ft along it before the boundary.
    const f = expectedOf("ferney-creek-52-47A", "run");
    const at = f.driveway!.routes[0]!.entranceIndex;
    expect(f.driveway!.entrances[at]!.roadClass).toEqual({
      mtfcc: "S1400",
      osm: {
        highway: "service",
        tracktype: null,
        access: "private",
        service: "driveway",
        outsideFt: expect.closeTo(640, 0),
      },
    });
    expect(f.driveway!.routes[0]!.metrics.privateFt).toBeCloseTo(49, 0);
    expect(gateOf(f, "access")).toMatchObject({
      status: "warn",
      reason: `Frontage on an unnamed road; ${MARKED_PRIVATE}`,
    });
    expect(MARKED_PRIVATE).toBe(
      "the road in is marked private (OpenStreetMap); if it isn't this parcel's own drive, you need a recorded right to use it",
    );
    // One warn: still a Contender, and the warn is the first thing to check.
    expect(reportCard(f, "zach")).toMatchObject({ verdict: "Contender", grade: "B" });
    expect(reportCard(f, "zach").reason).toBe(
      `Contender. Check first: frontage on an unnamed road; ${MARKED_PRIVATE}.`,
    );

    // The same parcel with the private drive inside it (all of it on its own land, the route never off it): its own
    // drive, no warn.
    const own = structuredClone(f);
    const e = own.driveway!.entrances[at]!;
    e.roadClass = { ...e.roadClass!, osm: { ...e.roadClass!.osm!, outsideFt: 0 } };
    own.driveway!.routes[0]!.metrics.privateFt = 0;
    expect(gateOf(own, "access")).toMatchObject({ status: "pass", reason: "Frontage on an unnamed road" });

    // Either one alone is enough: the entrance road outside, or the route along a private way before the boundary.
    expect(markedPrivateOutside({ ...e.roadClass!, osm: { ...e.roadClass!.osm!, outsideFt: 60 } }, 0)).toBe(
      true,
    );
    expect(markedPrivateOutside(e.roadClass, 60)).toBe(true);
    // Under osmRoads.privateOutsideMinM (15 m, 49 ft): geometry's slop, not a road across someone's land.
    expect(markedPrivateOutside({ ...e.roadClass!, osm: { ...e.roadClass!.osm!, outsideFt: 40 } }, 40)).toBe(
      false,
    );
    // access=no counts; an untagged way doesn't.
    const tag = (access: string | null) => ({
      ...e.roadClass!,
      osm: { ...e.roadClass!.osm!, access, outsideFt: 600 },
    });
    expect(markedPrivateOutside(tag("no"), 0)).toBe(true);
    expect(markedPrivateOutside(tag(null), 0)).toBe(false);
  });

  it("Grayson Mud Creek 6273: the flood zone is away from the build site, so one warn: a Contender", () => {
    const r = expectedOf("grayson-mud-creek-6273", "run");
    expect(gates(r)).toEqual({ floodplain: "pass", access: "pass", easement: "pass", septic: "warn" });
    expect(gateOf(r, "floodplain").reason).toBe(
      "A FEMA flood zone covers 0.5 ac of the parcel, away from the build site and driveway",
    );
    expect(grades(r)).toEqual({
      elevation: "A",
      homesite: "A",
      sky: "A",
      room: "B",
      trails: "B",
      town: "C",
      garden: "C",
    });
    const zach = reportCard(r, "zach");
    expect(zach.points).toBeCloseTo(3.45, 9);
    expect([zach.grade, zach.verdict]).toEqual(["B", "Contender"]);
    expect(zach.reason).toBe(`Contender. Check first: ${SEPTIC_WARN}.`);
    expect(reportCard(r, "julie").verdict).toBe("Contender");
    expect(rowOf(r, "room").detail).toBe(
      "1.0 ac of gentle ground near the house site, 2.1× the build footprint",
    );
    expect(rowOf(r, "sky").detail).toBe("rural dark sky (zone 3a)");
  });
});

describe("the gates", () => {
  it("the build site in a flood zone fails, and the verdict says so (§3.2's example)", () => {
    const r = ferney();
    r.flood = { zones: ["AE"], sfha: true, sfhaAcres: 3, mapped: true };
    r.sites![0]!.flood = true;
    const c = reportCard(r, "zach");
    expect(c.verdict).toBe("Pass");
    expect(c.reason).toBe("Pass: the build site is in a FEMA flood zone.");
  });

  it("a placed house is the build site: its flood zone and its elevation (owner, #109 review)", () => {
    const r = structuredClone(expectedOf("ferney-creek-52-47A", "setHouse"));
    expect(rowOf(r, "elevation")).toMatchObject({ grade: "B", detail: "2,654 ft at the marked house" });
    const h = r.house as Extract<NonNullable<ScreenResult["house"]>, { inSFHA: boolean }>;
    r.flood = { zones: ["AE"], sfha: true, sfhaAcres: 1, mapped: true };
    expect(gateOf(r, "floodplain").status).toBe("pass"); // site #1 isn't the build site now
    h.inSFHA = true;
    expect(gateOf(r, "floodplain").status).toBe("fail");
  });

  it("an unmapped area is unknown with its note, and isn't a warn", () => {
    const r = ferney();
    r.flood = { zones: [], sfha: false, sfhaAcres: 0, mapped: false };
    expect(gateOf(r, "floodplain")).toEqual({
      key: "floodplain",
      label: "Floodplain",
      status: "unknown",
      reason: "FEMA has no flood mapping here",
    });
    r.soils = r.soils!.map((x) => ({ ...x, septic: "Very limited" }));
    const c = reportCard(r, "zach");
    expect(c.verdict).toBe("Contender"); // the septic warn is its only warn
    expect(c.incomplete).toEqual([]);
  });

  it("data that didn't load: not a warn; the verdict is at most a Maybe and says what to re-run", () => {
    const r = ferney();
    delete r.flood;
    delete r.sky;
    expect(gateOf(r, "floodplain")).toMatchObject({ status: "unknown", missing: "the FEMA flood map" });
    expect(rowOf(r, "sky")).toMatchObject({ grade: null, detail: "the sky atlas didn't load" });
    const c = reportCard(r, "zach");
    expect(c.incomplete).toEqual(["the FEMA flood map", "the sky atlas"]);
    expect(c.verdict).toBe("Maybe");
    expect(c.reason).toBe(
      "Maybe. Weakest part: trails and public land (D, a trailhead 47 min (11.5 mi) by road, 6.4 mi straight (Buffalo Mountain Trailhead)) (incomplete: the FEMA flood map and the sky atlas didn't load, run again).",
    );
    // A Pass stays a Pass.
    r.sites![0]!.flood = true;
    r.flood = { zones: ["AE"], sfha: true, sfhaAcres: 3, mapped: true };
    expect(reportCard(r, "zach").reason).toBe(
      "Pass: the build site is in a FEMA flood zone (incomplete: the sky atlas didn't load, run again).",
    );
  });

  it("a flood zone touching the build site's ground or the driveway warns (owner, #109 review; v4)", () => {
    const r = ferney();
    r.flood = { zones: ["AE"], sfha: true, sfhaAcres: 2, mapped: true };
    expect(gateOf(r, "floodplain")).toMatchObject({
      status: "pass",
      reason: "A FEMA flood zone covers 2.0 ac of the parcel, away from the build site and driveway",
    });
    r.sites![0] = { ...r.sites![0]!, sfhaOnSite: true };
    expect(gateOf(r, "floodplain")).toMatchObject({
      status: "warn",
      reason: "A FEMA flood zone touches the build site's ground",
    });
    r.driveway!.routes[0] = {
      ...r.driveway!.routes[0]!,
      metrics: { ...r.driveway!.routes[0]!.metrics, sfhaFt: 212.4 },
    };
    expect(gateOf(r, "floodplain").reason).toBe(
      "A FEMA flood zone touches the build site's ground; the driveway runs 212 ft through a FEMA flood zone",
    );
    r.sites![0] = { ...r.sites![0]!, sfhaOnSite: false };
    expect(gateOf(r, "floodplain").reason).toBe("The driveway runs 212 ft through a FEMA flood zone");
  });

  it("an OpenStreetMap entrance is possible frontage, a warn, with the TIGER road it reaches (owner, after #110)", () => {
    const r = ferney();
    r.driveway!.entrances = r.driveway!.entrances.map((e) => ({
      ...e,
      name: "unmapped track",
      source: "osm" as const,
      reaches: { road: "Willet Miller Rd", ft: 1121.3 },
    }));
    expect(gateOf(r, "access")).toMatchObject({
      status: "warn",
      reason:
        "Possible frontage on an unmapped track (verify it's a legal road or easement); it reaches Willet Miller Rd after 1,121 ft",
    });
    r.driveway!.entrances = r.driveway!.entrances.map((e) => ({
      ...e,
      name: "Henry Woodring Road",
      reaches: null,
    }));
    expect(gateOf(r, "access").reason).toBe(
      "Possible frontage on Henry Woodring Road, a road TIGER doesn't show (verify it's a legal road or easement)",
    );
  });

  it("Room to build: an F, and the first thing to check, when the build fits on no homesite (v4)", () => {
    const r = ferney();
    r.sites = r.sites!.map((x) => ({ ...x, fit: "house only" as const }));
    expect(rowOf(r, "room")).toMatchObject({
      grade: "F",
      detail: "site #1 fits the house only",
      checkFirst: "your build doesn't fit on any homesite",
    });
  });

  it("no frontage: routed from the nearest road point, a warn", () => {
    const r = ferney();
    r.driveway!.entrances = r.driveway!.entrances.map((e) => ({ ...e, fallback: true, gapFt: 212.4 }));
    expect(gateOf(r, "access")).toMatchObject({
      status: "warn",
      reason:
        "No road frontage found within 130 ft; routed from the nearest road point, 212 ft off the line (the deed or plat must show access)",
    });
  });

  it("no road within 400 m: access fails, and so does the driveway", () => {
    const r = ferney();
    r.driveway = { ...r.driveway!, entrances: [], routes: [] };
    expect(gates(r)).toMatchObject({ access: "fail", easement: "fail" });
    expect(reportCard(r, "julie").reason).toBe(
      "Pass: no road within 0.25 mi of the boundary (landlocked, or TIGER is wrong).",
    );
  });

  it("no practical route fails; the steep landing is the reason only when no route avoids it", () => {
    const r = ferney();
    const landing = { ll: [36.6, -81.5] as [number, number], atFt: 1234, sideSlopeDeg: 38.6 };
    r.driveway!.note = `${NO_PRACTICAL_ROUTE}: every driveway route is steeper than 25% over 30 m; the least steep (31% over 30 m) is shown.`;
    r.driveway!.steepLanding = { ...landing, avoided: true };
    expect(gateOf(r, "easement")).toMatchObject({ status: "fail", reason: NO_PRACTICAL_ROUTE });
    r.driveway!.steepLanding = { ...landing, avoided: false };
    expect(gateOf(r, "easement").reason).toBe(
      `${NO_PRACTICAL_ROUTE}: a switchback near 1,230 ft would sit on a 39° side slope — too steep without retaining walls; no route avoids it`,
    );
  });

  it("an easement, and no practical drive within the budget, warn together; two warns are a Maybe", () => {
    const r = ferney();
    r.driveway!.routes[0] = { ...r.driveway!.routes[0]!, needsEasement: true };
    expect(gateOf(r, "easement")).toMatchObject({
      status: "warn",
      reason: "The driveway needs an easement across neighbouring land",
    });
    const cost = { low: 1, mid: 2, high: 3 };
    r.driveway!.practical = {
      limitPct: 15,
      steeperPct: 15,
      readyToBuild: 300_000,
      share: 0.5,
      cost,
      steeper: null,
      easement: null,
      scoredOn: null,
    };
    expect(gateOf(r, "easement").reason).toBe(
      "The driveway needs an easement across neighbouring land; the drive needs a steeper paved alignment or an easement",
    );
    r.soils = r.soils!.map((x) => ({ ...x, septic: "Very limited" }));
    expect(reportCard(r, "zach").reason).toBe(
      "Maybe. Check first: the driveway needs an easement across neighbouring land; the drive needs a steeper paved alignment or an easement.",
    );
  });

  it("septic: unknown when the soils didn't load; never a fail", () => {
    const r = ferney();
    delete r.soils;
    expect(gateOf(r, "septic")).toMatchObject({ status: "unknown", missing: "the NRCS soils" });
  });
});

describe("the rows", () => {
  it("cutoffs are lower edges for more-is-better, upper edges for less-is-better", () => {
    expect(atLeast(3000, K.rows.elevationFt)).toBe("A");
    expect(atLeast(2999.9, K.rows.elevationFt)).toBe("B");
    expect(atLeast(1499, K.rows.elevationFt)).toBe("F");
    expect(atMost(20, K.rows.erMin)).toBe("A");
    expect(atMost(20.1, K.rows.erMin)).toBe("B");
    expect(atMost(61, K.rows.erMin)).toBe("F");
  });

  it("garden: an A needs prime or statewide-important soil; otherwise by the largest garden", () => {
    const r = ferney();
    r.gardens = r.gardens!.filter(
      (g) => g.soilNote !== "prime farmland" && g.soilNote !== "farmland of statewide importance",
    );
    expect(rowOf(r, "garden")).toMatchObject({ grade: "B", detail: "the largest garden is 3.10 ac" });
    r.gardens = [{ ...r.gardens[0]!, acres: 0.05 }];
    expect(rowOf(r, "garden").grade).toBe("D");
    r.gardens = [];
    expect(rowOf(r, "garden")).toMatchObject({ grade: "F", detail: "no garden ground found" });
  });

  it("town: the worse of the ER and the grocery", () => {
    const r = ferney();
    r.drives = r.drives!.map((d) => (d.label === "Nearest hospital" ? { ...d, min: 15 } : d));
    expect(rowOf(r, "town").grade).toBe("B"); // ER 15 (A), grocery 16 (B)
    r.closerGrocery = { label: "Closer grocery", name: "Corner store", min: 8, mi: 4, er: null };
    expect(rowOf(r, "town")).toMatchObject({
      grade: "A",
      detail: "a 15-minute drive to an ER, 8 to a grocery",
    });
  });

  it("trails: adjoining open land is an A; open land within a mile a B, unless a trailhead does better", () => {
    const r = ferney();
    const open = { ...r.protected![0]!, adjoins: false, distFt: 2640 };
    r.protected = [open];
    expect(rowOf(r, "trails")).toMatchObject({ grade: "B" }); // Buffalo Mountain is 47 min by road, a D
    expect(rowOf(r, "trails").detail).toMatch(/^open public land 0\.5 mi away/);
    const th = r.near!.trailheads[0]!;
    r.near!.trailheads = [{ ...th, drive: { ...th.drive!, min: 8 } }];
    expect(rowOf(r, "trails")).toMatchObject({
      grade: "A",
      detail: "a trailhead 8 min (11.5 mi) by road, 6.4 mi straight (Buffalo Mountain Trailhead)",
      short: "trailhead 8 min",
    });
    r.protected = [{ ...open, adjoins: true, distFt: null }];
    r.near!.trailheads = [];
    expect(rowOf(r, "trails").grade).toBe("A");
    r.protected = [];
    expect(rowOf(r, "trails")).toMatchObject({ grade: "F", detail: "no trailhead found within 22.4 mi" });
  });

  it("trails by the quickest drive to a trailhead's parking: 10 / 20 / 35 / 50 min (follow-up 54, provisional)", () => {
    const r = ferney();
    r.protected = [];
    const [a, b] = r.near!.trailheads;
    const at = (min: number) => {
      r.near!.trailheads = [
        { ...a!, drive: { ...a!.drive!, min } },
        { ...b!, drive: { ...b!.drive!, min: 200 } }, // slower, but nearer by straight line: not the one graded
      ];
      return rowOf(r, "trails").grade;
    };
    expect([9, 10, 11, 20, 21, 35, 36, 50].map(at)).toEqual(["A", "A", "B", "B", "C", "C", "D", "D"]);
    expect(at(51)).toBe("F");
    expect(SCREEN_CONSTANTS.card.rows.trailheadMin).toEqual([10, 20, 35, 50]);
    // The quickest is graded, not the nearest by straight line: Grayson's Scales Trailhead is 7.2 mi away and 118 min.
    const g = expectedOf("grayson-mud-creek-6273", "run");
    expect(rowOf(g, "trails").detail).toBe(
      "a trailhead 17 min (6.7 mi) by road, 5.0 mi straight (Grayson Highlands State Park)",
    );
  });

  it("trails with no drive times (OSRM didn't answer): the straight-line 3 / 6 / 12 / 22 mi, marked incomplete", () => {
    const r = ferney();
    r.protected = [];
    r.noResponse = [TRAILHEAD_DRIVES]; // recorded by the drive step (follow-up 54)
    const MI = 1.609344;
    const at = (mi: number) => {
      r.near!.trailheads = [{ ...r.near!.trailheads[0]!, km: mi * MI, drive: null }];
      return rowOf(r, "trails").grade;
    };
    expect([2.9, 3, 5.9, 6, 11.9, 12, 15, 21.9, 22].map(at)).toEqual([
      "A",
      "A",
      "B",
      "B",
      "C",
      "C",
      "D",
      "D",
      "D",
    ]);
    expect(at(22.1)).toBe("F");
    at(6.5);
    expect(rowOf(r, "trails")).toMatchObject({
      grade: "C",
      detail:
        "a trailhead 6.5 mi away in a straight line (Buffalo Mountain Trailhead); incomplete: the drive times didn't load",
      missing: "the drive times",
    });
    expect(reportCard(r, "zach").verdict).toBe("Maybe");
    // Adjoining open land is still an A, not flagged.
    r.protected = [{ ...ferney().protected![0]!, access: "OA", adjoins: true, distFt: null }];
    expect(rowOf(r, "trails")).toMatchObject({ grade: "A" });
    expect(rowOf(r, "trails").missing).toBeUndefined();
    // The search reaches the last cutoff, so a trailhead D grades can be found (it searched 20 km, 12.4 mi).
    expect(SCREEN_CONSTANTS.near.trailheadKm).toBeGreaterThanOrEqual(
      SCREEN_CONSTANTS.card.rows.trailheadKm.at(-1)!,
    );
    expect(SCREEN_CONSTANTS.card.rows.trailheadKm.map((km) => Math.round((km / MI) * 1e9) / 1e9)).toEqual([
      3, 6, 12, 22,
    ]);
  });

  it("trails without trailhead drives that aren't recorded as failed: no 'didn't load' (#123 testing, Grayson 6273)", () => {
    // Zach's screen: the drives to the hospital and the grocery loaded, but the trailheads had none (a result screened
    // before they were stored). Nothing in the result says they failed, so the row isn't called incomplete.
    const r = expectedOf("grayson-mud-creek-6273", "run");
    r.near = { ...r.near!, trailheads: r.near!.trailheads.map((t) => ({ ...t, drive: null })) };
    delete r.driveFrom;
    expect(rowOf(r, "town").detail).toBe("a 38-minute drive to an ER, 21 to a grocery");
    expect(rowOf(r, "trails")).toMatchObject({
      grade: "B",
      detail: "a trailhead 4.9 mi away in a straight line (Grayson Highlands State Park)",
    });
    expect(rowOf(r, "trails").missing).toBeUndefined();
    expect(reportCard(r, "zach").verdict).toBe("Contender");

    // Recorded failures do flag it: the drive step failed, or OSRM routed none of the trailheads.
    expect(rowOf({ ...r, failed: ["drive"] }, "trails").missing).toBe("the drive times");
    expect(rowOf({ ...r, noResponse: [TRAILHEAD_DRIVES] }, "trails").missing).toBe("the drive times");
    // And while the run is still going (no verdict yet), the row waits for them.
    const { verdict: _v, ...running } = r;
    expect(rowOf(running as typeof r, "trails").missing).toBe("the drive times");
  });

  it("trails with a trailhead list that didn't load: incomplete, the verdict held at Maybe (follow-up 53)", () => {
    const r = ferney();
    expect(reportCard(r, "zach")).toMatchObject({ grade: "B", verdict: "Contender" });
    r.noResponse = ["state parks (vginmaps.vdem.virginia.gov)"];
    // Graded on what did load, and marked.
    expect(rowOf(r, "trails")).toMatchObject({
      grade: "D",
      detail:
        "a trailhead 47 min (11.5 mi) by road, 6.4 mi straight (Buffalo Mountain Trailhead); incomplete: VA state parks (VGIN) didn't load",
      missing: "VA state parks (VGIN)",
    });
    const card = reportCard(r, "zach");
    expect(card).toMatchObject({ grade: "B", verdict: "Maybe", incomplete: ["VA state parks (VGIN)"] });
    expect(card.reason).toContain("(incomplete: VA state parks (VGIN) didn't load, run again).");

    // Two lists: both named.
    r.noResponse = ["USFS recreation sites", "state parks (services6.arcgis.com)"];
    expect(rowOf(r, "trails").missing).toBe("USFS recreation sites and NC state parks (DPR)");

    // Adjoining open public land is an A whatever the trailheads: not flagged.
    r.protected = [{ ...r.protected![0]!, access: "OA", adjoins: true, distFt: null }];
    expect(rowOf(r, "trails")).toMatchObject({ grade: "A" });
    expect(rowOf(r, "trails").missing).toBeUndefined();

    // What isn't a trailhead list leaves the row alone; nor does the parking query failing (the drives go to the points).
    const s = ferney();
    s.noResponse = ["OpenStreetMap roads", "Overpass (trailhead parking)"];
    expect(rowOf(s, "trails").missing).toBeUndefined();
  });

  it("trails when the places failed (Photon, then Overpass): adjoining open land is still an A (#122 review)", () => {
    // OpenStreetMap's own search failing too: the near step fails and there's no `near`. Ungraded and incomplete.
    const t = ferney();
    delete t.near;
    expect(rowOf(t, "trails")).toMatchObject({
      grade: null,
      detail: "the places didn't load",
      missing: "the places",
    });
    expect(reportCard(t, "zach").verdict).toBe("Maybe");

    // Open land within a mile that doesn't adjoin: a trailhead might do better, so still not loaded, still Maybe.
    const open = { ...t.protected![0]!, access: "OA" as const, adjoins: false, distFt: 2640 };
    t.protected = [open];
    expect(rowOf(t, "trails")).toMatchObject({
      grade: null,
      detail: "the places didn't load",
      missing: "the places",
    });
    expect(reportCard(t, "zach").verdict).toBe("Maybe");

    // Adjoining: PAD-US loaded, so the A is certain whatever trailheads there are. The existing sentence, not flagged.
    t.protected = [{ ...open, adjoins: true, distFt: null }];
    expect(rowOf(t, "trails")).toMatchObject({ grade: "A", short: "adjoins public land" });
    expect(rowOf(t, "trails").detail).toMatch(/^adjoins open public land \(/);
    expect(rowOf(t, "trails").missing).toBeUndefined();
    expect(reportCard(t, "zach")).toMatchObject({ verdict: "Contender", incomplete: [] });

    // PAD-US failed as well: nothing is certain, so the row didn't load.
    delete t.protected;
    expect(rowOf(t, "trails")).toMatchObject({
      grade: null,
      detail: "PAD-US didn't load",
      missing: "PAD-US",
    });
  });

  it("Best homesite in plain words; the quality score is the panel's (owner, #110)", () => {
    const r = ferney();
    expect(rowOf(r, "homesite")).toMatchObject({
      grade: "A",
      detail: "faces E, 8.7 h of December sun, 7° slope",
      panelNote: "site #1's quality A (88)",
    });
  });

  it("a build that doesn't fit caps the verdict at Maybe and is the first thing to check (owner, #110)", () => {
    const r = ferney();
    r.sites![0] = { ...r.sites![0]!, gentleNearAc: 0.2 };
    // An A sky and an A trailhead, so the points alone would make a Contender.
    r.sky = { ...r.sky!, mag: 22 };
    r.near!.trailheads = r.near!.trailheads.map((t, i) =>
      i === 0 ? { ...t, drive: { ...t.drive!, min: 8 } } : t,
    );
    expect(rowOf(r, "room")).toMatchObject({
      grade: "F",
      checkFirst: "your build doesn't fit on the gentle ground (0.2 ac, 0.4× the footprint)",
    });
    const c = reportCard(r, "zach");
    expect(c.points).toBeGreaterThan(K.verdict.contender); // a Contender on points alone
    expect(c.verdict).toBe("Maybe");
    expect(c.reason).toBe(
      "Maybe. Check first: your build doesn't fit on the gentle ground (0.2 ac, 0.4× the footprint).",
    );
    // A fail still comes first.
    r.sites![0]!.flood = true;
    r.flood = { zones: ["AE"], sfha: true, sfhaAcres: 3, mapped: true };
    expect(reportCard(r, "zach").reason).toBe("Pass: the build site is in a FEMA flood zone.");
  });

  it("no build site: the homesite is an F, and the elevation is left out (not incomplete)", () => {
    const r = ferney();
    r.sites = [];
    expect(grades(r)).toMatchObject({ homesite: "F", elevation: null });
    expect(reportCard(r, "zach").incomplete).toEqual([]);
  });

  it("a row whose data didn't load is left out of the grade", () => {
    const r = ferney();
    delete r.sky;
    const c = reportCard(r, "zach");
    expect(rowOf(r, "sky").grade).toBeNull();
    // Ferney's 320 points less the sky's 30, over 90 of weight.
    expect(c.points).toBeCloseTo(290 / 90, 9);
  });

  it("a number said aloud takes 'an' for 8, 11, 18 and 80–89 (owner, #124)", () => {
    expect([8, 11, 18, 80, 82, 89].map(articleFor)).toEqual(["an", "an", "an", "an", "an", "an"]);
    expect([1, 7, 9, 10, 12, 17, 19, 20, 48, 79, 90, 108, 180, 800].map(articleFor)).toEqual(
      Array(14).fill("a"),
    );
  });

  it("the footprint is §5.4's 19,860 ft² (0.46 ac)", () => {
    expect(footprintFt2()).toBe(5120 + 4200 + 2400 + 4068 * 2);
  });
});

describe("config and weights", () => {
  it("a changed cutoff changes the grade", () => {
    const r = expectedOf("ferney-creek-52-47A", "run");
    const lower: CardConfig = { ...K, rows: { ...K.rows, elevationFt: [2700, 2500, 2000, 1500] } };
    const c = cardFor(cardFacts(r, lower), "zach", lower);
    expect(c.rows.find((x) => x.key === "elevation")!.grade).toBe("A");
    expect(c.points).toBeCloseTo(3.45, 9);
    expect(c.grade).toBe("B");
    // And the drive cutoffs (provisional until Zach's Google column): Buffalo Mountain's 47 min an A lifts it to an A.
    const roomy: CardConfig = { ...lower, rows: { ...lower.rows, trailheadMin: [50, 60, 70, 80] } };
    const d = cardFor(cardFacts(r, roomy), "zach", roomy);
    expect(d.rows.find((x) => x.key === "trails")!.grade).toBe("A");
    expect(d.points).toBeCloseTo(3.75, 9);
    expect(d.grade).toBe("A");
  });

  it("each person's weights sum to 100", () => {
    for (const w of Object.values(K.weights)) expect(Object.values(w).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("the weights change the grade, the verdict and the reason, and nothing else", () => {
    const r = ferney();
    r.gardens = [];
    r.near!.trailheads = [];
    r.protected = [];
    const facts = cardFacts(r);
    const zach = cardFor(facts, "zach"),
      julie = cardFor(facts, "julie");
    expect(zach.points).toBeCloseTo(2.7, 9);
    expect(julie.points).toBeCloseTo(1.7, 9);
    expect([zach.verdict, julie.verdict]).toEqual(["Maybe", "Pass"]);
    // Trails and the garden are both F; the reason names the one this person weighs more (Julie: trails 25).
    expect(julie.reason).toBe(
      "Pass. Weakest part: trails and public land (F, no trailhead found within 22.4 mi).",
    );
    expect(zach.gates).toEqual(julie.gates);
    expect(zach.rows).toEqual(julie.rows);
  });
});
