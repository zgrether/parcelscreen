// Schema v2 is frozen (step 18b; owner, 2026-10-07). It stayed open through Phase 0 so report blocks could add
// run params; from here, any change to the stored ScreenResult's shape is version 3 plus a migration of the
// results already kept (CLAUDE.md). These tests fail on any added, removed or retyped field.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { SCREEN_SCHEMA_VERSION, ScreenResultSchema } from "./types";

describe("ScreenResult schema v2, frozen", () => {
  it("is version 2", () => {
    expect(SCREEN_SCHEMA_VERSION).toBe(2);
  });

  it("has the recorded shape (the committed JSON Schema snapshot)", async () => {
    const shape = JSON.stringify(z.toJSONSchema(ScreenResultSchema, { unrepresentable: "any" }), null, 2);
    await expect(shape + "\n").toMatchFileSnapshot("__snapshots__/screen-result-v2.schema.json");
  });
});
