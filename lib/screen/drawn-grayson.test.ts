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
import { describe, expect, it } from "vitest";
import { ZACH } from "@/test/support/rubrics";
import { flagsOf } from "./flags";
import { redGate, toTheBoundary } from "../../test/support/redGate";
import { runFixture } from "../../test/support/scenarios";
import { reportCard } from "../report/card";
import { drivewayView, routeChoices } from "../report/driveway";
import { driveSteepFt } from "../report/ground";
import { drivewayFeatures } from "../render/resultGeo";
import { lineNamesOf, lineOutcome, type LineNames } from "../report/lines";
import { DEFAULT_USER_CONFIG } from "./config";
import { siteDriveways } from "./driveway";
import { routeContext } from "./index";
import { chooseDriveway, drivewayPoints, overLimitPoints } from "./score";
import type { DrawnInput, ScreenResult } from "./types";

const gate = (r: ScreenResult, key: string) => reportCard(r, ZACH).gates.find((g) => g.key === key)!;
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
    // The existing-drive follow-up (owner, 10/21): its profile is kept, and at 12% it gives the drive's own paved length.
    expect(x.profile!.length).toBeGreaterThan(50);
    expect(driveSteepFt(x.profile, 12)).toBeCloseTo(x.pavedFt, 6);
    expect(x.cost.mid).toBeGreaterThan(15_000);
    expect(drawn.route!.needsEasement).toBe(true);
    expect(overLimitPoints(drawn)).toBe(20);
    // Mud Creek Ln's route, on the parcel and within the limit, has fewer points: it's the one scored.
    expect(chosen.entranceIndex).not.toBe(e);
    expect(drivewayPoints(chosen)).toBeLessThan(drivewayPoints(drawn));
    expect(d.routes[0]!.entranceIndex).toBe(chosen.entranceIndex);
    expect(gate(result, "access").status).toBe("pass");
    expect(gate(result, "easement").status).toBe("pass");
    expect(flagsOf(result).some((f) => /existing drive/.test(f.t))).toBe(false); // the scored route doesn't use it

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

  it("carried on to the boundary: no easement need, but the 41% drive still loses on points; by its name, renamed or deleted after the run", async () => {
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

    // Drawn with the parcel, the sentences read the line by its current name, looked up by the id the result keeps
    // (owner, 2026-10-14): as named at the run; renamed after it; deleted after it, by its kind.
    // Up to the line's length and grades: " (872 ft · …".
    const named = (text: string) => text.replace(/ \(\d[\d,]* ft.*$/, "");
    const said = (names: LineNames) => {
      const card = reportCard(r, ZACH, { names, marks: [] });
      const v = drivewayView(r, names)!;
      return {
        access: card.gates.find((g) => g.key === "access")!.reason,
        easement: card.gates.find((g) => g.key === "easement")!.reason.split(";")[0],
        entrance: named(v.entrances!.split(". ").at(-1)!),
        route: named(v.routes[0]!.rows.find((row) => row.label === "Drawn lines")!.value),
      };
    };
    const markup = [{ id: "red-gate", name: "Easement 1" }];
    expect(said(lineNamesOf(markup))).toEqual({
      access: "Frontage on Mud Creek Ln; Easement 1: verify it's a legal right-of-way",
      easement: "Easement 1: verify it's a legal right-of-way",
      entrance: "E4 is the end of Easement 1",
      route: "from the end of Easement 1",
    });
    const renamed = markup.map((m) => ({ ...m, name: "Red gate drive" }));
    expect(said(lineNamesOf(renamed))).toEqual({
      access: "Frontage on Mud Creek Ln; Red gate drive: verify it's a legal right-of-way",
      easement: "Red gate drive: verify it's a legal right-of-way",
      entrance: "E4 is the end of Red gate drive",
      route: "from the end of Red gate drive",
    });
    expect(said(lineNamesOf([]))).toEqual({
      access:
        "Frontage on Mud Creek Ln; easement (user-drawn, since deleted): verify it's a legal right-of-way",
      easement: "Easement (user-drawn, since deleted): verify it's a legal right-of-way",
      entrance: "E4 is the end of Easement (user-drawn, since deleted)",
      route: "from the end of Easement (user-drawn, since deleted)",
    });
    // The saved result is untouched: drawn without the parcel's lines, it reads as before.
    expect(drivewayView(r)!.entrances).toMatch(/E4 is the end of Easement \(user-drawn\) \(/);
  });
});

describe("WF5: the red-gate easement as the driveway, and where it's recorded (owner, WF5 review)", () => {
  const REF = "Ashe Co. Plat Bk 574 Pg 1132";
  const RECORDED = `recorded in ${REF} (your entry): make sure your deed includes this right-of-way`;
  const names = new Map([["red-gate", "Red gate"]]);
  const drawn = (driveway: string | null, record = "") => ({
    names,
    marks: [],
    driveway,
    records: new Map(record.trim() ? [["red-gate", record.trim()]] : []),
  });
  const gates = (r: ScreenResult, d: ReturnType<typeof drawn>) =>
    Object.fromEntries(
      reportCard(r, ZACH, d).gates.map((g) => [g.key, { status: g.status, reason: g.reason }]),
    );

  it("chosen: the card scores its route, says so, warns it's over the veto, and compares it with the app's pick", async () => {
    const { result } = await runFixture("grayson-mud-creek-6273", { lines: [toTheBoundary(redGate)] });
    // The app's pick, from Mud Creek Ln: both gates pass.
    expect(gates(result, drawn(null))).toMatchObject({
      access: { status: "pass", reason: "Frontage on Mud Creek Ln" },
      easement: { status: "pass", reason: "The driveway stays on the parcel" },
    });
    // Chosen: what each gate said of this route before (#116), then the veto, appended (WF5).
    const g = gates(result, drawn("red-gate"));
    expect(g.access).toEqual({
      status: "warn",
      reason:
        "Frontage on Mud Creek Ln; Red gate: verify it's a legal right-of-way; your route is steeper than your veto (41% vs 25%)",
    });
    expect(g.easement).toEqual({
      status: "warn",
      reason:
        "Red gate: verify it's a legal right-of-way; the existing drive is steeper than your limit (21% avg, 41% steepest over 30 m on raw ground; a built road grades out 1–4 points); your route is steeper than your veto (41% vs 25%)",
    });
    const card = reportCard(result, ZACH, drawn("red-gate"));
    expect(card.drivewayLine).toBe("red-gate");
    // Drive times are still from Mud Creek Ln's end (until WF6): the Hospital and Trails panels say so (Town, the
    // groceries, is Don't care on the starting list since step 11, so it isn't on this card).
    for (const key of ["hospital", "trails"])
      expect(card.rows.find((x) => x.key === key)!.panelNote).toMatch(
        /Drive times start where the app's pick meets the road\.$/,
      );

    // The Driveway section marks it and says it, after the routes.
    const v = drivewayView(result, names, "red-gate")!;
    expect(v.routes.filter((rv) => rv.yours).map((rv) => rv.from)).toEqual(["from E4"]);
    expect(v.chosen).toMatch(
      /^You chose this route, from Red gate; the app's pick starts from E\d, Mud Creek Ln\.$/,
    );
    expect(drivewayView(result, names)!.chosen).toBeNull();

    // The Easement panel's comparison: the app's pick and the line's route, the scored one marked.
    const cols = routeChoices(result, names, "red-gate", 25)!;
    expect(cols.map((c) => [c.title, c.line, c.scored])).toEqual([
      ["The app's pick", null, false],
      ["Red gate", "red-gate", true],
    ]);
    const row = (i: number, label: string) => cols[i]!.rows.find((x) => x.label === label)!.value;
    expect(row(1, "Steepest, raw ground")).toBe("41%");
    expect(row(1, "Veto")).toBe("over 25%");
    expect(row(0, "Veto")).toBe("within 25%");

    // On the map: your route is the driveway (drawn bold, i 0); the app's pick drops among the alternatives.
    const routes = drivewayFeatures(result, "red-gate").lines.features.filter(
      (f) => f.properties.kind === "route",
    );
    const bold = routes.filter((f) => f.properties.i === 0);
    expect(bold.map((f) => f.properties.tip)).toEqual([expect.stringMatching(/^Your route: /)]);
    expect(
      routes.filter((f) => /^The app's pick: /.test(f.properties.tip)).map((f) => f.properties.i),
    ).toEqual([1]);
    expect(drivewayFeatures(result).lines.features.some((f) => /^Your route/.test(f.properties.tip))).toBe(
      false,
    );

    // What the run made of the line, with it chosen: used.
    expect(lineOutcome(result, 0, "Red gate", "red-gate")).toBe(
      "Red gate was used: the driveway starts from its far end, and follows it to the road.",
    );
    // A chosen line this screen has no route from: the app's pick, and the card says so.
    const lost = reportCard(result, ZACH, {
      ...drawn("gate-2"),
      names: new Map([["gate-2", "Gate lane"]]),
    });
    expect(lost.routeNote).toBe("Your route from Gate lane isn't in this screen: scored on the app's pick.");
    expect(lost.drivewayLine).toBeUndefined();
  });

  it("Recorded in: no longer asked to be verified, said where it's recorded instead; cleared, the warning is back", async () => {
    const { result } = await runFixture("grayson-mud-creek-6273", { lines: [toTheBoundary(redGate)] });
    const g = gates(result, drawn("red-gate", REF));
    // The veto's warning still applies (owner): the gate warns for that alone, with the record after it.
    expect(g.access).toEqual({
      status: "warn",
      reason: `Frontage on Mud Creek Ln; your route is steeper than your veto (41% vs 25%); ${RECORDED}`,
    });
    expect(g.easement!.reason).not.toMatch(/verify it's a legal right-of-way/);
    expect(g.easement!.reason.endsWith(`; ${RECORDED}`)).toBe(true);
    // Cleared (or only spaces): today's warning, unchanged.
    expect(gates(result, drawn("red-gate", "   "))).toEqual(gates(result, drawn("red-gate")));
    expect(gates(result, drawn("red-gate", "")).access!.reason).toMatch(
      /Red gate: verify it's a legal right-of-way/,
    );
  });

  it("the Mud Creek shape, within the veto: the chosen red-gate route with its record reads pass, with the reminder", async () => {
    const { result } = await runFixture("grayson-mud-creek-6273", {
      lines: [toTheBoundary(redGate)],
      config: { ...DEFAULT_USER_CONFIG, roadVetoGradePct: 45 },
    });
    expect(gates(result, drawn("red-gate", REF)).access).toEqual({
      status: "pass",
      reason: `Frontage on Mud Creek Ln; ${RECORDED}`,
    });
    // Without the record, the same route is asked to be verified.
    expect(gates(result, drawn("red-gate")).access).toEqual({
      status: "warn",
      reason: "Frontage on Mud Creek Ln; Red gate: verify it's a legal right-of-way",
    });
  });
});
