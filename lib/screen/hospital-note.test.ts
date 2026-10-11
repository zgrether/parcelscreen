/**
 * The note " — emergency department not listed in OpenStreetMap" belongs to the hospital row only (owner, #82):
 * not the stored hospital list, the map, search, the copied summary, or the snapshot's own de-duplication. Since
 * schema v3 (B2a) the result stores the status (`er`), and the report's row appends the note (driveName).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { depsFor, runFixture } from "../../test/support/scenarios";
import { gettingThereView } from "../report/surroundings";
import { ER_NOT_LISTED, NEAREST_HOSPITAL } from "./driveList";
import { loadHospitalSnapshot, type HospitalSnapshot } from "./hospitals";
import { summaryText } from "./summary";

describe("the emergency note (A2c)", () => {
  it("a whole screen with no hospital listed as emergency=yes: the status is stored, the note is on the row only", async () => {
    const real = (await loadHospitalSnapshot())!;
    // The same snapshot with every emergency tag removed, so the chosen hospital gets the note.
    const untagged: HospitalSnapshot = {
      ...real,
      hospitals: real.hospitals.map(({ tags: { emergency: _e, ...tags }, ...h }) => ({ ...h, tags })),
    };
    const deps = { ...depsFor("ferney-creek-52-47A"), hospitals: async () => untagged };
    const { result } = await runFixture("ferney-creek-52-47A", {}, deps);
    const hospital = result.drives!.find((d) => d.label === NEAREST_HOSPITAL)!;
    expect([hospital.name, hospital.er]).toEqual(["Carilion New River Valley Medical Center", "not-listed"]);
    expect(JSON.stringify(result)).not.toContain(ER_NOT_LISTED.trim());
    const row = gettingThereView(result)!.drives.find((d) => d.label === NEAREST_HOSPITAL)!;
    expect(row.name).toBe(`Carilion New River Valley Medical Center${ER_NOT_LISTED}`);
    expect(result.near!.hospitals.every((h) => !h.name.includes("emergency department"))).toBe(true);
    expect(summaryText(result)).not.toContain("emergency department");
  });

  it("only the report's row writes it: no map, search, tooltip or snapshot code names it", () => {
    const users: string[] = [];
    const walk = (dir: string) => {
      for (const n of readdirSync(dir)) {
        const p = join(dir, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (
          /\.(ts|tsx|mts)$/.test(n) &&
          !/\.test\./.test(n) &&
          readFileSync(p, "utf8").includes("ER_NOT_LISTED")
        )
          users.push(p.replace(/\\/g, "/"));
      }
    };
    for (const d of ["lib", "components", "app", "scripts"]) walk(d);
    expect(users.sort()).toEqual(["lib/screen/driveList.ts"]);
  });
});
