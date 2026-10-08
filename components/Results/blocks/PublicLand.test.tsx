/**
 * The public-land block with land beyond the mile (follow-up 23, owner 2026-10-08): the within-a-mile list keeps
 * to 1,600 m, and one line names the nearest land open to visitors beyond it, only when none is open within.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  designationName,
  managerName,
  PADUS_DESIGNATIONS,
  PADUS_MANAGERS,
  publicLandView,
} from "@/lib/report/surroundings";
import type { PartialScreenResult } from "@/lib/screen/types";
import { PublicLand } from "./PublicLand";

type Unit = NonNullable<PartialScreenResult["protected"]>[number];
const MILE_FT = 1600 * 3.28084;
const u = (name: string, access: string, distFt: number | null, adjoins = false, manager = "USFS"): Unit => ({
  name,
  manager,
  type: "NF",
  access,
  gap: "3",
  adjoins,
  distFt,
});
const view = (units: Unit[]) => publicLandView({ protected: units } as PartialScreenResult)!;
const LINE = (name: string, manager: string, mi: string) =>
  `Nearest public land open to visitors beyond a mile: ${name} (${manager}), ${mi} mi straight-line.`;

describe("public land beyond the mile", () => {
  it("a unit beyond the mile never appears under 'Public land within a mile'", () => {
    const v = view([
      u("Land Fund", "RA", 3411),
      u("Edge of the mile", "RA", MILE_FT), // exactly 1,600 m: within
      u("Jefferson National Forest", "OA", 2.26 * 5280),
      u("Just beyond", "RA", MILE_FT + 1),
    ]);
    expect(v.units.map((x) => x.name)).toEqual(["Land Fund", "Edge of the mile"]);
  });

  it("adjoining units and units the mile's query couldn't measure stay in the list", () => {
    const v = view([u("Scout Camp", "RA", null, true), u("Odd geometry", "RA", null)]);
    expect(v.units.map((x) => x.name)).toEqual(["Scout Camp", "Odd geometry"]);
  });

  it("names the nearest open land beyond the mile, in the owner's words, when none is open within it", () => {
    const v = view([
      u("Land Fund", "RA", 3411),
      u("Old Flat State Forest", "OA", 2.44 * 5280, false, "SDNR"),
      u("Jefferson National Forest", "OA", 2.26 * 5280),
    ]);
    expect(v.beyond).toBe(LINE("Jefferson National Forest", "U.S. Forest Service", "2.3"));
  });

  it("of two copies at the same distance, names the one whose manager is known", () => {
    const v = view([
      u("Buffalo Mountain Preserve", "OA", 5.31 * 5280, false, "UNK"),
      u("Buffalo Mountain Preserve", "OA", 5.31 * 5280, false, "SDC"),
    ]);
    expect(v.beyond).toBe(LINE("Buffalo Mountain Preserve", "State Department of Conservation", "5.3"));
  });

  it("no line when land open to visitors is within the mile, or adjoins", () => {
    expect(view([u("Park", "OA", 2000), u("Far Forest", "OA", 4 * 5280)]).beyond).toBeNull();
    expect(view([u("Park", "OA", null, true), u("Far Forest", "OA", 4 * 5280)]).beyond).toBeNull();
  });

  it("no line for a result without wider units (screened before Batch A, or the wider query failed)", () => {
    expect(view([u("Land Fund", "RA", 3411)]).beyond).toBeNull();
    expect(view([]).beyond).toBeNull();
  });

  it("the block shows the line after the caveat, and the list without the far unit", () => {
    const result = {
      protected: [
        u("Land Fund", "RA", 3411, false, "UNK"),
        u("Jefferson National Forest", "OA", 2.26 * 5280),
      ],
    } as PartialScreenResult;
    const html = renderToStaticMarkup(<PublicLand result={result} point={null} variant="panel" />);
    const caveat = html.indexOf("Conservation easements on private land");
    const line = html.indexOf(LINE("Jefferson National Forest", "U.S. Forest Service", "2.3"));
    expect(caveat).toBeGreaterThan(0);
    expect(line).toBeGreaterThan(caveat);
    expect(html.slice(0, caveat)).not.toContain("Jefferson");
  });
});

describe("manager names (owner, 2026-10-08): never a bare code", () => {
  it("a local name as it is; a code as its agency; an empty or unknown one as 'manager unknown'", () => {
    expect(managerName("Forest Service Region 08 Southern")).toBe("Forest Service Region 08 Southern");
    expect(managerName("USFS")).toBe("U.S. Forest Service");
    expect(managerName("NPS")).toBe("National Park Service"); // PAD-US sometimes has a code as the local name
    expect(managerName("SDC")).toBe("State Department of Conservation");
    expect(managerName("UNK")).toBe("manager unknown");
    expect(managerName(" ")).toBe("manager unknown");
    expect(managerName(null)).toBe("manager unknown");
    expect(managerName("ZZZ")).toBe("manager unknown"); // an unlisted code is still a bare code
  });

  it("no code in the list prints as itself", () => {
    for (const [code, name] of Object.entries(PADUS_MANAGERS)) expect(name).not.toBe(code);
  });

  it("the line never shows a bare code", () => {
    const v = view([u("Buffalo Mountain Preserve", "OA", 5.31 * 5280, false, "UNK")]);
    expect(v.beyond).toBe(LINE("Buffalo Mountain Preserve", "manager unknown", "5.3"));
  });
});

describe("the within-a-mile list names codes (an approved exception to rule 7, phase-0.md §9.18)", () => {
  it("manager and designation by name, never a bare code", () => {
    const v = view([
      u("Game Land", "OA", 3000, false, "UNK"),
      { ...u("Jefferson NF", "OA", null, true, "USFS"), type: "NF" },
    ]);
    expect(v.units.map((x) => x.meta)).toEqual([
      "(manager unknown, National Forest)",
      "(U.S. Forest Service, National Forest)",
    ]);
  });
  it("designations: the service's names, and an unknown one as 'designation unknown'", () => {
    expect(designationName("SOTH")).toBe("State Other or Unknown");
    expect(designationName("SP")).toBe("State Park");
    expect(designationName("ZZ")).toBe("designation unknown");
    expect(designationName(null)).toBe("designation unknown");
    for (const [code, name] of Object.entries(PADUS_DESIGNATIONS)) expect(name).not.toBe(code);
  });
});
