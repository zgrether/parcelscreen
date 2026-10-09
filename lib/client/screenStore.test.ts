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
  it("Phase 0's rules are version 1, A2a's 2, A2b's 3, A2c's 4, A3's 5, and a screen kept before the stamp counts as 1", () => {
    expect(ENGINE_VERSION).toBe(5); // A3 (scoring: 19, soils without slope, rock by depth, sky dome, driveway cost)
    expect(engineOf(record())).toBe(1);
    expect(engineOf(record(3))).toBe(3);
  });

  it("is from earlier rules only below the current version", () => {
    expect(fromEarlierRules(record())).toBe(true); // a Phase 0 screen, after A2a's bump
    expect(fromEarlierRules(record(2))).toBe(true); // A2a's rules, after A2b's bump
    expect(fromEarlierRules(record(3))).toBe(true); // A2b's rules, after A2c's bump
    expect(fromEarlierRules(record(4))).toBe(true); // A2c's rules, after A3's bump
    expect(fromEarlierRules(record(5))).toBe(false); // screened with A3's rules
    expect(fromEarlierRules(record(), 1)).toBe(false); // against Phase 0's rules
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
