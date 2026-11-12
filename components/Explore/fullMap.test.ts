import { describe, expect, it } from "vitest";
import { fullMapReducer, type FullMapEvent } from "./fullMap";

const free = { busy: false };
const busy = { busy: true };
const tap = (closedSomething = false): FullMapEvent => ({ type: "emptyTap", closedSomething });

describe("full-map mode (map-room plan §5; Zach's option A)", () => {
  it("an empty tap toggles it: on, then off", () => {
    expect(fullMapReducer(false, tap(), free)).toBe(true);
    expect(fullMapReducer(true, tap(), free)).toBe(false);
  });

  it("a tap that closed something (a tip, the Key, a popup) only closes it", () => {
    expect(fullMapReducer(false, tap(true), free)).toBe(false);
    expect(fullMapReducer(true, tap(true), free)).toBe(true);
  });

  it("never while Edit or a tool is in use", () => {
    expect(fullMapReducer(false, tap(), busy)).toBe(false);
    expect(fullMapReducer(false, { type: "hide" }, busy)).toBe(false);
  });

  it("a swipe down on the line hides; a swipe up, restore or the end of it shows", () => {
    expect(fullMapReducer(false, { type: "hide" }, free)).toBe(true);
    expect(fullMapReducer(true, { type: "hide" }, free)).toBe(true);
    for (const type of ["show", "end"] as const) expect(fullMapReducer(true, { type }, free)).toBe(false);
  });
});
