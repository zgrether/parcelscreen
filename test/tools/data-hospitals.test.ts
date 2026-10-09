/** `pnpm data:hospitals`: how Overpass's elements become the snapshot (Batch A A2c). */
import { describe, expect, it } from "vitest";
import { shapeHospitals } from "../../scripts/data-hospitals.mjs";

describe("the snapshot script's shaping", () => {
  it("one per OSM id; same-named copies within 300 m merged, keeping the emergency=yes one; else both kept", () => {
    const out = shapeHospitals([
      {
        type: "way",
        id: 2,
        center: { lat: 36.6, lon: -81.5 },
        tags: { amenity: "hospital", name: "Ashe Memorial", emergency: "yes" },
      },
      {
        type: "node",
        id: 1,
        lat: 36.6005,
        lon: -81.5,
        tags: { healthcare: "hospital", name: "ASHE MEMORIAL" },
      }, // 56 m, same name
      // 49 m from each other but different hospitals (Carilion Saint Albans, psychiatric, beside NRV Medical Center)
      {
        type: "way",
        id: 3,
        center: { lat: 37.0, lon: -80.5 },
        tags: { amenity: "hospital", name: "Saint Albans", emergency: "no" },
      },
      {
        type: "way",
        id: 4,
        center: { lat: 37.00044, lon: -80.5 },
        tags: { amenity: "hospital", name: "NRV Medical Center", emergency: "yes" },
      },
      { type: "relation", id: 5, tags: { amenity: "hospital", name: "No position" } },
    ]);
    expect(out.map((h) => [h.id, h.name, h.tags.emergency])).toEqual([
      ["way/2", "Ashe Memorial", "yes"],
      ["way/3", "Saint Albans", "no"],
      ["way/4", "NRV Medical Center", "yes"],
    ]);
  });
});
