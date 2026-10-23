/**
 * The hand-checked ER additions (owner, #298 answers, 2026-10-23): each carries its source and date. Since §9.69 they
 * join CMS's list for parcel screens as for areas (hospitals.test.ts tests how).
 */
import { describe, expect, it } from "vitest";
import ADDITIONS from "./data/er-additions.json";
import { ErAdditionsSchema, loadHospitals } from "./hospitals";

describe("the ER additions", () => {
  it("the committed list passes its schema, each entry with its source and date; Stuart Community is on it", () => {
    const list = ErAdditionsSchema.parse(ADDITIONS).hospitals;
    expect(list.map((h) => h.name)).toContain("Stuart Community Hospital");
    expect(list.find((h) => h.name === "Stuart Community Hospital")!.er).toBe(true);
    // Unicoi County Hospital closed after Helene; its replacement broke ground in August 2026 (owner).
    expect(list.some((h) => /unicoi/i.test(h.name))).toBe(false);
  });

  it("the ERs a parcel screen times carry Stuart Community, once", async () => {
    const ers = (await loadHospitals())!;
    expect(ers.filter((h) => /stuart community/i.test(h.name))).toHaveLength(1);
  });
});
