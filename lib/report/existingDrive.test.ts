/**
 * The existing-drive follow-up (owner, 10/21; phase-0.md §9.65): Ready to build upgrades the drawn drive a route starts
 * from, by its condition, and paves its steep stretches at Settings' threshold when its profile was kept. The Driveway
 * section's Upgrade row and the breakdown give the same length. A synthetic parcel: Mud Creek with an 870 ft pioneer
 * drive at the route's start.
 */
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { DEFAULT_RATES, type Paving } from "../config/costs";
import type { PartialScreenResult } from "../screen/types";
import { M2FT } from "../screen/util";
import { COST_NOTES, costToEnjoy, type CostLine } from "./cost";
import { drivewayView } from "./driveway";

const LENGTH_FT = 870;
const LENGTH_M = LENGTH_FT / M2FT;
/** Every 3 m: 8% for 90 m, 16% for the next 90 m, then 13% to the end. */
function profile(): [number, number][] {
  const out: [number, number][] = [];
  let z = 0;
  for (let d = 0; d <= LENGTH_M; d += 3) {
    out.push([d, Number(z.toFixed(3))]);
    z += 3 * (d < 90 ? 0.08 : d < 180 ? 0.16 : 0.13);
  }
  return out;
}

/** Mud Creek with a drawn drive (line 0) that its scored route starts from; `kept` false: a screen saved before. */
function withDrive(kept = true): PartialScreenResult {
  const r = structuredClone(expectedOf("grayson-mud-creek-6273", "run"));
  r.lines = [
    {
      id: "drive-1",
      kind: "track",
      lengthFt: LENGTH_FT,
      widthFt: null,
      outsideFt: 0,
      gradedFt: LENGTH_FT,
      avgGradePct: 12,
      maxGradePct: 16,
    },
  ];
  const rt = r.driveway!.routes[0]!;
  rt.existing = {
    line: 0,
    lengthFt: LENGTH_FT,
    maxGradePct: 16,
    avgGradePct: 12,
    limitPct: 15,
    vetoPct: 25,
    pavedFt: 500,
    reliefCulverts: 3,
    stoneTons: 200,
    outsideFt: 0,
    cost: { mid: 20_000, low: 14_000, high: 26_000 },
    ...(kept ? { profile: profile() } : {}),
  };
  return r;
}

const DRIVE: CostLine = { id: "drive-1", kind: "drive", condition: "pioneer", line: [], recordedIn: "" };

function build(r: PartialScreenResult, paving: Paving, lines: CostLine[] = [DRIVE]) {
  const c = costToEnjoy({ result: r, lines, marks: [], askingPrice: 185_000, rates: DEFAULT_RATES, paving });
  if (c?.kind !== "priced") throw new Error("not priced");
  return {
    build: c.build,
    camp: c.camp,
    drive: c.build.items.find((i) => i.label.startsWith("Upgrade the existing drive"))!,
  };
}

/** The Upgrade row's value in the Driveway section, at this paving. */
const upgradeRow = (r: PartialScreenResult, paving: Paving, lines: CostLine[] = [DRIVE]) =>
  drivewayView(r, undefined, null, { paving, lines })!.routes[0]!.rows.find((x) =>
    x.label.startsWith("Upgrade existing drive"),
  )!.value;
const ftIn = (s: string): number => Number(/([\d,]+) ft over/.exec(s)![1]!.replace(/,/g, ""));

describe("the existing drive in Ready to build", () => {
  it("upgrades it by its condition, and paves its steep stretches at 12%: the Upgrade row says the same length", () => {
    const { drive } = build(withDrive(), { on: true, abovePct: 12 });
    expect(drive.label).toBe("Upgrade the existing drive, 870 ft (pioneer)");
    expect(drive.parts.map((p) => p.rate)).toEqual(["driveway.upgrade.pioneer", "driveway.paving"]);
    expect(drive.parts[0]!.qty.low).toBeCloseTo(LENGTH_FT, 6);
    const paved = drive.parts[1]!.qty.low;
    expect(Math.round(paved)).toBe(ftIn(upgradeRow(withDrive(), { on: true, abovePct: 12 })));
    expect(upgradeRow(withDrive(), { on: true, abovePct: 12 })).toMatch(
      /, ~[\d,]+ ft over 12% to pave \(cost TBD\)/,
    );
  });

  it("at 15%, a shorter length, the same in both", () => {
    const at12 = build(withDrive(), { on: true, abovePct: 12 }).drive.parts[1]!.qty.low;
    const { drive } = build(withDrive(), { on: true, abovePct: 15 });
    const at15 = drive.parts[1]!.qty.low;
    expect(at15).toBeLessThan(at12);
    expect(Math.round(at15)).toBe(ftIn(upgradeRow(withDrive(), { on: true, abovePct: 15 })));
  });

  it("with paving off: steep gravel, no paving cost; the Upgrade row says so with the same length", () => {
    const { drive } = build(withDrive(), { on: false, abovePct: 12 });
    expect(drive.parts.map((p) => p.rate)).toEqual(["driveway.upgrade.pioneer"]);
    expect(drive.notes).toEqual([COST_NOTES.steepGravel]);
    const row = upgradeRow(withDrive(), { on: false, abovePct: 12 });
    expect(row).toMatch(/, [\d,]+ ft over 12%: steep gravel, more upkeep/);
    const at12 = build(withDrive(), { on: true, abovePct: 12 }).drive.parts[1]!.qty.low;
    expect(ftIn(row)).toBe(Math.round(at12));
  });

  it("a screen saved before the profile was kept: the upgrade still, no paving, and 'grade again'; the row's stored text", () => {
    const { drive } = build(withDrive(false), { on: true, abovePct: 12 });
    expect(drive.parts.map((p) => p.rate)).toEqual(["driveway.upgrade.pioneer"]);
    expect(drive.notes).toEqual(["Grade again to price paving on the existing drive"]);
    expect(upgradeRow(withDrive(false), { on: true, abovePct: 15 })).toContain(
      ", ~500 ft over 12% to pave (cost TBD)",
    );
  });

  it("by its condition: improved at the improved rate; paved costs nothing and paves nothing", () => {
    const improved = build(withDrive(), { on: true, abovePct: 12 }, [
      { ...DRIVE, condition: "improved" },
    ]).drive;
    expect(improved.parts[0]!.rate).toBe("driveway.upgrade.improved");
    const paved = build(withDrive(), { on: true, abovePct: 12 }, [{ ...DRIVE, condition: "paved" }]).drive;
    expect(paved.label).toBe("Upgrade the existing drive, 870 ft (paved)");
    expect(paved.total).toEqual({ low: 0, high: 0 });
    expect(
      upgradeRow(withDrive(), { on: true, abovePct: 12 }, [{ ...DRIVE, condition: "paved" }]),
    ).not.toContain("ft over");
  });

  it("leaves camp as it was: the drive is already there", () => {
    const plain = costToEnjoy({
      result: expectedOf("grayson-mud-creek-6273", "run"),
      lines: [],
      marks: [],
      askingPrice: 185_000,
      rates: DEFAULT_RATES,
    });
    const { camp } = build(withDrive(), { on: true, abovePct: 12 });
    expect(plain?.kind === "priced" && camp.items.map((i) => i.label)).toEqual(
      plain?.kind === "priced" && plain.camp.items.map((i) => i.label),
    );
  });
});
