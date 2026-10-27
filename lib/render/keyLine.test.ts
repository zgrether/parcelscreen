/** The map's key line (UX part 2 PR 3b2). */
import { describe, expect, it } from "vitest";
import { keyEntries } from "./keyLine";

const none = { bestPin: false, route: false, yourRoute: false, fan: false, allPins: false };

describe("keyEntries", () => {
  it("names what's drawn, in the map's order", () => {
    expect(keyEntries({ ...none, bestPin: true, route: true, fan: true })).toEqual([
      "best",
      "driveway",
      "fan",
    ]);
  });

  it("the household's chosen line is Your route, as the map's tip says", () => {
    expect(keyEntries({ ...none, route: true, yourRoute: true })).toEqual(["yourRoute"]);
  });

  it("no best pin with a house marked; nothing drawn, nothing named", () => {
    expect(keyEntries({ ...none, route: true })).toEqual(["driveway"]);
    expect(keyEntries(none)).toEqual([]);
  });

  it("every pin on says so", () => {
    expect(keyEntries({ ...none, bestPin: true, allPins: true })).toEqual(["best", "allPins"]);
  });

  it("names the driveway's other lines and Stand here as they show (polish 2, M2)", () => {
    expect(
      keyEntries({ ...none, bestPin: true, standHere: true, route: true, second: true, direct: true }),
    ).toEqual(["best", "standHere", "driveway", "second", "direct"]);
    expect(keyEntries({ ...none, over: true })).toEqual(["over"]);
  });
});
