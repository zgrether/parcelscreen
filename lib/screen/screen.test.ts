import { describe, expect, it } from "vitest";
import { differences } from "../../test/support/compare";
import { FIXTURE_SLUGS, loadFixture } from "../../test/support/fixtures";
import { fromPrototype } from "../../test/support/fromPrototype";
import { expectedOf } from "../../test/support/expected";
import { depsFor, runFixture } from "../../test/support/scenarios";
import { prototypeFn } from "../../test/support/prototypeFns";
import * as format from "../format";
import { DEFAULT_USER_CONFIG } from "./config";
import { DemCache } from "./dem";
import { siteDriveways, type SiteDriveway } from "./driveway";
import { routeContext, screen, setHouse, type ScreenOutput } from "./index";
import {
  chooseDriveway,
  scoreSiteDetailed,
  storedQuality,
  withDrivewayCost,
  type ScoreContext,
} from "./score";
import { AtlasCache } from "./sky";
import { soilAt } from "./soils";
import { defaultName, summaryText } from "./summary";
import type { ProgressEvent, ScreenResult } from "./types";

const CFG = DEFAULT_USER_CONFIG;

// The five prototype goldens are no longer the target (Batch A §1): test/tools/expected.test.ts holds every
// scenario to expected.json, and pnpm diff:prototype reports the departures from the prototype.
const run = runFixture;

/**
 * The owner's question: did the road-distance rounding (~1e-6 relative) move any cost index, tier or overall
 * score? Every scored spot is re-scored with its unrounded numbers, and its distance to the nearest rounding
 * or tier boundary is compared with the largest drift seen in its driveway cost point.
 */
describe("road-distance rounding vs cost index, tier and overall score", () => {
  const margins: string[] = [];
  // Largest |Δ c.driveway| between the port and the prototype's goldens, all fixtures: Turf 7.4.0 against the
  // prototype's 7.1.0 bundle (test/support/parity.ts), not the engines as first thought.
  const MAX_COST_DRIFT = 3e-5;

  it.each([
    ["ferney-creek-52-47A", false],
    ["macks-mountain-35-3", false],
    ["ferney-creek-52-47A", true],
  ] as const)("%s (house: %s): every boundary is far beyond the drift", async (slug, withHouse) => {
    const fx = loadFixture(slug);
    const out = await run(slug, withHouse ? { house: fx.input.house!.ll } : {});
    const s = out.session;
    const ctx: ScoreContext = {
      dFine: s.dFine!,
      dWide: s.dWide!,
      valleyFloorFt: s.valleyFloorFt!,
      skyScore: out.result.sky?.score,
      roads: s.roads ?? null,
      sfha: s.sfha ?? null,
      units: s.units ?? null,
      rows: s.rows ?? null,
      limits: s.limits ?? null,
      cfg: CFG,
    };
    // Since A3 every ranked site is re-costed from its routed driveway (and the house from the route to it):
    // rebuild each the way the pipeline does, then measure the same margins on those numbers.
    const sites = out.result.sites ?? [];
    const routed = siteDriveways(
      routeContext(s),
      s.roads ?? [],
      s.parcel,
      sites.map((x) => x.ll),
      CFG.roadMaxGradePct,
    );
    const h0 = out.result.house;
    const toHouse: SiteDriveway | null =
      h0 && !("outside" in h0)
        ? chooseDriveway(
            siteDriveways(routeContext(s), s.roads ?? [], s.parcel, [h0.ll], CFG.roadMaxGradePct)[0]!,
          )
        : null;
    const spots = sites.map((x, i) => ({
      name: `site #${x.rank}`,
      ll: x.ll,
      b: {
        acres: x.acres,
        elevFt: x.elevFt,
        aspectDeg: x.aspectDeg,
        slopeDeg: x.slopeDeg,
        compact: x.compact,
      },
      shown: x,
      dw: chooseDriveway(routed[i]!),
    }));
    const h = out.result.house;
    if (h && !("outside" in h))
      spots.push({
        name: "house",
        ll: h.ll,
        b: {
          acres: h.benchAcres ?? 0.25,
          elevFt: h.elevFt!,
          aspectDeg: h.aspectDeg!,
          slopeDeg: h.slopeDeg!,
          compact: undefined,
        },
        shown: h as never,
        dw: toHouse!,
      });
    for (const sp of spots) {
      const { scored } = scoreSiteDetailed(ctx, sp.ll, {
        ...sp.b,
        soil: soilAt(ctx.units, ctx.rows, sp.ll),
      });
      const re = withDrivewayCost(ctx, { ...scored, ...sp.b }, sp.dw);
      expect(re.costIdx).toBe(sp.shown.costIdx);
      expect(re.costTier).toBe(sp.shown.costTier);
      expect(re.score).toBe(sp.shown.score);
      const cost = Math.min(100, re.c.septic + re.c.foundation + re.c.rock + re.c.pad + re.c.driveway);
      const overall = 0.7 * storedQuality(ctx, { ...scored, ...sp.b }) + 0.3 * (100 - cost);
      const toHalf = (v: number) => Math.abs(v - (Math.floor(v) + 0.5));
      const costRound = toHalf(cost),
        costTier = Math.min(...[20, 40, 65].map((t) => Math.abs(cost - t))),
        overallRound = toHalf(overall);
      margins.push(
        `${slug}${withHouse ? " (house run)" : ""} ${sp.name}: cost ${cost.toFixed(4)} → idx ${re.costIdx} ${re.costTier}; ` +
          `to .5 ${costRound.toFixed(4)}, to tier edge ${costTier.toFixed(3)}; overall ${overall.toFixed(4)} → ${re.score}, to .5 ${overallRound.toFixed(4)}`,
      );
      // The drift in cost moves overall by 0.3× as much. Demand at least 30× headroom everywhere.
      expect(costRound).toBeGreaterThan(30 * MAX_COST_DRIFT);
      expect(costTier).toBeGreaterThan(30 * MAX_COST_DRIFT);
      expect(overallRound).toBeGreaterThan(30 * 0.3 * MAX_COST_DRIFT);
    }
  });

  it("prints the margins (for the PR)", () => {
    console.log("ROUNDING MARGINS\n" + margins.join("\n"));
    expect(margins.length).toBeGreaterThan(10);
  });
});

describe("places outage (plan §9.11): roads, road grade and the driveway still come through", () => {
  it("Ferney Creek with Photon and every Overpass mirror down", async () => {
    const down =
      (f: typeof fetch): typeof fetch =>
      async (input, init) =>
        /photon\.komoot\.io|overpass/.test(String(input))
          ? new Response("down", { status: 503 })
          : f(input, init);
    const events: ProgressEvent[] = [];
    const out = await screen(
      { polygon: loadFixture("ferney-creek-52-47A").input.polygon.geometry, config: CFG },
      (e) => events.push(e),
      depsFor("ferney-creek-52-47A", down),
    );
    const normal = (await run("ferney-creek-52-47A")).result;
    expect(out.result.failed).toEqual(["near"]);
    const nearFail = events.find((e) => e.step === "near" && e.status === "fail")!;
    expect(nearFail.message).toMatch(/^Photon: Photon 503; Overpass: Overpass unreachable/);
    expect(nearFail.link).toBeUndefined(); // A2c: the hospital search it tested no longer runs
    expect(out.result.near).toBeUndefined();
    // …but the roads and everything downstream of them survive:
    expect(out.result.road).toEqual(normal.road);
    expect(out.result.sites!.map((s) => s.c.driveway)).toEqual(normal.sites!.map((s) => s.c.driveway));
    expect(out.result.driveway!.routes).toHaveLength(2);
    expect(differences(out.result.driveway, normal.driveway)).toEqual([]);
    // Drive times still route the anchors; there are no hospitals or groceries to try.
    expect(out.result.drives!.map((d) => d.label)).toEqual(CFG.anchors.map((a) => a.name));
  });
});

describe("orchestration", () => {
  it("reports each step run → done in the prototype's order, with partial results (no verdict yet)", async () => {
    const events: ProgressEvent[] = [];
    const out = await screen(
      { polygon: loadFixture("macks-mountain-35-3").input.polygon.geometry, config: CFG },
      (e) => events.push(e),
      depsFor("macks-mountain-35-3"),
    );
    const steps = [
      "dem",
      "terrain",
      "soils",
      "sun",
      "sky",
      "flood",
      "padus",
      "near",
      "drive",
      "rank",
      "driveway",
    ];
    expect(events.map((e) => `${e.step}:${e.status}`)).toEqual(
      steps.flatMap((k) => [`${k}:run`, `${k}:done`]),
    );
    const done = events.filter((e) => e.status === "done");
    expect(done.every((e) => e.partial && e.partial.verdict === undefined)).toBe(true);
    // The driveway step's message is the driveway's note (since A3 Macks's #1 has a legal route, and no note).
    expect(done.at(-1)!.step).toBe("driveway");
    expect(done.at(-1)!.message).toBe(out.result.driveway?.note ?? undefined);
    expect(done.find((e) => e.step === "terrain")!.partial!.terrain).toBeDefined();
  });

  it("cancelling skips the remaining steps and marks the result cancelled", async () => {
    const ctl = new AbortController();
    const events: ProgressEvent[] = [];
    const out = await screen(
      { polygon: loadFixture("ferney-creek-52-47A").input.polygon.geometry, config: CFG },
      (e) => {
        events.push(e);
        if (e.step === "terrain" && e.status === "done") ctl.abort();
      },
      { ...depsFor("ferney-creek-52-47A"), signal: ctl.signal },
    );
    expect(out.result.cancelled).toBe(true);
    expect(out.result.failed).toEqual([]);
    expect(events.filter((e) => e.status === "skip").map((e) => e.step)).toEqual([
      "soils",
      "sun",
      "sky",
      "flood",
      "padus",
      "near",
      "drive",
      "rank",
      "driveway",
    ]);
    expect(out.result.terrain).toBeDefined();
    expect(out.result.sites).toBeUndefined();
  });

  it("a second run with the same caches refetches no DEM and no atlas tile", async () => {
    const deps = { ...depsFor("macks-mountain-35-3"), demCache: new DemCache(), atlas: new AtlasCache() };
    await run("macks-mountain-35-3", {}, deps);
    const before = deps.requests.length;
    await run("macks-mountain-35-3", {}, deps);
    const again = deps.requests.slice(before);
    expect(again.some((k) => k.includes("exportImage"))).toBe(false);
    expect(again.some((k) => k.includes("binary_tile"))).toBe(false);
  });

  it("input.evaluateAt re-evaluates the finished run at that point", async () => {
    const fx = loadFixture("macks-mountain-35-3");
    const out = await run("macks-mountain-35-3", { evaluateAt: fx.input.evaluateSite2!.ll });
    expect(out.result.focus).toEqual({ ll: fx.input.evaluateSite2!.ll, label: "the evaluation point" });
    expect(differences(out.result.sun, expectedOf("macks-mountain-35-3", "evaluateSite2").sun)).toEqual([]);
  });

  it("setHouse(null) clears the house and leaves everything else", async () => {
    const fx = loadFixture("ferney-creek-52-47A");
    const withHouse: ScreenOutput = await setHouse(await run("ferney-creek-52-47A"), fx.input.house!.ll);
    const cleared = await setHouse(withHouse, null);
    expect(cleared.result.house).toBeNull();
    expect(cleared.result.sites).toEqual(withHouse.result.sites);
  });

  it("rounds a marked house to 6 decimals, as the prototype did", async () => {
    const out = await setHouse(await run("ferney-creek-52-47A"), [36.88892512345, -80.45289567891]);
    expect(out.result.house!.ll).toEqual([36.888925, -80.452896]);
  });
});

describe("summary text vs the prototype's own functions", () => {
  const protoSummary = prototypeFn<(R: unknown) => string>("summaryText", { fmt: format.fmt });
  const protoName = prototypeFn<(R: unknown) => string>("defaultName");
  it.each(
    FIXTURE_SLUGS.flatMap((slug) => Object.keys(loadFixture(slug).goldens).map((k) => [slug, k] as const)),
  )("%s %s", (slug, key) => {
    const R = loadFixture(slug).goldens[key as "run"]!;
    expect(summaryText(fromPrototype(R) as ScreenResult)).toBe(protoSummary(R));
    expect(defaultName((R.parcel as { props: Record<string, unknown> }).props, fromPrototype(R))).toBe(
      protoName(R),
    );
  });
});
