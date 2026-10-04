import { describe, expect, it } from "vitest";
import { SCREEN_SCHEMA_VERSION } from "./index";

describe("lib/screen", () => {
  it("pins the result schema version", () => {
    expect(SCREEN_SCHEMA_VERSION).toBe(1);
  });

  it("runs in Node, not a browser", () => {
    expect(typeof (globalThis as { document?: unknown }).document).toBe("undefined");
  });
});
