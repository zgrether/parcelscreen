// Schema v8 is frozen (step 1 plan §3.3; owner, 2026-10-16), as v7 was from follow-up 55. v8 is a clean break like
// v3 to v7: stored v7 results aren't read or migrated, their parcels re-screen when opened (phase-0.md §9.26, §9.30,
// §9.32, §9.34, §9.37, §9.44). v8 stores measurements and no grades: the sky read at each spot, its soil's key and
// NRCS's slope-free ratings, its chosen driveway's facts and the run's thresholds arrive; the scores, flags and
// verdict leave, derived on display (derive.ts, flags.ts). From here, any change to the stored ScreenResult's shape is
// version 9, with a migration or a clean break (CLAUDE.md). These tests fail on any added, removed or retyped field.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { SCREEN_SCHEMA_VERSION, ScreenResultSchema } from "./types";

describe("ScreenResult schema v8, frozen", () => {
  it("is version 8", () => {
    expect(SCREEN_SCHEMA_VERSION).toBe(8);
  });

  it("has the recorded shape (the committed JSON Schema snapshot)", async () => {
    const shape = JSON.stringify(z.toJSONSchema(ScreenResultSchema, { unrepresentable: "any" }), null, 2);
    await expect(shape + "\n").toMatchFileSnapshot("__snapshots__/screen-result-v8.schema.json");
  });
});
