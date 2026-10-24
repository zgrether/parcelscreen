/** Garden, orchard, animals' yes / maybe / no (step 14 §3.1, §11). */
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { point, synthetic } from "@/test/support/uses";
import type { Mark } from "../report/marks";
import type { PartialScreenResult } from "../screen/types";
import { garden } from "./garden";

const MUD = expectedOf("grayson-mud-creek-6273", "run");
const plot = (acres: number, aboveFt: number) => ({ ...MUD.gardens![0]!, acres, aboveFt });
const cover = (openGentleAc: number) => ({
  forestPct: 50,
  openPct: 10,
  openGentleAc,
  openNearRoadAc: 0,
  year: 2021,
});
const streams = (perennialFt: number, names: string[] = []) => ({
  perennialFt,
  intermittentFt: 0,
  names,
  nearestFt: 100,
});
const r = (over: Partial<PartialScreenResult>): PartialScreenResult => ({
  ...MUD,
  gardens: [plot(0.6, 300)],
  cover: cover(0.2),
  streams: streams(0),
  ...over,
});
const at = (result: PartialScreenResult, marks: Mark[] = []) => garden(synthetic(result, {}, { marks }));
const ll = MUD.sites![0]!.ll;

describe("Garden, orchard, animals", () => {
  it("a garden out of the frost pocket with water: yes, the water named", () => {
    expect(at(r({}), [point("spring", ll)])).toMatchObject({
      answer: "yes",
      reason: "A 0.60 ac garden out of the frost pocket, with water (your spring)",
    });
    expect(at(r({}), [point("stream", ll)]).reason).toMatch(/\(your stream\)$/);
    expect(at(r({}), [point("well", ll)]).reason).toMatch(/\(your well\)$/);
    expect(at(r({ streams: streams(800, ["Mud Creek"]) })).reason).toMatch(
      /\(a year-round stream: Mud Creek\)$/,
    );
  });

  it("room for animals too: said after the garden", () => {
    expect(at(r({ cover: cover(3) }), [point("well", ll)]).reason).toBe(
      "A 0.60 ac garden out of the frost pocket, with water (your well); 3.0 ac of open gentle ground for animals",
    );
  });

  it("no garden, but 2 ac of open gentle ground with water: yes, for animals", () => {
    expect(at(r({ gardens: [], cover: cover(2.5) }), [point("spring", ll)])).toMatchObject({
      answer: "yes",
      reason: "2.5 ac of open gentle ground for animals, with water (your spring)",
    });
  });

  it("a garden but no water, or in the frost pocket: maybe", () => {
    expect(at(r({}))).toMatchObject({
      answer: "maybe",
      reason:
        "Garden ground, but no water found: no spring, stream or well marked, and no year-round stream mapped",
    });
    // An intermittent stream isn't water for a garden.
    expect(at(r({ streams: { ...streams(0), intermittentFt: 900 } })).answer).toBe("maybe");
    expect(at(r({ gardens: [plot(0.6, 40)] }), [point("spring", ll)])).toMatchObject({
      answer: "maybe",
      reason: "The garden ground is in a frost pocket",
    });
  });

  it("no garden, 0.5 to 2 ac open: maybe, room for small stock", () => {
    expect(at(r({ gardens: [], cover: cover(1.2) }))).toMatchObject({
      answer: "maybe",
      reason: "Room for small stock (1.2 ac of open gentle ground)",
    });
  });

  it("no garden and under 0.5 ac open: no", () => {
    expect(at(r({ gardens: [], cover: cover(0.3) }))).toMatchObject({
      answer: "no",
      reason: "No garden ground, and under 0.50 ac of open ground",
    });
  });

  it("what didn't load: maybe, said", () => {
    expect(at(r({ streams: undefined }))).toMatchObject({
      answer: "maybe",
      reason: "Garden ground, but mapped streams didn't load: water not known",
    });
    expect(at(r({ gardens: [], cover: undefined }))).toMatchObject({
      answer: "maybe",
      reason: "Land cover didn't load: open ground not known",
    });
    expect(at(r({ gardens: undefined }))).toMatchObject({
      answer: "maybe",
      reason: "The terrain didn't load",
    });
  });
});
