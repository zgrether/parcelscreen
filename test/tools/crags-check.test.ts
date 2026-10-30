/**
 * The climbing areas' parking check (roadmap step 17, docs/plans/step-17-climbing.md §2.3), live, on the runners
 * (places.yml's `crags` job; this repo's cloud sessions can't reach Overpass):
 *
 *   pnpm data:crags-check     for each entry in lib/screen/data/crags.json, OSM's parking lots within 1.5 km of its
 *                             lot and OSM's climbing features within 3 km, nearest first, to test-results/crags-check.md
 *
 * Nothing is written to the list: the lot is picked by hand from what this finds, and cited as `parkingFrom`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { distance } from "@turf/turf";
import { describe, expect, it } from "vitest";
import cragsJson from "@/lib/screen/data/crags.json";
import { createHttpClient } from "@/lib/http";
import { at, overpass, type OsmElement } from "@/lib/places/bake";
import { parseCrags, type CragEntry } from "@/lib/places/crags";

const live = () =>
  (globalThis as unknown as Record<symbol, typeof fetch>)[Symbol.for("parcelscreen.liveFetch")]!;

const PARKING_M = 1500;
const CLIMBING_M = 3000;
const SHOWN = 4;

const query = ([lat, lon]: CragEntry["parking"]) =>
  `[out:json][timeout:90];(nwr(around:${PARKING_M},${lat},${lon})[amenity=parking];` +
  `nwr(around:${CLIMBING_M},${lat},${lon})[climbing];nwr(around:${CLIMBING_M},${lat},${lon})[sport=climbing];);out center tags;`;

function line(c: CragEntry, e: OsmElement): { m: number; text: string } | null {
  const ll = at(e);
  if (!ll) return null;
  const m = Math.round(
    distance([c.parking[1], c.parking[0]], [ll[1], ll[0]], { units: "kilometers" }) * 1000,
  );
  const t = e.tags ?? {};
  const what = t.amenity === "parking" ? "parking" : `climbing=${t.climbing ?? "yes"}`;
  const name = t.name ? ` "${t.name}"` : "";
  return { m, text: `${what}${name} ${e.type}/${e.id} at ${ll[0].toFixed(5)}, ${ll[1].toFixed(5)}, ${m} m` };
}

describe.runIf(import.meta.env.MODE === "crags-check")("check the climbing areas' lots against OSM", () => {
  it("lists each entry's nearest lots and climbing features", async () => {
    const http = createHttpClient({
      env: "node",
      fetchImpl: live(),
      userAgent: "parcelscreen-data/1 (crags check; https://github.com/zgrether/parcelscreen)",
    });
    const out = ["# Climbing areas: OSM's lots and climbing features near each entry", ""];
    let none = 0;
    for (const c of parseCrags(cragsJson)) {
      let rows: { m: number; text: string; parking: boolean }[] = [];
      try {
        rows = (await overpass(query(c.parking), { http }))
          .map((e) => {
            const l = line(c, e);
            return l && { ...l, parking: e.tags?.amenity === "parking" };
          })
          .filter((r): r is NonNullable<typeof r> => !!r)
          .sort((a, b) => a.m - b.m);
      } catch (e) {
        out.push(`## ${c.name} (${c.id})`, "", `- Overpass didn't answer: ${String(e)}`, "");
        continue;
      }
      const lots = rows.filter((r) => r.parking).slice(0, SHOWN);
      const climbing = rows.filter((r) => !r.parking).slice(0, SHOWN);
      if (!lots.length) none++;
      out.push(
        `## ${c.name} (${c.id})`,
        "",
        `Listed lot ${c.parking.join(", ")} (${c.parkingFrom})`,
        "",
        ...(lots.length ? lots.map((r) => `- ${r.text}`) : ["- no OSM parking within 1.5 km"]),
        ...climbing.map((r) => `- ${r.text}`),
        "",
      );
      console.log(`${c.id}: ${lots.length} lots, ${climbing.length} climbing features`);
    }
    out.splice(2, 0, `${none} entries with no OSM parking within 1.5 km.`, "");
    mkdirSync(join(process.cwd(), "test-results"), { recursive: true });
    writeFileSync(join(process.cwd(), "test-results", "crags-check.md"), out.join("\n") + "\n");
    console.log(out.join("\n"));
    expect(out.length).toBeGreaterThan(2);
  }, 3_600_000);
});
