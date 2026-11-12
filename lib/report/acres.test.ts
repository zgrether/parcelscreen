import { describe, expect, it } from "vitest";
import { acresLabel } from "./acres";

describe("acresLabel (map-room, Zach's #427 answer 4)", () => {
  it("a recorded survey's acres first, as recorded", () => {
    expect(acresLabel(93.97, 95.12)).toBe("93.97 surveyed ac");
    expect(acresLabel(44.2, 43.88)).toBe("44.2 surveyed ac");
  });

  it("otherwise the boundary's, named as the report names them", () => {
    expect(acresLabel(null, 43.876)).toBe("43.88 boundary ac");
    expect(acresLabel(undefined, 30.15)).toBe("30.15 boundary ac");
    expect(acresLabel(0, 30.15)).toBe("30.15 boundary ac");
  });

  it("neither: nothing", () => {
    expect(acresLabel(null, null)).toBeNull();
  });
});
