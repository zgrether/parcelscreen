import { describe, expect, it } from "vitest";
import { ENGINE_CURRENT_FROM, ENGINE_VERSION } from "@/lib/screen/engine";
import type { ScreenResult } from "@/lib/screen/types";
import { expectedOf } from "@/test/support/expected";
import {
  engineOf,
  fromEarlierRules,
  needsRescreen,
  RESCREEN_OFFLINE,
  RESCREENED,
  RESCREENS_ON_OPEN,
  ScreenRecordSchema,
  type ScreenRecord,
} from "./screenStore";

const record = (engine?: number): ScreenRecord => ({
  id: "s1",
  keys: { boundary: "b", house: "", settings: "s", lines: "" },
  result: expectedOf("ferney-creek-52-47A", "run") as ScreenResult,
  ...(engine === undefined ? {} : { engine }),
});

describe("the engine stamp on a kept screen (Batch A §6)", () => {
  it("Phase 0's rules are version 1, A2a's 2, A2b's 3, A2c's 4, A3's 5, A3b's 6, and a screen kept before the stamp counts as 1", () => {
    expect(ENGINE_VERSION).toBe(33); // step 14d's baked places (§9.73); 32 the frontage walked along the boundary, the ponds and the houses near the boundary (owner, after #312; §9.71); 31 step 14's cover, streams, trails and county (§9.70); 30 its power lines and frontage; 29 the ERs from CMS's list and the overrides (§9.69); 28 step 11's Long view past 3 mi (#273); 27 its Internet; 26 its Bike to a long trail; 25 its Long view; 24 its Privacy; 23 its Climate (§9.66); 22 schema v9 (step 2, §9.49)
    expect(engineOf(record())).toBe(1);
    expect(engineOf(record(3))).toBe(3);
  });

  it("is from earlier rules only below the current version", () => {
    expect(fromEarlierRules(record())).toBe(true); // a Phase 0 screen, after A2a's bump
    expect(fromEarlierRules(record(2))).toBe(true); // A2a's rules, after A2b's bump
    expect(fromEarlierRules(record(3))).toBe(true); // A2b's rules, after A2c's bump
    expect(fromEarlierRules(record(4))).toBe(true); // A2c's rules, after A3's bump
    expect(fromEarlierRules(record(5))).toBe(true); // A3's rules, after A3b's bump
    expect(fromEarlierRules(record(6))).toBe(true); // A3b's rules, after A4's bump
    expect(fromEarlierRules(record(7))).toBe(true); // A4's rules, after the #88 follow-up's bump
    expect(fromEarlierRules(record(8))).toBe(true); // the #88 follow-up's rules, after A4b's bump
    expect(fromEarlierRules(record(9))).toBe(true); // A4b's grade over 30 m, after the router's bump
    expect(fromEarlierRules(record(10))).toBe(true); // A4b PR B's router, after the #99 decisions' bump
    expect(fromEarlierRules(record(11))).toBe(true); // the #99 decisions' rules, after B2a's bump
    expect(fromEarlierRules(record(12))).toBe(true); // schema v3 (B2a), after the 15% default's bump
    expect(fromEarlierRules(record(13))).toBe(true); // the 15% default's rules, after VR3a's bump
    expect(fromEarlierRules(record(14))).toBe(true); // schema v4 (VR3a), after follow-up 34's bump
    expect(fromEarlierRules(record(15))).toBe(true); // schema v5 (follow-up 34), before the wider trailhead search
    expect(fromEarlierRules(record(16))).toBe(true); // the trailhead search out to 36 km (#118 review), before v6
    expect(fromEarlierRules(record(17))).toBe(true); // schema v6 (follow-up 54), before v7
    expect(fromEarlierRules(record(18))).toBe(true); // schema v7 (follow-up 55), before each site's own sky
    expect(fromEarlierRules(record(19))).toBe(true); // the sky at each site and the house (follow-up 58), before §9.43
    expect(fromEarlierRules(record(21))).toBe(true); // schema v8 (step 1), before v9
    expect(fromEarlierRules(record(22))).toBe(true); // schema v9 (step 2), current through step 11 (its bumps only added measurements)
    expect(fromEarlierRules(record(28))).toBe(true); // step 11's last, before §9.69's ERs changed the Hospital row
    expect(ENGINE_CURRENT_FROM).toBe(29); // §9.69 changed the Hospital row's numbers; §9.71 and §9.73 kept it
    expect(fromEarlierRules(record(ENGINE_VERSION))).toBe(false);
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
});

describe("re-screen on open (owner, #101, 2026-10-11)", () => {
  it("a parcel whose last screen is gone or from earlier rules re-screens; a current one, or no storage, doesn't", () => {
    expect(needsRescreen({ kind: "gone" })).toBe(true);
    expect(needsRescreen({ kind: "ok", record: record(ENGINE_CURRENT_FROM - 1) })).toBe(true);
    // Step 11: a screen from rules that only lacked a new measurement stays current.
    expect(needsRescreen({ kind: "ok", record: record(ENGINE_CURRENT_FROM) })).toBe(false);
    expect(needsRescreen({ kind: "ok", record: record() })).toBe(true); // unstamped: Phase 0's rules
    expect(needsRescreen({ kind: "ok", record: record(ENGINE_VERSION) })).toBe(false);
    expect(needsRescreen({ kind: "unavailable" })).toBe(false);
  });

  it("a v2 result doesn't read as a kept screen (v3's clean break): it's gone, not migrated", () => {
    const v2 = { ...record(ENGINE_VERSION), result: { ...record().result, schemaVersion: 2 } };
    expect(ScreenRecordSchema.safeParse(v2).success).toBe(false);
  });

  it('says it in the owner\'s words (the approved replacement of "Screened with earlier rules — run again")', () => {
    expect(RESCREENED).toBe("Graded again with the current rules");
    expect(RESCREEN_OFFLINE).toBe("Will grade again when you're back online");
    expect(RESCREENS_ON_OPEN).toBe("Grades again with the current rules when opened");
  });
});
