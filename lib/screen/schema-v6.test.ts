// Schema v6 is frozen (follow-up 54; owner, #123, 2026-10-13), as v5 was from follow-up 34. v6 was a clean break like
// v3, v4 and v5: stored v5 results aren't read or migrated, their parcels re-screen when opened (phase-0.md §9.26,
// §9.30, §9.32, §9.34). From here, any change to the stored ScreenResult's shape is version 7, with a migration or a
// clean break (CLAUDE.md). These tests fail on any added, removed or retyped field.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { SCREEN_SCHEMA_VERSION, ScreenResultSchema } from "./types";

describe("ScreenResult schema v6, frozen", () => {
  it("is version 6", () => {
    expect(SCREEN_SCHEMA_VERSION).toBe(6);
  });

  it("has the recorded shape (the committed JSON Schema snapshot)", async () => {
    const shape = JSON.stringify(z.toJSONSchema(ScreenResultSchema, { unrepresentable: "any" }), null, 2);
    await expect(shape + "\n").toMatchFileSnapshot("__snapshots__/screen-result-v6.schema.json");
  });
});
