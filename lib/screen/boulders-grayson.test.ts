/**
 * Boulder potential's sanity test (docs/plans/boulders.md §1): Grayson Highlands' boulder field, north of Massie Gap,
 * reads as rough ground. Replays the recording `pnpm record:boulders` made on CI's runners
 * (test/fixtures/boulders-grayson/network.har); skipped until it exists.
 */
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BOULDERS_HAR, graysonReplay, readGraysonBoulders } from "../../test/support/bouldersGrayson";

describe.runIf(existsSync(BOULDERS_HAR))("Grayson Highlands' boulder field", () => {
  it("reads rough lidar texture: at least one patch of possible boulders", async () => {
    const { d, boulders } = await readGraysonBoulders(graysonReplay(), true);
    expect(d.source).toBe("USGS 3DEP");
    expect(boulders.rough).not.toBeNull();
    expect(boulders.rough!.patches.length).toBeGreaterThan(0);
    expect(boulders.acres).toBeGreaterThanOrEqual(boulders.rough!.acres);
  }, 60_000);
});
