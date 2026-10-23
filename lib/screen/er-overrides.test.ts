/**
 * The hand-checked ER overrides (owner, #298 answers and #300): each carries its source and date; "open" adds an ER
 * CMS doesn't list yet, "closed" takes one of CMS's off. Parcel screens and areas both read them (hospitals.test.ts
 * tests how).
 */
import { describe, expect, it } from "vitest";
import OVERRIDES from "./data/er-overrides.json";
import { ErOverridesSchema, loadHospitals } from "./hospitals";

describe("the ER overrides", () => {
  it("the committed list passes its schema, each entry with its source and date; Stuart Community is open", () => {
    const list = ErOverridesSchema.parse(OVERRIDES).hospitals;
    expect(list.find((h) => h.name === "Stuart Community Hospital")!.status).toBe("open");
    // Unicoi County Hospital closed after Helene and isn't on CMS's list: nothing to override (owner).
    expect(list.some((h) => /unicoi/i.test(h.name))).toBe(false);
  });

  it("the ERs a parcel screen times carry Stuart Community, once", async () => {
    const ers = (await loadHospitals())!;
    expect(ers.filter((h) => /stuart community/i.test(h.name))).toHaveLength(1);
  });
});
