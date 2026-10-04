// Integrity of the recorded fixtures: they come from the committed prototype build, every recorded run
// completed, and the HAR can answer the prototype's own requests offline.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FIXTURE_SLUGS, loadFixture } from "./support/fixtures";

const legacy = readFileSync(resolve(import.meta.dirname, "..", "legacy", "parcelscreen.html"), "utf8");
const legacyBuild = /name="parcelscreen-build" content="([^"]+)"/.exec(legacy)?.[1];

describe.each(FIXTURE_SLUGS)("fixture %s", (slug) => {
  const fx = loadFixture(slug);

  it("was recorded from the committed prototype build", () => {
    expect(fx.input.prototypeBuild).toBe(legacyBuild);
  });

  it("has a parcel polygon from the county service", () => {
    expect(fx.input.polygon.geometry.type).toBe("Polygon");
    expect(fx.input.props.PARCELID).toBe(slug.endsWith("52-47A") ? "52-47A" : "35-3");
  });

  it("recorded only complete runs (no failed or skipped steps)", () => {
    for (const [name, steps] of Object.entries(fx.input.steps)) {
      expect(
        steps.filter((s) => !s.startsWith("done")),
        name,
      ).toEqual([]);
    }
    for (const [name, golden] of Object.entries(fx.goldens)) {
      expect(golden?.failed, name).toEqual([]);
    }
  });

  it("replays the parcel lookup and the 3DEP elevation request offline", async () => {
    const f = fx.replayFetch();
    const dem = fx.har.log.entries.find((e) =>
      e.request.url.includes("/3DEPElevation/ImageServer/exportImage"),
    );
    expect(dem, "a recorded 3DEP request").toBeDefined();
    const tiff = await f(dem!.request.url);
    expect(tiff.status).toBe(200);
    // GeoTIFF magic: "II*\0" (little-endian) or "MM\0*".
    const head = [...new Uint8Array(await tiff.arrayBuffer()).slice(0, 4)];
    expect([
      [73, 73, 42, 0],
      [77, 77, 0, 42],
    ]).toContainEqual(head);
  });
});

describe("golden coverage", () => {
  it("Ferney Creek has the plain run, the setHouse re-evaluation and the house-marked re-run", () => {
    const { goldens, input } = loadFixture("ferney-creek-52-47A");
    expect(Object.keys(goldens).sort()).toEqual(["houseRun", "run", "setHouse"]);
    expect(input.house?.distanceM).toBeGreaterThan(0);
    expect((goldens.houseRun as { house?: unknown }).house).toBeTruthy();
  });

  it("Macks Mountain has the plain run and the re-evaluation at site #2", () => {
    const { goldens, input } = loadFixture("macks-mountain-35-3");
    expect(Object.keys(goldens).sort()).toEqual(["evaluateSite2", "run"]);
    expect((goldens.evaluateSite2 as { focus?: { label: string } }).focus?.label).toBe("site #2");
    expect(input.evaluateSite2?.label).toBe("site #2");
  });
});
