// A Settings change reaches the screen (step 16a, plan §5): the same parcel, the same recorded data, a
// different threshold, a different result. The defaults' own parity runs are in screen.test.ts.
import { describe, expect, it } from "vitest";
import { createHttpClient } from "@/lib/http";
import { DEFAULT_USER_CONFIG } from "@/lib/screen/config";
import { screen } from "@/lib/screen";
import type { UserConfig } from "@/lib/screen/types";
import { loadFixture } from "@/test/support/fixtures";
import { instantClock } from "@/test/support/pipeline";

const fx = loadFixture("ferney-creek-52-47A");
const run = async (config: UserConfig) =>
  (
    await screen({ polygon: fx.input.polygon.geometry, config }, undefined, {
      http: createHttpClient({
        env: "node",
        fetchImpl: fx.replayFetch() as unknown as typeof fetch,
        clock: instantClock(),
      }),
      sleep: async () => {},
    })
  ).result;

describe("changing a threshold changes the result (Ferney Creek)", () => {
  it("a higher house-site score leaves less house-site ground, in smaller pieces", async () => {
    const area = (r: Awaited<ReturnType<typeof run>>) =>
      (r.sites ?? []).filter((s) => !s.compact).reduce((a, s) => a + s.acres, 0);
    const r60 = await run(DEFAULT_USER_CONFIG);
    const r75 = await run({ ...DEFAULT_USER_CONFIG, houseMin: 75 });
    const r90 = await run({ ...DEFAULT_USER_CONFIG, houseMin: 90 });
    // Not fewer sites: the 18.8 ac site breaks up, and shelves rank as compact sites instead.
    expect(area(r75)).toBeLessThan(area(r60));
    expect(area(r90)).toBeLessThan(area(r75));
    expect(Math.max(...r75.sites!.map((s) => s.acres))).toBeLessThan(
      Math.max(...r60.sites!.map((s) => s.acres)),
    );
    expect(r75.params).not.toEqual(r60.params);
  }, 300_000);
});
