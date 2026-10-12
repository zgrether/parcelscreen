// Schema v4 is frozen (VR3a; owner, 2026-10-12), as v3 was from B2a. v4 was a clean break like v3: stored v3 results
// aren't read or migrated, their parcels re-screen when opened (phase-0.md §9.26, §9.30, §9.31). From here, any change
// to the stored ScreenResult's shape is version 5, with a migration or a clean break (CLAUDE.md). These tests fail on
// any added, removed or retyped field.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { SCREEN_SCHEMA_VERSION, ScreenResultSchema } from "./types";

describe("ScreenResult schema v4, frozen", () => {
  it("is version 4", () => {
    expect(SCREEN_SCHEMA_VERSION).toBe(4);
  });

  it("has the recorded shape (the committed JSON Schema snapshot)", async () => {
    const shape = JSON.stringify(z.toJSONSchema(ScreenResultSchema, { unrepresentable: "any" }), null, 2);
    await expect(shape + "\n").toMatchFileSnapshot("__snapshots__/screen-result-v4.schema.json");
  });
});
