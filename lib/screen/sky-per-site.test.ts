/**
 * The sky read at each site and at the house (follow-up 58): each spot's sky part is its own reading, taken with the
 * skyline its sun is measured on, so it doesn't depend on a house being marked, on the order the app's operations
 * ran, or on which pin was tapped last.
 */
import { describe, expect, it } from "vitest";
import { derivedHouse, derivedSites, skyScoreOf } from "./derive";
import { loadFixture, PROTOTYPE_FIXTURE_SLUGS, type PrototypeSlug } from "@/test/support/fixtures";
import { runFixture } from "@/test/support/scenarios";
import { evaluateAt, setHouse, type ScreenOutput } from "./index";
import type { ScreenResult } from "./types";
import type { LatLon } from "./util";

/**
 * The fixture's recorded house (Ferney Creek's), else one marked at the ranked site whose sky reads furthest from
 * site #1's (Macks Mountain's 0.70 ac site, Mud Creek's 0.46 ac shelf): a house whose sky isn't the focus's.
 */
function houseOf(slug: PrototypeSlug, run: ScreenResult): LatLon {
  const h = loadFixture(slug).input.house;
  if (h) return h.ll as LatLon;
  const sites = derivedSites(run)!;
  const away = (x: (typeof sites)[number]) => Math.abs(x.q.sky - sites[0]!.q.sky);
  const far = sites.reduce((a, b) => (away(b) > away(a) ? b : a));
  expect(away(far)).toBeGreaterThan(0);
  return far.ll as LatLon;
}
const skyBySite = (r: ScreenResult) =>
  new Map((derivedSites(r) ?? []).map((s) => [`${s.ll[0]},${s.ll[1]}`, s.q.sky]));
const houseSky = (out: ScreenOutput) => {
  const h = derivedHouse(out.result);
  if (!h || "outside" in h) throw new Error("no house assessment");
  return h.q.sky;
};

describe("the sky at each site and at the house (follow-up 58)", () => {
  for (const slug of PROTOTYPE_FIXTURE_SLUGS)
    it(slug, async () => {
      const run = await runFixture(slug, {});
      const h = houseOf(slug, run.result);
      const houseRun = await runFixture(slug, { house: h });
      const moved = await setHouse(run, h);

      // Each site's sky is the same with and without a house marked, whether by a full run or a move.
      const without = skyBySite(run.result);
      expect(without.size).toBeGreaterThan(0);
      expect(skyBySite(houseRun.result)).toEqual(without);
      expect(skyBySite(moved.result)).toEqual(without);

      // A moved house's sky = a full run's with that house, and the Dark skies section's reading at the house.
      expect(houseSky(moved)).toBe(houseSky(houseRun));
      expect(houseSky(houseRun)).toBe(skyScoreOf(houseRun.result.sky!));

      // Site #1's is the Dark skies section's reading there (the focus without a house).
      expect(run.result.focus!.ll).toEqual(run.result.sites![0]!.ll);
      expect(derivedSites(run.result)![0]!.q.sky).toBe(skyScoreOf(run.result.sky!));
    });
});

describe("pins tapped before the house is moved (follow-up 58)", () => {
  it("ferney-creek-52-47A: in any order, and after another house, the house's sky is the same", async () => {
    const slug = "ferney-creek-52-47A";
    const run = await runFixture(slug, {});
    const h = houseOf(slug, run.result);
    const expected = houseSky(await setHouse(run, h));
    const [a, b, c] = run.result.sites!.slice(1, 4).map((s) => s.ll as LatLon);
    const tap = async (out: ScreenOutput, ll: LatLon) => evaluateAt(out, ll, "a pin");
    for (const order of [
      [a!, b!],
      [b!, a!],
      [c!, a!, b!],
    ]) {
      let out = run;
      for (const ll of order) out = await tap(out, ll);
      expect(houseSky(await setHouse(out, h))).toBe(expected);
    }
    // A house marked elsewhere first, then moved here.
    expect(houseSky(await setHouse(await setHouse(run, c!), h))).toBe(expected);
  });
});
