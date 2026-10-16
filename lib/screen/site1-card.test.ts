/**
 * Site #1's card with and without a house marked (owner, #142; phase-0.md §9.43): a full run with a house used to keep
 * site #1's straight-line road estimate above its routed driveway, the line A3b replaced and that contradicts it. Its
 * card is now the same either way, on all three fixtures.
 */
import { describe, expect, it } from "vitest";
import { buildView } from "../report/build";
import { FIXTURE_SLUGS, loadFixture, type FixtureSlug } from "@/test/support/fixtures";
import { runFixture } from "@/test/support/scenarios";
import type { LatLon } from "./util";

/** Ferney Creek's recorded house; Macks Mountain and Mud Creek have none, so the prototype's site #2 point. */
function houseOf(slug: FixtureSlug): LatLon {
  const input = loadFixture(slug).input;
  return (input.house?.ll ?? input.evaluateSite2!.ll) as LatLon;
}

describe("site #1's card, with and without a house (§9.43)", () => {
  for (const slug of FIXTURE_SLUGS)
    it(slug, async () => {
      const without = await runFixture(slug, {});
      const withHouse = await runFixture(slug, { house: houseOf(slug) });
      const card = (r: typeof without.result) => buildView(r)!.sites[0];
      expect(card(withHouse.result)).toEqual(card(without.result));
      // The straight-line estimate is gone from site #1, as without a house; its routed line is there.
      const why = withHouse.result.sites![0]!.why;
      expect(why.some((w) => /ft to .* at .*straight-line/.test(w))).toBe(false);
      expect(why.some((w) => w.startsWith("routed driveway: "))).toBe(true);
    });
});
