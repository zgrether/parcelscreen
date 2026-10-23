/**
 * The note " — emergency department not listed in OpenStreetMap" belongs to the hospital row only (owner, #82): not the
 * stored hospital list, the map, search, the copied summary. Since schema v3 (B2a) the result stores the status (`er`),
 * and the report's row appends the note (driveName). Since §9.69 every hospital timed is an ER, so a new screen never
 * has it; a stored one from before can.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { depsFor, runFixture } from "../../test/support/scenarios";
import { gettingThereView } from "../report/surroundings";
import { ER_NOT_LISTED, NEAREST_HOSPITAL } from "./driveList";
import { summaryText } from "./summary";

describe("the emergency note (A2c)", () => {
  it("a whole screen: the hospital timed is an ER, so its row has no note", async () => {
    const { result } = await runFixture("ferney-creek-52-47A", {}, depsFor("ferney-creek-52-47A"));
    const hospital = result.drives!.find((d) => d.label === NEAREST_HOSPITAL)!;
    expect(hospital.er).toBe("yes");
    const row = gettingThereView(result)!.drives.find((d) => d.label === NEAREST_HOSPITAL)!;
    expect(row.name).toBe(hospital.name);
    expect(JSON.stringify(result)).not.toContain(ER_NOT_LISTED.trim());
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
