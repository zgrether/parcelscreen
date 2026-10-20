import { describe, expect, it } from "vitest";
import {
  askOf,
  bothLikeIt,
  EMPTY_HOUSEHOLD,
  readHousehold,
  takeOf,
  waitingFor,
  withAsk,
  withoutParcel,
  withTake,
} from "./takes";

const T = (n: number) => `2026-10-20T12:0${n}:00.000Z`;

describe("asks and takes (step 6 §4)", () => {
  it("an ask waits until a take made after it; asking again puts it back; a take without an ask is fine", () => {
    let h = withAsk(EMPTY_HOUSEHOLD, {
      parcel: "ferney",
      from: "zach",
      to: "julie",
      note: "The spring?",
      at: T(1),
    });
    expect([...waitingFor(h, "julie")]).toEqual(["ferney"]);
    expect(waitingFor(h, "zach").size).toBe(0);
    h = withTake(h, { parcel: "ferney", by: "julie", answer: "maybe", comment: "Steep", at: T(2) });
    expect(waitingFor(h, "julie").size).toBe(0);
    expect(takeOf(h, "ferney", "julie")?.answer).toBe("maybe");
    h = withAsk(h, { parcel: "ferney", from: "zach", to: "julie", note: "Again?", at: T(3) });
    expect(h.asks).toHaveLength(1);
    expect(askOf(h, "ferney", "julie")?.note).toBe("Again?");
    expect([...waitingFor(h, "julie")]).toEqual(["ferney"]);
    // Changing a take replaces it.
    h = withTake(h, { parcel: "ferney", by: "julie", answer: "yes", comment: "", at: T(4) });
    expect(h.takes).toHaveLength(1);
    expect(waitingFor(h, "julie").size).toBe(0);
    h = withTake(h, { parcel: "macks", by: "zach", answer: "no", comment: "", at: T(5) });
    expect(h.takes).toHaveLength(2);
  });

  it("removing a parcel takes its asks and takes", () => {
    let h = withAsk(EMPTY_HOUSEHOLD, { parcel: "ferney", from: "zach", to: "julie", note: "", at: T(1) });
    h = withTake(h, { parcel: "ferney", by: "julie", answer: "yes", comment: "", at: T(2) });
    h = withTake(h, { parcel: "macks", by: "julie", answer: "yes", comment: "", at: T(2) });
    const after = withoutParcel(h, "ferney");
    expect(after.asks).toEqual([]);
    expect(after.takes.map((t) => t.parcel)).toEqual(["macks"]);
  });

  it("both like it: no No, and every graded member C or better", () => {
    const h = withTake(EMPTY_HOUSEHOLD, {
      parcel: "macks",
      by: "julie",
      answer: "no",
      comment: "",
      at: T(1),
    });
    expect(bothLikeIt(h, "ferney", ["B", "C"])).toBe(true);
    expect(bothLikeIt(h, "ferney", ["B", "D"])).toBe(false);
    expect(bothLikeIt(h, "ferney", ["A", null])).toBe(true); // a member without priorities is left out
    expect(bothLikeIt(h, "ferney", [null, null])).toBe(false);
    expect(bothLikeIt(h, "macks", ["A", "A"])).toBe(false);
  });

  it("reads the stored document, or nothing", () => {
    expect(readHousehold(JSON.stringify(EMPTY_HOUSEHOLD))).toEqual(EMPTY_HOUSEHOLD);
    expect(readHousehold("{")).toBeNull();
    expect(readHousehold(JSON.stringify({ v: 2 }))).toBeNull();
  });
});
