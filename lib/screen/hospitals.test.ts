/** Hospitals from the committed OSM snapshot (Batch A A2c, owner 2026-10-09). */
import { describe, expect, it } from "vitest";
import type { HttpClient } from "../http";
import { DEFAULT_ENDPOINTS, SCREEN_CONSTANTS } from "./config";
import { driveTimes } from "./drive";
import { ER_NOT_LISTED, NEAREST_HOSPITAL } from "./driveList";
import {
  hospitalCandidates,
  loadHospitalSnapshot,
  type HospitalCandidate,
  type HospitalSnapshot,
} from "./hospitals";
import type { LatLon } from "./util";

const GRAYSON: LatLon = [36.5854, -81.5632];

describe("the committed snapshot", () => {
  it("loads, parses, and covers the three states with emergency status", async () => {
    const s = (await loadHospitalSnapshot())!;
    expect(s).not.toBeNull();
    expect(s.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(s.source).toContain("OpenStreetMap");
    expect(s.hospitals.length).toBeGreaterThan(300);
    expect(new Set(s.hospitals.map((h) => h.id)).size).toBe(s.hospitals.length);
    expect(s.hospitals.every((h) => h.tags.amenity === "hospital" || h.tags.healthcare === "hospital")).toBe(
      true,
    );
    expect(s.hospitals.some((h) => h.tags.emergency === "yes")).toBe(true);
  });

  it("candidates: the name filter, within hospitalKm, nearest first, er from emergency=yes only", () => {
    const h = (id: string, name: string, lat: number, emergency?: string) => ({
      id,
      name,
      lat,
      lon: GRAYSON[1],
      tags: { amenity: "hospital", ...(emergency ? { emergency } : {}) },
    });
    const snap: HospitalSnapshot = {
      generatedAt: "2026-10-09",
      source: "OpenStreetMap",
      hospitals: [
        h("way/1", "Far Regional", GRAYSON[0] + 0.3, "yes"), // ~33 km
        h("way/2", "Near Community", GRAYSON[0] + 0.1, "no"), // ~11 km
        h("way/3", "Behavioral Health Center", GRAYSON[0] + 0.05, "yes"), // excludeHospital
        h("way/4", "Beyond", GRAYSON[0] + 0.6), // ~67 km > hospitalKm
        h("node/5", "", GRAYSON[0] + 0.2), // unnamed, no tag
      ],
    };
    expect(SCREEN_CONSTANTS.near.hospitalKm).toBe(60);
    expect(hospitalCandidates(snap, GRAYSON).map((c) => [c.name, c.er])).toEqual([
      ["Near Community", false],
      ["Hospital", false],
      ["Far Regional", true],
    ]);
  });
});

describe("the hospital drive: emergency=yes preferred (A2c)", () => {
  /** OSRM answering each destination (by its latitude) with the minutes given. */
  const osrm = (minutesByLat: Record<string, number>): HttpClient => ({
    fetch: async (url) => {
      const lat = /;-?[\d.]+,(-?[\d.]+)\?/.exec(url)![1]!;
      const min = minutesByLat[lat];
      return Response.json(
        min === undefined ? { code: "NoRoute" } : { routes: [{ duration: min * 60, distance: min * 900 }] },
      );
    },
  });
  const cand = (name: string, lat: number, er: boolean | undefined): HospitalCandidate => ({
    name,
    ll: [lat, -81.5],
    km: lat,
    ...(er === undefined ? {} : { er }),
  });
  const near = { hospitals: [], grocers: [], trailheads: [], trailheadCount: 0 };
  const run = (pool: HospitalCandidate[], minutes: Record<string, number>) =>
    driveTimes(GRAYSON, near, [], { http: osrm(minutes), endpoints: DEFAULT_ENDPOINTS }, { hospitals: pool });

  it("routes only the emergency hospitals when there are any, though a nearer one isn't", async () => {
    const d = await run([cand("Clinic", 1, false), cand("Ashe", 2, true), cand("Twin County", 3, true)], {
      "1": 15,
      "2": 30,
      "3": 40,
    });
    expect(d.map((x) => [x.label, x.name, x.min])).toEqual([[NEAREST_HOSPITAL, "Ashe", 30]]);
  });

  it("none listed with an emergency department: the quickest of the nearest, with the note appended", async () => {
    const d = await run([cand("Clinic", 1, false), cand("Annex", 2, false)], { "1": 15, "2": 12 });
    expect(ER_NOT_LISTED).toBe(" — emergency department not listed in OpenStreetMap");
    expect(d.map((x) => x.name)).toEqual([`Annex${ER_NOT_LISTED}`]);
  });

  it("status unknown (no snapshot): by distance as before, nothing appended", async () => {
    const d = await run([cand("Clinic", 1, undefined), cand("Annex", 2, undefined)], { "1": 15, "2": 12 });
    expect(d.map((x) => x.name)).toEqual(["Annex"]);
  });
});
