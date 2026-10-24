/** Ride, ski, snowshoe from home's yes / maybe / no (step 14 §3.1, §11). */
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { synthetic } from "@/test/support/uses";
import { LONG_TRAIL_DRIVES } from "../screen/longTrail";
import type { PartialScreenResult } from "../screen/types";
import { ride } from "./ride";

const MUD = expectedOf("grayson-mud-creek-6273", "run");
const trail = (mi: number) => ({ trail: "Virginia Creeper Trail", point: "Damascus", min: 10, mi });
const OPEN_NEXT_DOOR = {
  name: "Jefferson National Forest",
  manager: "USFS",
  type: "FED",
  access: "OA",
  gap: "3",
  adjoins: true,
  distFt: null,
};
const r = (over: Partial<PartialScreenResult>): PartialScreenResult => ({
  ...MUD,
  longTrail: trail(22),
  trails: { gentleAc: 1, miles: 0.1 },
  ...over,
});
const at = (result: PartialScreenResult) => ride(synthetic(result));
const PRIVATE = "; neighbours' land is private unless they agree";

describe("Ride, ski, snowshoe from home", () => {
  it("open public land next door, or a long trail within 3 mi: yes", () => {
    expect(at(r({ protected: [OPEN_NEXT_DOOR] }))).toMatchObject({
      answer: "yes",
      reason: `Adjoins open public land (Jefferson National Forest)${PRIVATE}`,
    });
    expect(at(r({ longTrail: trail(2.4) }))).toMatchObject({
      answer: "yes",
      reason: `The Virginia Creeper Trail at Damascus is 2.4 mi by road${PRIVATE}`,
    });
  });

  it("a long trail 3 to 10 mi, or gentle ground for your own loop: maybe", () => {
    expect(at(r({ longTrail: trail(7) }))).toMatchObject({
      answer: "maybe",
      reason: `The Virginia Creeper Trail at Damascus is 7.0 mi by road${PRIVATE}`,
    });
    expect(at(r({ trails: { gentleAc: 9, miles: 1.2 } }))).toMatchObject({
      answer: "maybe",
      reason: `Gentle ground for your own loop (about 1.2 mi of trail)${PRIVATE}`,
    });
  });

  it("neither: no, and still the corridors said", () => {
    expect(at(r({}))).toMatchObject({
      answer: "no",
      reason: `No public land next door, and the nearest long trail is 22 mi away by road${PRIVATE}`,
    });
    expect(at(r({ longTrail: null })).reason).toBe(
      `No public land next door, and no long trail within reach${PRIVATE}`,
    );
  });

  it("what didn't load: maybe, said", () => {
    expect(at(r({ protected: undefined }))).toMatchObject({
      answer: "maybe",
      reason: `Public land (PAD-US) didn't load${PRIVATE}`,
    });
    expect(at(r({ longTrail: undefined })).reason).toBe(`The drive to a long trail didn't load${PRIVATE}`);
    expect(at(r({ noResponse: [LONG_TRAIL_DRIVES] })).reason).toBe(
      `The drive to a long trail didn't load${PRIVATE}`,
    );
  });

  it("makes no snow claim", () => {
    expect(at(r({})).decides.find((f) => f.label === "Snow")?.value).toBe("snow cover isn't measured");
  });
});
