// Schema v10 is frozen (the existing-house step; Zach, 11/11), as v9 was from step 2. v10 is a clean break like v3 to
// v9: stored v9 results aren't read or migrated, their parcels re-screen when opened (phase-0.md §9.26, §9.30, §9.32,
// §9.34, §9.37, §9.44, §9.49, §9.81). v10 adds one field: Paddling's other lakes (`paddling.others`), each by its
// quickest launch. From here, any change to the stored ScreenResult's shape is version 11, with a clean break
// (CLAUDE.md). These tests fail on any added, removed or retyped field.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { SCREEN_SCHEMA_VERSION, ScreenResultSchema } from "./types";

describe("ScreenResult schema v10, frozen", () => {
  it("is version 10", () => {
    expect(SCREEN_SCHEMA_VERSION).toBe(10);
  });

  it("has the recorded shape (the committed JSON Schema snapshot)", async () => {
    const shape = JSON.stringify(z.toJSONSchema(ScreenResultSchema, { unrepresentable: "any" }), null, 2);
    await expect(shape + "\n").toMatchFileSnapshot("__snapshots__/screen-result-v10.schema.json");
  });
});
