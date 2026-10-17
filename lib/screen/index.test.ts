import { describe, expect, it } from "vitest";
import { SCREEN_SCHEMA_VERSION } from "./index";

describe("lib/screen", () => {
  it("pins the result schema version", () => {
    // 2: the run's report settings (`params`), step 14 plan Q1. 3: the clean break (B2a, phase-0.md §9.26).
    // 4: VR3a (§9.31); 5: drawn lines, follow-up 34 (§9.32); 6: drives from the driveway entrance, follow-up 54 (§9.34);
    // 7: the entrance road's class, follow-up 55 (§9.37); 8: measurements, no grades (step 1, §9.44); 9: the TREC
    // trails a trailhead serves (step 2, §9.49)
    expect(SCREEN_SCHEMA_VERSION).toBe(9);
  });

  it("runs in Node, not a browser", () => {
    expect(typeof (globalThis as { document?: unknown }).document).toBe("undefined");
  });
});
