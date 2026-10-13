/** Where the drive times start (follow-up 54; owner, #123), appended after Getting There's caveat (rule 7). */
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import type { DriveFrom } from "../screen/types";
import { driveFromSentence, gettingThereView } from "./surroundings";

const from = (f: Partial<DriveFrom>): DriveFrom => ({
  ll: [36.58, -81.56],
  kind: "entrance",
  road: "Mud Creek Ln",
  line: null,
  gapFt: null,
  snapM: 0,
  trackMi: null,
  kept: false,
  ...f,
});

describe("where the drive times start", () => {
  it("each kind of start", () => {
    expect(driveFromSentence(from({}))).toBe("Drive times start at the driveway's entrance on Mud Creek Ln.");
    expect(driveFromSentence(from({ road: "road" }))).toBe(
      "Drive times start at the driveway's entrance on an unnamed road.",
    );
    expect(driveFromSentence(from({ kind: "drawn", road: null, line: "track" }))).toBe(
      "Drive times start where your drawn track meets the road.",
    );
    expect(driveFromSentence(from({ kind: "nearestRoad", gapFt: 240 }))).toBe(
      "Drive times start at the nearest road point, on Mud Creek Ln, 240 ft off the parcel.",
    );
    expect(driveFromSentence(from({ kind: "centre", road: null }))).toBe(
      "Drive times start at the parcel's centre: no driveway was routed.",
    );
  });

  it("what OSRM made of it: its nearest road from 100 m off, the route out's track miles", () => {
    expect(driveFromSentence(from({ snapM: 99 }))).toBe(
      "Drive times start at the driveway's entrance on Mud Creek Ln.",
    );
    expect(driveFromSentence(from({ snapM: 159.2 }))).toBe(
      "Drive times start at the driveway's entrance on Mud Creek Ln. OSRM's nearest road is 520 ft from there.",
    );
    expect(driveFromSentence(from({ trackMi: 2.6 }))).toBe(
      "Drive times start at the driveway's entrance on Mud Creek Ln. The route out starts with 2.6 mi on unnamed tracks.",
    );
  });

  it("after a moved pin or house, the drives are the last full screen's (owner, #123)", () => {
    expect(driveFromSentence(from({ kept: true }))).toBe(
      "Drive times start at the driveway's entrance on Mud Creek Ln. Drive times are from the last full screen; run again to update.",
    );
  });

  it("appended after the caveat, which stays word for word", () => {
    const v = gettingThereView(expectedOf("ferney-creek-52-47A", "run"))!;
    expect(v.caveat).toBe(
      "Drive times from OSRM's public router — fine for comparing parcels, not for catching a flight. Places come from OpenStreetMap data (via Photon); trailhead counts undercount national forest access. Roads from the Census Bureau's TIGER lines. Forest Service trailheads and state parks are included too. Drive times start at the driveway's entrance on an unnamed road. OSRM's nearest road is 520 ft from there.",
    );
  });
});
