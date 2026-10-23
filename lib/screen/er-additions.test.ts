/**
 * The hand-checked ER additions (owner, #298 answers, 2026-10-23): each carries its source and date; merged over the
 * OSM snapshot, one within 1 km replaces that hospital's name and ER flag, one with none near is added.
 */
import { describe, expect, it } from "vitest";
import ADDITIONS from "./data/er-additions.json";
import { ErAdditionsSchema, loadHospitalSnapshot, withAdditions, type HospitalSnapshot } from "./hospitals";

const snapshot: HospitalSnapshot = {
  generatedAt: "2026-10-09",
  source: "test",
  hospitals: [
    { id: "a", name: "Old Name", lat: 36.0, lon: -81.0, tags: { amenity: "hospital", emergency: "yes" } },
    { id: "b", name: "Other", lat: 36.5, lon: -81.5, tags: { amenity: "hospital" } },
  ],
};
const add = (name: string, ll: [number, number], er: boolean) => ({
  name,
  ll,
  er,
  source: "https://example.org/news",
  checked: "2026-10-23",
});

describe("the ER additions", () => {
  it("the committed list passes its schema, each entry with its source and date; Stuart Community is on it", () => {
    const list = ErAdditionsSchema.parse(ADDITIONS).hospitals;
    expect(list.map((h) => h.name)).toContain("Stuart Community Hospital");
    expect(list.find((h) => h.name === "Stuart Community Hospital")!.er).toBe(true);
    // Unicoi County Hospital closed after Helene; its replacement broke ground in August 2026 (owner).
    expect(list.some((h) => /unicoi/i.test(h.name))).toBe(false);
  });

  it("within 1 km: the snapshot's hospital takes the addition's name and ER flag", () => {
    const out = withAdditions(snapshot, [add("New Name", [36.003, -81.002], false)]);
    expect(out.hospitals).toHaveLength(2);
    expect(out.hospitals[0]).toMatchObject({ id: "a", name: "New Name", tags: { emergency: "no" } });
  });

  it("with none near: added, with its ER flag", () => {
    const out = withAdditions(snapshot, [add("Reopened", [36.2, -80.2], true)]);
    expect(out.hospitals).toHaveLength(3);
    expect(out.hospitals[2]).toMatchObject({
      name: "Reopened",
      lat: 36.2,
      lon: -80.2,
      tags: { emergency: "yes" },
    });
  });

  it("the loaded snapshot carries Stuart Community with an ER, once", async () => {
    const s = (await loadHospitalSnapshot())!;
    const stuart = s.hospitals.filter((h) => /stuart community/i.test(h.name));
    expect(stuart).toHaveLength(1);
    expect(stuart[0]!.tags.emergency).toBe("yes");
  });
});
