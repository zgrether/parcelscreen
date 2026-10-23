/**
 * The thirty areas (step 13 plan §2): each has a unique id, a name, two lines that describe the place without a
 * number that can go stale, and an outline that's valid, inside the catalog's extent and of a sensible size; the
 * outlines file holds exactly the catalog's areas.
 */
import { area, bbox, booleanPointInPolygon, kinks, point } from "@turf/turf";
import { describe, expect, it } from "vitest";
import { AREAS } from "./catalog";
import { CATALOG_BOX } from "./extent";
import { loadOutlines, outlineOf } from "./outlines";

const SQ_M_PER_SQ_MI = 2_589_988;

describe("the catalog", () => {
  it("thirty areas, each id unique and file-safe", () => {
    expect(AREAS).toHaveLength(30);
    expect(new Set(AREAS.map((a) => a.id)).size).toBe(30);
    for (const a of AREAS) expect(a.id).toMatch(/^[a-z0-9-]+$/);
  });

  it("two lines each, about the place: no distances, heights, times or shares", () => {
    for (const a of AREAS)
      for (const line of a.description) {
        expect(line.length).toBeGreaterThan(10);
        expect(line.length).toBeLessThanOrEqual(100);
        expect(line).not.toMatch(/\d+\s*(ft|feet|mi|miles|min|minutes|%|°|hours?)\b/i);
      }
  });
});

describe("the outlines", () => {
  it("one per area, in the catalog's order", async () => {
    expect((await loadOutlines()).features.map((f) => f.properties.id)).toEqual(AREAS.map((a) => a.id));
  });

  it("valid, inside the catalog's extent, between 20 and 600 square miles", async () => {
    const [s, w, n, e] = CATALOG_BOX;
    for (const f of (await loadOutlines()).features) {
      const [minX, minY, maxX, maxY] = bbox(f);
      expect([minY >= s, minX >= w, maxY <= n, maxX <= e]).toEqual([true, true, true, true]);
      expect(kinks(f).features).toHaveLength(0);
      const mi2 = area(f) / SQ_M_PER_SQ_MI;
      expect(mi2).toBeGreaterThan(20);
      expect(mi2).toBeLessThan(600);
    }
  });

  it("Mud Creek's fixture is in Grayson Highlands (the CI recording overlaps it, plan §10)", async () => {
    const mud = point([-81.56344520266869, 36.58540768065242]);
    expect(booleanPointInPolygon(mud, await outlineOf("grayson-highlands"))).toBe(true);
    expect(booleanPointInPolygon(mud, await outlineOf("whitetop-konnarock"))).toBe(false);
  });
});
