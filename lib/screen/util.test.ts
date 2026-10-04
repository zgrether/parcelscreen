import { describe, expect, it } from "vitest";
import { clamp, lerp, quantile } from "./util";

const SLOPE = [
  [6, 100],
  [10, 75],
  [14, 50],
  [18, 25],
  [22, 0],
] as const;

describe("lerp (the prototype's breakpoint curves)", () => {
  it("clamps below the first and above the last breakpoint", () => {
    expect(lerp(0, SLOPE)).toBe(100);
    expect(lerp(40, SLOPE)).toBe(0);
  });
  it("hits breakpoints exactly and interpolates between them", () => {
    expect(lerp(10, SLOPE)).toBe(75);
    expect(lerp(12, SLOPE)).toBe(62.5);
    expect(lerp(20, SLOPE)).toBe(12.5);
  });
});

describe("quantile", () => {
  it("takes the element at floor(p·n), like the prototype (no interpolation)", () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(quantile(xs, 0.5)).toBe(6);
    expect(quantile(xs, 0.9)).toBe(10);
    expect(quantile(xs, 1)).toBe(10);
    expect(quantile(new Float32Array([3, 4]), 0)).toBe(3);
  });
});

describe("clamp", () => {
  it("bounds a value", () => {
    expect(clamp(-1, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
    expect(clamp(2, 0, 1)).toBe(1);
  });
});
