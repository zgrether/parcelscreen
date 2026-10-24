/** Garden, orchard, animals' yes / maybe / no (step 14 §3.1, §11; owner, after #312: the water's source is named). */
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
  ponds: { count: 0, acres: 0, names: [] },
  ...over,
});
const at = (result: PartialScreenResult, marks: Mark[] = []) => garden(synthetic(result, {}, { marks }));
const ll = MUD.sites![0]!.ll;
const WELL = "from the well; no stream or spring mapped";

describe("Garden, orchard, animals", () => {
  it("a garden out of the frost pocket: yes, the water's source named, marks first", () => {
    expect(at(r({}), [point("spring", ll)])).toMatchObject({
      answer: "yes",
      reason: "A 0.60 ac garden out of the frost pocket, with water (your spring)",
    });
    expect(at(r({}), [point("stream", ll)]).reason).toContain("(your stream)");
    expect(at(r({}), [point("well", ll)]).reason).toContain("(your well)");
    const stream = at(r({ streams: streams(800, ["Mud Creek"]) }));
    expect(stream.reason).toBe(
      "A 0.60 ac garden out of the frost pocket, with water (a stream on the parcel)",
    );
    expect(stream.decides.find((f) => f.label === "Water")).toEqual({
      label: "Water",
      value: "a stream on the parcel (Mud Creek)",
      source: "USGS NHD flowlines",
    });
  });

  it("a pond on the parcel counts as water; with none mapped, the well", () => {
    const pond = at(r({ ponds: { count: 1, acres: 0.4, names: [] } }));
    expect(pond).toMatchObject({
      answer: "yes",
      reason: "A 0.60 ac garden out of the frost pocket, with water (a pond on the parcel)",
    });
    expect(pond.decides.find((f) => f.label === "Water")?.source).toBe("USGS NHD waterbodies");
    expect(at(r({}))).toMatchObject({
      answer: "yes",
      reason: `A 0.60 ac garden out of the frost pocket, with water (${WELL})`,
    });
    // An intermittent stream isn't a year-round source.
    expect(at(r({ streams: { ...streams(0), intermittentFt: 900 } })).reason).toContain(`(${WELL})`);
    // A grade from before ponds were read: the streams still decide.
    expect(at(r({ ponds: undefined })).reason).toContain(`(${WELL})`);
  });

  it("room for animals too: said after the garden", () => {
    expect(at(r({ cover: cover(3) }), [point("well", ll)]).reason).toBe(
      "A 0.60 ac garden out of the frost pocket, with water (your well); 3.0 ac of open gentle ground for animals",
    );
  });

  it("no garden, but 2 ac of open gentle ground: yes, for animals, the water named", () => {
    expect(at(r({ gardens: [], cover: cover(2.5) }), [point("spring", ll)])).toMatchObject({
      answer: "yes",
      reason: "2.5 ac of open gentle ground for animals, with water (your spring)",
    });
    expect(at(r({ gardens: [], cover: cover(2.5) }))).toMatchObject({
      answer: "yes",
      reason: `2.5 ac of open gentle ground for animals, with water (${WELL})`,
    });
  });

  it("the garden ground in a frost pocket: maybe", () => {
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

  it("what didn't load: said", () => {
    expect(at(r({ streams: undefined }))).toMatchObject({
      answer: "yes",
      reason:
        "A 0.60 ac garden out of the frost pocket, with water (from the well; mapped streams didn't load)",
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
