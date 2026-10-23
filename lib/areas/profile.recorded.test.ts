/**
 * Grayson Highlands profiled from a recording (step 13, docs/plans/step-13-area-catalog.md §10): the same code the
 * monthly refresh runs, offline, small (40 points, a 90 m DEM, land cover at 120 m). Re-record with
 * `pnpm areas:record` when the profiler's requests change.
 */
import { describe, expect, it } from "vitest";
import { instantClock } from "@/test/support/pipeline";
import { AREA_HAR, MUD_HAR, profileDeps, RECORDED } from "@/test/support/areaProfile";
import { createReplayFetch, loadHar } from "@/test/support/replayFetch";
import { AREAS } from "./catalog";
import { outlineOf } from "./outlines";
import { profileArea } from "./profile";
import { AreaFileSchema } from "./types";

async function run() {
  const har = { log: { entries: [...loadHar(MUD_HAR).log.entries, ...loadHar(AREA_HAR).log.entries] } };
  const deps = await profileDeps(createReplayFetch(har), instantClock(), RECORDED.today);
  const def = AREAS.find((a) => a.id === RECORDED.id)!;
  return profileArea(def, await outlineOf(def.id), deps, RECORDED.scale);
}

describe("Grayson Highlands, from its recording", () => {
  it("40 rural points, every one measured, and the file passes its schema", async () => {
    const { file, sample } = await run();
    AreaFileSchema.parse(file);
    expect(sample.points).toHaveLength(RECORDED.scale.points);
    expect(file.thin).toBe(false);
    // Public land and developed land were drawn and turned away.
    expect(sample.rejected.public).toBeGreaterThan(0);
    for (const col of Object.values(file.points)) expect(col).toHaveLength(RECORDED.scale.points);
    for (const [m, v] of Object.entries(file.medians)) expect(v, m).not.toBeNull();
  }, 60_000);

  it("high, dark and far from care, as the design doc says", async () => {
    const { file } = await run();
    const m = file.medians;
    expect(m.elevFt!).toBeGreaterThan(2500);
    expect(m.skyMag!).toBeGreaterThan(21);
    expect(m.erMin!).toBeGreaterThan(20);
    expect(m.airportMin!).toBeGreaterThan(45);
  }, 60_000);

  it("the same file twice", async () => {
    expect((await run()).file).toEqual((await run()).file);
  }, 120_000);
});
