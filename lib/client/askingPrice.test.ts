import { describe, expect, it } from "vitest";
import { askingLine, parsePrice, shortPrice } from "./askingPrice";

describe("the asking price (owner, #101, 2026-10-11)", () => {
  it("reads dollars as people type them", () => {
    expect(parsePrice("185000")).toBe(185_000);
    expect(parsePrice("$185,000")).toBe(185_000);
    expect(parsePrice(" 185k ")).toBe(185_000);
    expect(parsePrice("1.2M")).toBe(1_200_000);
    expect(parsePrice("")).toBeNull();
    expect(parsePrice("about 185")).toBeUndefined();
    expect(parsePrice("-5")).toBeUndefined();
  });

  it("shows the sheet's line with its date, and History's short form", () => {
    expect(askingLine(185_000, "2026-10-11T12:00:00.000Z")).toBe("asking $185,000 as of Oct 11, 2026");
    expect([shortPrice(185_000), shortPrice(92_500), shortPrice(1_250_000), shortPrice(900)]).toEqual([
      "$185k",
      "$92.5k",
      "$1.25M",
      "$900",
    ]);
  });
});
