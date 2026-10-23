/**
 * Mud Creek's port recording gains Tennessee's TREC answer in step 2 and nothing else changes (owner, 2026-10-17):
 * live data has drifted since September, so the fixture isn't re-recorded; `PORT_APPEND=grayson-mud-creek-6273
 * pnpm record:port` adds the missing requests only. The 28 entries recorded before step 2 are pinned here by the hash
 * of their serialization, and every entry after them must be one of the step's new requests. Step 11 appends the same
 * way: OSRM's table for the drive to the nearest long trail (lib/screen/longTrail.ts).
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

/** What step 11 may add: OSRM's table for the long-trail drives. */
const ADDED_11 = /^https:\/\/router\.project-osrm\.org\/table\/v1\/driving\//;

/**
 * The flaky-count fix (2026-10-22): Photon's reverse lookups at the point the e2e's import asks from. Unrecorded, they
 * fell to the server's Overpass route, which reached the live mirrors: a slow one failed "near", 4 sources, not 3.
 */
const ADDED_E2E = /^https:\/\/photon\.komoot\.io\/reverse\?lat=36\.58540768065242&lon=-81\.56344520266869&/;

describe("Mud Creek's port HAR (step 2: append only)", () => {
  const entries = (JSON.parse(readFileSync(PATH, "utf8")) as Har).log.entries;

  it("keeps the entries recorded before step 2 byte for byte", () => {
    const before = entries.slice(0, BEFORE.entries);
    expect(createHash("sha256").update(JSON.stringify(before)).digest("hex")).toBe(BEFORE.sha256);
  });

  it("adds only Tennessee's TREC requests after them, then step 11's long-trail drives, then the e2e point's Photon", () => {
    const added = entries.slice(BEFORE.entries);
    expect(added.length).toBeGreaterThan(0);
    const trec = added.filter((e) => ADDED.test(e.request.url));
    expect(trec.length).toBeGreaterThan(0);
    // Each step's after the last's: TREC's first, then OSRM's table, then the e2e point's two Photon lookups.
    expect(added.slice(0, trec.length)).toEqual(trec);
    const rest = added.slice(trec.length);
    const osrm = rest.filter((e) => ADDED_11.test(e.request.url));
    expect(osrm.length).toBeGreaterThan(0);
    expect(rest.slice(0, osrm.length)).toEqual(osrm);
    const photon = rest.slice(osrm.length);
    expect(photon).toHaveLength(2);
    for (const e of photon) expect(e.request.url).toMatch(ADDED_E2E);
  });
});
