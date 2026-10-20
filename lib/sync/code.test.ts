import { describe, expect, it } from "vitest";
import { CODE_LENGTH, generateCode, groupCode, normalizeCode, spaceKeyOf } from "./code";

describe("a synced space's code (step 5 §1)", () => {
  it("is 26 Crockford base32 characters, 130 bits, with no I, L, O or U", () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateCode()));
    expect(codes.size).toBe(200);
    for (const c of codes) {
      expect(c).toHaveLength(CODE_LENGTH);
      expect(c).toMatch(/^[0-9A-HJKMNP-TV-Z]+$/);
    }
    // Each byte's low five bits pick its character.
    expect(generateCode((b) => b.map((_, i) => i))).toBe("0123456789ABCDEFGHJKMNPQRS");
  });

  it("reads what was typed or pasted: spaces, dashes and case ignored, look-alikes read as digits", () => {
    const code = "7KQ2MX9D4FA0B1C2D3E4F5G6H7";
    expect(normalizeCode(code)).toBe(code);
    expect(normalizeCode(groupCode(code))).toBe(code);
    expect(normalizeCode(" 7kq2m x9d4f-a0b1c 2d3e4 f5g6h 7 ")).toBe(code);
    expect(normalizeCode("7KQ2MX9D4FAOBIC2D3E4F5G6H7")).toBe(code); // O → 0, I → 1
    expect(normalizeCode("7KQ2MX9D4FA0BLC2D3E4F5G6H7")).toBe(code); // L → 1
    for (const bad of ["", "7KQ2M", `${code}X`, "7KQ2MX9D4FA0B1C2D3E4F5G6HU"])
      expect(normalizeCode(bad)).toBeNull();
  });

  it("groups by five for showing", () => {
    expect(groupCode("7KQ2MX9D4FA0B1C2D3E4F5G6H7")).toBe("7KQ2M-X9D4F-A0B1C-2D3E4-F5G6H-7");
  });

  it("keys the space by the code's SHA-256, never the code", async () => {
    const key = await spaceKeyOf("7KQ2MX9D4FA0B1C2D3E4F5G6H7");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).toBe(await spaceKeyOf("7KQ2MX9D4FA0B1C2D3E4F5G6H7"));
    expect(key).not.toBe(await spaceKeyOf("7KQ2MX9D4FA0B1C2D3E4F5G6H8"));
  });
});
