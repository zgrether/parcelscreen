/** The area catalog's boulder share (docs/plans/boulders.md §2): SDA's points query, and the share from its rows. */
import { describe, expect, it } from "vitest";
import { boulderShareOf, pointSoilsQuery } from "./boulders";

describe("pointSoilsQuery", () => {
  it("one lookup per point, [lon lat], numbered from where the batch starts", () => {
    const q = pointSoilsQuery(
      [
        [36.6, -81.5],
        [36.7, -81.4],
      ],
      100,
    );
    expect(q).toContain(
      "SELECT 100 AS i, mukey FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('point(-81.5 36.6)')",
    );
    expect(q).toContain(
      "UNION ALL SELECT 101 AS i, mukey FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('point(-81.4 36.7)')",
    );
    expect(q).toContain("c.majcompflag = 'Yes'");
  });
});

describe("boulderShareOf", () => {
  const row = (i: number, muname: string, compname: string | null) => ({
    i,
    mukey: String(i),
    muname,
    compname,
  });
  it("a point counts once, by its unit's name or any major component's", () => {
    const rows = [
      row(0, "Tate loam, 7 to 15 percent slopes", "Tate"),
      row(1, "Ashe-Chestnut complex, 25 to 45 percent slopes, very stony", "Ashe"),
      row(1, "Ashe-Chestnut complex, 25 to 45 percent slopes, very stony", "Chestnut"),
      row(2, "Chandler-Ashe complex, 25 to 45 percent slopes", "Chandler"),
      row(2, "Chandler-Ashe complex, 25 to 45 percent slopes", "Rock outcrop"),
      row(3, "Edneyville loam, stony", "Edneyville"),
    ];
    expect(boulderShareOf(rows)).toBe(0.5);
  });
  it("null when no point has a map unit", () => {
    expect(boulderShareOf([])).toBeNull();
  });
});
