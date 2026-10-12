// Schema v5 is frozen (follow-up 34; owner, 2026-10-12), as v4 was from VR3a. v5 was a clean break like v3 and v4:
// stored v4 results aren't read or migrated, their parcels re-screen when opened (phase-0.md §9.26, §9.30, §9.32). From
// here, any change to the stored ScreenResult's shape is version 6, with a migration or a clean break (CLAUDE.md).
// These tests fail on any added, removed or retyped field.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { SCREEN_SCHEMA_VERSION, ScreenResultSchema } from "./types";

describe("ScreenResult schema v5, frozen", () => {
  it("is version 5", () => {
    expect(SCREEN_SCHEMA_VERSION).toBe(5);
  });

  it("has the recorded shape (the committed JSON Schema snapshot)", async () => {
    const shape = JSON.stringify(z.toJSONSchema(ScreenResultSchema, { unrepresentable: "any" }), null, 2);
    await expect(shape + "\n").toMatchFileSnapshot("__snapshots__/screen-result-v5.schema.json");
  });
});
