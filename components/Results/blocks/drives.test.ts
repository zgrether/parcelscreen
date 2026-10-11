/**
 * The closer grocery is an annotation of the grocery row, never a destination (owner, #81 review). Since schema v3
 * it has its own field, `closerGrocery` (B2a; phase-0.md §9.20 (d)); an anchor named like it is a destination.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { GettingThere } from "./GettingThere";
import { gettingThereView } from "@/lib/report/surroundings";
import { CLOSER_GROCERY, REAL_GROCERY, splitDrives, type DriveEntry } from "@/lib/screen/driveList";
import { summaryText } from "@/lib/screen/summary";
import type { PartialScreenResult, ScreenResult } from "@/lib/screen/types";

const DRIVES: DriveEntry[] = [
  { label: "Nearest hospital", name: "Twin County", min: 40, mi: 25.1, er: "yes" },
  { label: REAL_GROCERY, name: "Food Lion", min: 38, mi: 24, er: null },
  { label: "Airport", name: "", min: 90, mi: 70.2, er: null },
  // An anchor the user named like the annotation: a destination.
  { label: CLOSER_GROCERY, name: "", min: 55, mi: 40, er: null },
];
const CLOSER: DriveEntry = { label: CLOSER_GROCERY, name: "Lansing Foods", min: 21, mi: 9, er: null };

describe("the drive list (owner, #81 review)", () => {
  it("splitDrives: every destination (an anchor of the same label too) in order, and the closer grocery", () => {
    const { destinations, closer } = splitDrives({ drives: DRIVES, closerGrocery: CLOSER });
    expect(destinations.map((d) => [d.label, d.name])).toEqual([
      ["Nearest hospital", "Twin County"],
      [REAL_GROCERY, "Food Lion"],
      ["Airport", ""],
      [CLOSER_GROCERY, ""],
    ]);
    expect(closer?.name).toBe("Lansing Foods");
    expect(splitDrives({ drives: DRIVES, closerGrocery: null }).closer).toBeNull();
    expect(splitDrives({ drives: DRIVES }).closer).toBeNull();
  });

  it("Getting There, iterating its rows: each destination once; the closer store only on the grocery row", () => {
    const r = { drives: DRIVES, closerGrocery: CLOSER } as PartialScreenResult;
    const rows = gettingThereView(r)!.drives;
    expect(rows.map((d) => d.label)).toEqual(["Nearest hospital", REAL_GROCERY, "Airport", CLOSER_GROCERY]);
    expect(rows.filter((d) => d.closer).map((d) => [d.label, d.closer])).toEqual([
      [REAL_GROCERY, "Closer: Lansing Foods, 21 min."],
    ]);
    const html = renderToStaticMarkup(
      createElement(GettingThere, { result: r, point: null, variant: "panel" }),
    );
    expect(html.split("Lansing Foods").length - 1).toBe(1); // listed once, not also as a row
    expect(html.match(/<tr>/g)?.length).toBe(4);
  });

  it("Copy summary: destinations only, so its lines are what they were", () => {
    const R = {
      acres: 30,
      verdict: "ok",
      flags: [],
      drives: DRIVES,
      closerGrocery: CLOSER,
    } as unknown as ScreenResult;
    const lines = summaryText(R).split("\n").slice(1);
    expect(lines).toEqual([
      "Nearest hospital: 40 min",
      `${REAL_GROCERY}: 38 min`,
      "Airport: 90 min",
      `${CLOSER_GROCERY}: 55 min`, // the anchor
    ]);
  });
});
