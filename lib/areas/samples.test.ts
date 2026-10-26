/**
 * The sample parcels (step 13 plan §5, §10): two per area, each passing its schema, 10–30 acres, of the current
 * ScreenResult shape and a current engine (so a clean break can't strand them: `pnpm areas:samples` redoes them), and
 * carrying no owner, address or parcel number (phase-0.md §9.23).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ENGINE_CURRENT_FROM } from "@/lib/screen/engine";
import { SCREEN_SCHEMA_VERSION } from "../screen/types";
import { AREAS } from "./catalog";
import { SAMPLE_FILE_VERSION, SampleFileSchema } from "./types";

const dir = join(process.cwd(), "public", "areas", `v${SAMPLE_FILE_VERSION}`, "samples");
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
/** Keys a parcel service's owner or address fields go by, in any case. */
const OWNER =
  /"(owner|own_name|ownname|owner1|owner_name|mail_?addr|site_?addr|siteaddress|parcel_?id|pin|parno)"/i;

describe("the sample parcels", () => {
  it("two for every area", () => {
    for (const a of AREAS) {
      expect(files, a.id).toContain(`${a.id}-1.json`);
      expect(files, a.id).toContain(`${a.id}-2.json`);
    }
  });

  it.each(files)("%s: its schema, 10–30 acres, a current screen, no owner fields", (f) => {
    const text = readFileSync(join(dir, f), "utf8");
    const s = SampleFileSchema.parse(JSON.parse(text));
    expect(f).toBe(`${s.area}-${s.n}.json`);
    expect(s.acres).toBeGreaterThanOrEqual(10);
    expect(s.acres).toBeLessThanOrEqual(30);
    expect(s.result.schemaVersion).toBe(SCREEN_SCHEMA_VERSION);
    expect(s.result.engine).toBeGreaterThanOrEqual(ENGINE_CURRENT_FROM);
    expect(text).not.toMatch(OWNER);
  });
});
