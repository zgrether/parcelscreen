/**
 * The driveway section and map show the route the target is scored on first (owner, #88 review and its approved
 * plan). Over the limit, it is the suspect card and drawing; the route within the limit that needs an easement is
 * the alternative, "Within 10% only via neighbouring land — needs an easement". The title and card order change is
 * an approved exception to rule 7 (phase-0.md §9, decision 22).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { drivewayFeatures } from "@/lib/render/resultGeo";
import { drivewayView } from "@/lib/report/driveway";
import { buildDriveway, overLimitNote, siteDriveways, withScoredRoute } from "@/lib/screen/driveway";
import { routeContext } from "@/lib/screen/index";
import type { ScreenResult } from "@/lib/screen/types";
import { expectedPath } from "@/test/support/expected";
import { runFixture } from "@/test/support/scenarios";

const expected = (slug: string): { run: ScreenResult; evaluateSite2?: ScreenResult } =>
  JSON.parse(readFileSync(expectedPath(slug as never), "utf8"));

/** The approved replacements (owner, #88 review): the card titles before → after, in order. */
const APPROVED = {
  before: [
    "Recommended — shortest legal — needs an easement",
    "Alternative — shortest legal — needs an easement",
  ],
  after: [
    "Over the limit — least steep (suspect)",
    "Within 10% only via neighbouring land — needs an easement",
    "Alternative — shortest legal — needs an easement",
  ],
};

describe("the scored route first (#88 follow-up)", () => {
  it("Grayson #1: the 11% route kept to the parcel is the suspect card, first; the easement route is the alternative", () => {
    const r = expected("grayson-mud-creek-6273").run;
    const d = r.driveway!;
    expect(d.overLimit && d.routes.length).toBeTruthy();
    expect(Math.round(d.overLimit!.maxGrade * 100)).toBe(11);
    expect(d.overLimit!.track).toBeDefined(); // the pioneer track follows the scored route
    expect(d.routes.every((rt) => !rt.track)).toBe(true);
    expect(d.note!.endsWith(overLimitNote(d.overLimit!))).toBe(true);
    // #1 is scored on that route.
    expect(r.sites![0]!.driveFt).toBe(d.overLimit!.metrics.lengthFt);

    const v = drivewayView(r)!;
    expect([v.overLimit!.title, ...v.routes.map((x) => x.title)]).toEqual(APPROVED.after);
    expect(v.track!.rows[0]!.strong).toBe(
      `$${Math.round(d.overLimit!.track!.cost.low / 1000)}–${Math.round(d.overLimit!.track!.cost.high / 1000)}k`,
    );

    // The map: the suspect line first, the routes within the limit drawn as alternatives (i ≥ 1).
    const f = drivewayFeatures(r).lines.features;
    expect(f[0]!.properties.kind).toBe("over");
    expect(f.filter((x) => x.properties.kind === "route").map((x) => x.properties.i)).toEqual([1, 2]);
  });

  it("the titles change only as approved: the same routes without the scored one read as before", () => {
    const r = expected("grayson-mud-creek-6273").run;
    const { overLimit: _o, ...d } = r.driveway!;
    const before = drivewayView({ ...r, driveway: d })!;
    expect(before.routes.map((x) => x.title)).toEqual(APPROVED.before);
  });

  it("Grayson's evaluateAt site #2: the section shows that site's scored route too", () => {
    const e = expected("grayson-mud-creek-6273").evaluateSite2!;
    expect(e.driveway!.overLimit && e.driveway!.routes.length).toBeTruthy();
    expect(Math.round(e.driveway!.overLimit!.maxGrade * 100)).toBe(11);
  });

  it.each(["ferney-creek-52-47A", "macks-mountain-35-3"])(
    "%s: the route within the limit is on the parcel and scored, so the section is as it was",
    (slug) => {
      const d = expected(slug).run.driveway!;
      expect(d.overLimit).toBeUndefined();
      expect(drivewayView(expected(slug).run)!.routes[0]!.title).toMatch(/^Recommended — /);
    },
  );

  it("a scored route within the limit that isn't the cheapest goes first in routes (synthetic)", async () => {
    // No fixture has the case (under an 11% limit Grayson's cheapest route already keeps to the parcel), so: the
    // 10% driveway to Grayson's #1, with its 11% route kept to the parcel passed in as a scored route within the
    // limit.
    const { result, session: s } = await runFixture("grayson-mud-creek-6273");
    const ctx = routeContext(s);
    const ll = result.sites![0]!.ll;
    const dw = buildDriveway(ctx, s.roads ?? [], s.parcel, ll, "site #1", 10);
    const scored = { ...siteDriveways(ctx, s.roads ?? [], s.parcel, [ll], 11)[0]!.withinLimit!, legal: true };
    expect(scored.route!.needsEasement).toBe(false);
    expect(dw.routes[0]!.needsEasement).toBe(true);
    const out = withScoredRoute(ctx, dw, scored, ll);
    expect(out.overLimit).toBeUndefined();
    expect(out.routes[0]!.cost.mid).toBe(scored.route!.cost.mid);
    expect(out.routes[0]!.track).toBeDefined();
    expect(out.routes.slice(1).every((rt) => !rt.track)).toBe(true);
    expect(out.routes.length).toBeLessThanOrEqual(2);
  }, 120_000);
});
