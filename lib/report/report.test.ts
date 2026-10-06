import { describe, expect, it } from "vitest";
import { fromPrototype } from "@/test/support/fromPrototype";
import { loadFixture } from "@/test/support/fixtures";
import type { PartialScreenResult } from "../screen/types";
import { joinParts, onMap, said } from "./parts";
import { evaluationPoint } from "./point";
import { horizonChart } from "./sun";
import { terrainView } from "./terrain";
import { verdictView } from "./verdict";

const golden = fromPrototype(loadFixture("ferney-creek-52-47A").goldens.run);

describe("report text parts", () => {
  it("join back into the prototype's sentence, or without the parts that point at the map", () => {
    const parts = [
      said("The core is up from June to September"),
      onMap("; toggle the overlay on the map"),
      said("."),
    ];
    expect(joinParts(parts)).toBe("The core is up from June to September; toggle the overlay on the map.");
    expect(joinParts(parts, false)).toBe("The core is up from June to September.");
  });
});

describe("evaluationPoint", () => {
  it("is the result's focus with the point's numbers", () => {
    expect(evaluationPoint(golden)).toEqual({
      ll: golden.point!.ll,
      label: "the largest house site",
      elevFt: golden.point!.elevFt,
      aboveFloorFt: golden.point!.aboveFloorFt,
      slopeDeg: golden.point!.slopeDeg,
      aspectDeg: golden.point!.aspectDeg,
    });
  });

  it("is null before the sun step, and falls back to the prototype's label without a focus", () => {
    const { point, focus, ...early } = golden;
    expect(evaluationPoint(early)).toBeNull();
    expect(evaluationPoint({ ...early, point })?.label).toBe("the largest house site");
    expect(focus).toBeDefined();
  });
});

describe("verdictView", () => {
  it("while running: 'Screening…' and the worst flag so far", () => {
    const { verdict, cancelled, ...partial } = golden;
    const v = verdictView({ ...partial, flags: [{ lvl: "warn", t: "x" }] } as PartialScreenResult);
    expect(v).toMatchObject({ lead: "Screening…", tone: "marginal" });
    expect([verdict, cancelled]).toBeDefined();
  });

  it("after a cancelled run with failed steps", () => {
    const v = verdictView({ ...golden, verdict: "marginal", cancelled: true, failed: ["near", "drive"] });
    expect(v.lead).toBe("Worth a drive, eyes open. (run cancelled)");
    expect(v.incomplete).toBe(
      "Incomplete: find hospitals, groceries, trailheads, route drive times didn't run, so this verdict is missing that evidence.",
    );
  });
});

describe("terrainView", () => {
  it("marks the largest house site (relaxed) when the run lowered the house threshold", () => {
    const relaxed = terrainView({ ...golden, houseMinUsed: golden.params.houseMin - 10 })!;
    expect(relaxed.rows.find((r) => r.label.startsWith("Largest house site"))?.label).toBe(
      "Largest house site (relaxed)",
    );
    expect(terrainView(golden)!.rows.some((r) => r.label === "Largest house site")).toBe(true);
  });
});

describe("horizonChart", () => {
  it("labels north at x = 0, then E, S, W every 90° (B11: the prototype labelled x = 0 'E')", () => {
    expect(horizonChart(golden.sun!.profile, 36.9).labels).toEqual([
      { x: 0, text: "N" },
      { x: 90, text: "E" },
      { x: 180, text: "S" },
      { x: 270, text: "W" },
    ]);
  });

  it("draws no sun path where the December sun doesn't rise", () => {
    expect(horizonChart([[0, 0]], 80).sunPath).toBe("");
  });
});
