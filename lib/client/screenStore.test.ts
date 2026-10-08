import { describe, expect, it } from "vitest";
import { ENGINE_VERSION } from "@/lib/screen/engine";
import type { ScreenResult } from "@/lib/screen/types";
import { expectedOf } from "@/test/support/expected";
import {
  EARLIER_RULES,
  engineOf,
  fromEarlierRules,
  ScreenRecordSchema,
  type ScreenRecord,
} from "./screenStore";

const record = (engine?: number): ScreenRecord => ({
  id: "s1",
  keys: { boundary: "b", house: "", settings: "s" },
  result: expectedOf("ferney-creek-52-47A", "run") as ScreenResult,
  ...(engine === undefined ? {} : { engine }),
});

describe("the engine stamp on a kept screen (Batch A §6)", () => {
  it("Phase 0's rules are version 1, and a screen kept before the stamp counts as 1", () => {
    expect(ENGINE_VERSION).toBe(1);
    expect(engineOf(record())).toBe(1);
    expect(engineOf(record(3))).toBe(3);
  });

  it("is from earlier rules only below the current version", () => {
    expect(fromEarlierRules(record())).toBe(false); // today: 1 against 1
    expect(fromEarlierRules(record(), 2)).toBe(true); // after A2a's bump
    expect(fromEarlierRules(record(2), 2)).toBe(false);
    expect(fromEarlierRules(record(1), 5)).toBe(true);
  });

  it("the record schema keeps the stamp, and still reads a record without one", () => {
    expect(ScreenRecordSchema.parse(record(2)).engine).toBe(2);
    expect(ScreenRecordSchema.parse(record()).engine).toBeUndefined();
    expect(ScreenRecordSchema.safeParse(record(0)).success).toBe(false);
    expect(ScreenRecordSchema.safeParse({ ...record(), engine: 1.5 }).success).toBe(false);
  });

  it("says it in the owner's words", () => {
    expect(EARLIER_RULES).toBe("Screened with earlier rules — run again for current results");
  });
});
