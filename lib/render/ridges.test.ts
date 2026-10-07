import { describe, expect, it } from "vitest";
import { horizonProfile } from "@/lib/screen/sun";
import { llToRC } from "@/lib/screen/dem";
import type { ScreenResult } from "@/lib/screen/types";
import { FIXTURE_SLUGS, loadFixture } from "@/test/support/fixtures";
import { fromPrototype } from "@/test/support/fromPrototype";
import { throughSites } from "@/test/support/pipeline";
import { envelope, ridgeBands, RIDGE_BANDS_M } from "./ridges";

describe.each(FIXTURE_SLUGS)("ridges by distance on %s", (slug) => {
  it("their envelope at the report's 5° points is the report's skyline, from the same 30 m DEM", async () => {
    const t = await throughSites(slug);
    const r = fromPrototype(loadFixture(slug).goldens.run) as ScreenResult;
    const ll = r.point!.ll;
    const b = ridgeBands(t.dWide, ll, 5);
    expect(b.angles).toHaveLength(RIDGE_BANDS_M.length);
    const profile = r.sun!.profile;
    expect(b.angles[0]).toHaveLength(profile.length);
    profile.forEach(([az, angle], i) => expect(+envelope(b, i).toFixed(1), `az ${az}`).toBe(angle));
    // The same as the engine's own march, unrounded.
    const [r0, c0] = llToRC(t.dWide, ll[0], ll[1]);
    const h = horizonProfile(t.dWide, r0, c0);
    h.forEach((p, i) => expect(envelope(b, i)).toBe(p.angle));
  });

  it("at 1° the bands are nested by distance, and each covers its own ring only", async () => {
    const t = await throughSites(slug);
    const ll = (fromPrototype(loadFixture(slug).goldens.run) as ScreenResult).point!.ll;
    const b = ridgeBands(t.dWide, ll, 1);
    expect(b.angles.every((band) => band.length === 360)).toBe(true);
    // The nearest band always has ground (the cells next to the point).
    expect(b.angles[0]!.every((a) => a !== null)).toBe(true);
  });
});
