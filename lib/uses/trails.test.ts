/** Trails and walking woods' yes / maybe / no (step 14 §3.1, §2.2, §11). */
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { synthetic } from "@/test/support/uses";
import { trails } from "./trails";

const MUD = expectedOf("grayson-mud-creek-6273", "run");
const at = (miles: number, gentleAc = 8) => trails(synthetic({ ...MUD, trails: { gentleAc, miles } }));

describe("Trails and walking woods", () => {
  it("from 0.5 mi: yes, the estimate said with its spacing", () => {
    expect(at(1.4)).toMatchObject({
      answer: "yes",
      reason: "About 1.4 mi of trail on 8.0 ac of gentle ground, at a walking path every 100 ft",
    });
    expect(at(0.5).answer).toBe("yes");
  });

  it("0.2 to 0.5 mi: maybe", () => {
    expect(at(0.3, 2)).toMatchObject({
      answer: "maybe",
      reason: "About 0.3 mi of trail on 2.0 ac of gentle ground, at a walking path every 100 ft",
    });
    expect(at(0.2).answer).toBe("maybe");
  });

  it("under 0.2 mi: no, mostly steeper than 15%", () => {
    expect(at(0.19)).toMatchObject({ answer: "no", reason: "Mostly steeper than 15%" });
  });

  it("not measured (a screen made before it): maybe, said, with how it's estimated", () => {
    const a = trails(synthetic({ ...MUD, trails: undefined }));
    expect(a).toMatchObject({ answer: "maybe", reason: "The trail estimate wasn't measured: grade again" });
    expect(a.decides[0]!.value).toMatch(/^The lidar's ground at 15% or less, leaving out drainages/);
  });
});
