import { describe, expect, it } from "vitest";
import { prototypeFn, prototypeSource } from "./prototypeFns";

describe("prototype oracle", () => {
  it("extracts and runs a function declaration", () => {
    const bottomland = prototypeFn<(c: object) => string | null>("bottomland");
    expect(bottomland({ compname: "Codorus", drainagecl: "Poorly drained" })).toBe("Codorus: poorly drained");
  });
  it("extracts a one-line const", () => {
    expect(prototypeSource("lpMag")).toMatch(/^const lpMag=r=>22\.0-/);
  });
  it("fails loudly for an unknown name", () => {
    expect(() => prototypeSource("noSuchThing")).toThrow("not found");
  });
});
