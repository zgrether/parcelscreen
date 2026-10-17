// Schema v9 is frozen (step 2; owner, 2026-10-17), as v8 was from step 1. v9 is a clean break like v3 to v8: stored v8
// results aren't read or migrated, their parcels re-screen when opened (phase-0.md §9.26, §9.30, §9.32, §9.34, §9.37,
// §9.44, §9.49). v9 adds one optional field: a trailhead's `serves`, the Tennessee TREC trails merged into it. v8 stored
// measurements and no grades (step 1). From here, any change to the stored ScreenResult's shape is version 10, with a
// clean break (CLAUDE.md). These tests fail on any added, removed or retyped field.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { SCREEN_SCHEMA_VERSION, ScreenResultSchema } from "./types";

describe("ScreenResult schema v9, frozen", () => {
  it("is version 9", () => {
    expect(SCREEN_SCHEMA_VERSION).toBe(9);
  });

  it("has the recorded shape (the committed JSON Schema snapshot)", async () => {
    const shape = JSON.stringify(z.toJSONSchema(ScreenResultSchema, { unrepresentable: "any" }), null, 2);
    await expect(shape + "\n").toMatchFileSnapshot("__snapshots__/screen-result-v9.schema.json");
  });
});
