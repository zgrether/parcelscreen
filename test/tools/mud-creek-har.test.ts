/**
 * Mud Creek's port recording gains Tennessee's TREC answer in step 2 and nothing else changes (owner, 2026-10-17):
 * live data has drifted since September, so the fixture isn't re-recorded; `PORT_APPEND=grayson-mud-creek-6273
 * pnpm record:port` adds the missing requests only. The 28 entries recorded before step 2 are pinned here by the hash
 * of their serialization, and every entry after them must be one of the step's new requests.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Har } from "../support/replayFetch";

const PATH = join(process.cwd(), "test", "fixtures", "grayson-mud-creek-6273", "network-port.har");
/** Before step 2: the entry count and the sha256 of JSON.stringify(entries). */
const BEFORE = { entries: 28, sha256: "45a0f70fb3d641288895ac030c5982c0f315655d44b3a20755240c34ba6ced48" };
/** What step 2 may add: the TREC trails layer (lib/screen/trailheads.ts). */
const ADDED =
  /^https:\/\/services1\.arcgis\.com\/YuVBSS7Y1of2Qud1\/arcgis\/rest\/services\/Tennessee_Statewide_Trails_Lines_Public\//;

describe("Mud Creek's port HAR (step 2: append only)", () => {
  const entries = (JSON.parse(readFileSync(PATH, "utf8")) as Har).log.entries;

  it("keeps the entries recorded before step 2 byte for byte", () => {
    const before = entries.slice(0, BEFORE.entries);
    expect(createHash("sha256").update(JSON.stringify(before)).digest("hex")).toBe(BEFORE.sha256);
  });

  it("adds only Tennessee's TREC requests after them", () => {
    const added = entries.slice(BEFORE.entries);
    expect(added.length).toBeGreaterThan(0);
    for (const e of added) expect(e.request.url).toMatch(ADDED);
  });
});
