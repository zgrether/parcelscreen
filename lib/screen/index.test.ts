import { describe, expect, it } from "vitest";
import { SCREEN_SCHEMA_VERSION } from "./index";

describe("lib/screen", () => {
  it("pins the result schema version", () => {
    // 2: the run's report settings (`params`), step 14 plan Q1. 3: the clean break (B2a, phase-0.md §9.26).
    expect(SCREEN_SCHEMA_VERSION).toBe(5); // 4: VR3a (§9.31); 5: drawn lines, follow-up 34 (§9.32)
  });

  it("runs in Node, not a browser", () => {
    expect(typeof (globalThis as { document?: unknown }).document).toBe("undefined");
  });
});
