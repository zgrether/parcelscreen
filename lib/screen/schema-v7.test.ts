// Schema v7 is frozen (follow-up 55; owner, #123, 2026-10-13), as v6 was from follow-up 54. v7 was a clean break like
// v3 to v6: stored v6 results aren't read or migrated, their parcels re-screen when opened (phase-0.md §9.26, §9.30,
// §9.32, §9.34, §9.37). From here, any change to the stored ScreenResult's shape is version 8, with a migration or a
// clean break (CLAUDE.md). These tests fail on any added, removed or retyped field.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { SCREEN_SCHEMA_VERSION, ScreenResultSchema } from "./types";

describe("ScreenResult schema v7, frozen", () => {
  it("is version 7", () => {
    expect(SCREEN_SCHEMA_VERSION).toBe(7);
  });

  it("has the recorded shape (the committed JSON Schema snapshot)", async () => {
    const shape = JSON.stringify(z.toJSONSchema(ScreenResultSchema, { unrepresentable: "any" }), null, 2);
    await expect(shape + "\n").toMatchFileSnapshot("__snapshots__/screen-result-v7.schema.json");
  });
});
