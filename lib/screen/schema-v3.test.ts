// Schema v3 is frozen (B2a; owner, #101, 2026-10-11), as v2 was from step 18b. v3 was a clean break: stored v2
// results aren't read or migrated, their parcels re-screen (phase-0.md §9.26). From here, any change to the stored
// ScreenResult's shape is version 4 (CLAUDE.md). These tests fail on any added, removed or retyped field.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { SCREEN_SCHEMA_VERSION, ScreenResultSchema } from "./types";

describe("ScreenResult schema v3, frozen", () => {
  it("is version 3", () => {
    expect(SCREEN_SCHEMA_VERSION).toBe(3);
  });

  it("has the recorded shape (the committed JSON Schema snapshot)", async () => {
    const shape = JSON.stringify(z.toJSONSchema(ScreenResultSchema, { unrepresentable: "any" }), null, 2);
    await expect(shape + "\n").toMatchFileSnapshot("__snapshots__/screen-result-v3.schema.json");
  });
});
