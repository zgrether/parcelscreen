/**
 * The ERs the drive step times (the ER follow-up, owner 2026-10-23; phase-0.md §9.69): CMS's hospitals with an
 * emergency department and the hand-checked additions, the list the area catalog times. OpenStreetMap's are never timed.
 */
import HOSPITALS_OSM from "./data/hospitals.json";
import { HOSPITAL_SNAPSHOT_MARKER } from "./hospitalsMarker";
import { describe, expect, it } from "vitest";
import type { HttpClient } from "../http";
import { DEFAULT_ENDPOINTS, SCREEN_CONSTANTS } from "./config";
import { driveTimes } from "./drive";
import { driveName, ER_NOT_LISTED, NEAREST_HOSPITAL } from "./driveList";
import {
  erPlaces,
  hospitalCandidates,
  loadErLists,
  loadHospitals,
  type ErList,
  type ErPlace,
  type HospitalCandidate,
} from "./hospitals";
import type { LatLon } from "./util";

const GRAYSON: LatLon = [36.5854, -81.5632];
const km = ([a, b]: LatLon, [c, d]: LatLon) =>
  Math.hypot((c - a) * 111.2, (d - b) * 111.32 * Math.cos((a * Math.PI) / 180));

describe("the committed list", () => {
  it("loads, parses, and covers the three states; its chunk is found by the marker", async () => {
    const [list] = await loadErLists();
    expect(list.source).toContain(HOSPITAL_SNAPSHOT_MARKER); // how the precache leaves its chunk out
    expect(list.hospitals.length).toBeGreaterThan(700);
    expect(new Set(list.hospitals.map((h) => h.id)).size).toBe(list.hospitals.length);
    for (const st of ["VA", "NC", "TN"]) expect(list.hospitals.some((h) => h.state === st)).toBe(true);
    // Never one whose emergency room isn't open to everyone.
    expect(list.hospitals.some((h) => /psychiatric|childrens|veterans|defense/i.test(h.type))).toBe(false);
    const ers = (await loadHospitals())!;
    expect(ers.length).toBe(list.hospitals.length + 1); // Stuart Community, from the additions
  });

  it("candidates: the name filter, within hospitalKm, nearest first, every one an ER", () => {
    const at = (name: string, dLat: number): ErPlace => ({ name, ll: [GRAYSON[0] + dLat, GRAYSON[1]] });
    const places = [
      at("Far Regional", 0.3), // ~33 km
      at("Near Community", 0.1), // ~11 km
      at("Behavioral Health Center", 0.05), // excludeHospital
      at("Beyond", 0.6), // ~67 km > hospitalKm
    ];
    expect(SCREEN_CONSTANTS.near.hospitalKm).toBe(60);
    expect(hospitalCandidates(places, GRAYSON).map((c) => [c.name, c.er])).toEqual([
      ["Near Community", true],
      ["Far Regional", true],
    ]);
  });

  it("an addition without an ER takes CMS's hospital near it off; one with an ER CMS lacks is added", () => {
    const list = {
      hospitals: [
        { id: "1", name: "Open", city: "", state: "VA", type: "", ll: [36, -81] as LatLon },
        { id: "2", name: "Closed since", city: "", state: "VA", type: "", ll: [36.5, -81] as LatLon },
      ],
    } as ErList;
    const add = (name: string, ll: LatLon, er: boolean) => ({
      name,
      ll,
      er,
      source: "https://example.org",
      checked: "2026-10-23",
    });
    expect(
      erPlaces(list, [
        add("Closed since", [36.5004, -81.0004], false),
        add("Reopened", [36.2, -80.2], true),
      ]).map((p) => p.name),
    ).toEqual(["Open", "Reopened"]);
  });
});

describe("a closed hospital absent from CMS and not in the additions is never timed (owner, 2026-10-23)", () => {
  // Unicoi County Hospital, Erwin: closed after Helene (its replacement broke ground in August 2026). OpenStreetMap
  // still has it (amenity=hospital, access=no, no emergency tag); CMS's list doesn't, and neither do the additions.
  const unicoi = HOSPITALS_OSM.hospitals.find((h) => h.name === "Unicoi County Hospital")!;
  const UNICOI: LatLon = [unicoi.lat, unicoi.lon];
  const ERWIN: LatLon = [36.1451, -82.4168];

  it("isn't on the list the drive step reads", async () => {
    expect(unicoi).toBeDefined();
    const ers = (await loadHospitals())!;
    expect(ers.some((h) => km(h.ll, UNICOI) <= 1)).toBe(false);
    expect(hospitalCandidates(ers, ERWIN).some((h) => km(h.ll, UNICOI) <= 1)).toBe(false);
  });

  it("from Erwin, where it's the nearest hospital, OSRM is never asked the way there", async () => {
    const asked: string[] = [];
    const http: HttpClient = {
      fetch: async (url) => {
        asked.push(url);
        // A table answer: every destination 20 minutes away.
        const n = url.split(";").length - 1;
        return Response.json({
          code: "Ok",
          durations: [Array.from({ length: n }, () => 1200)],
          distances: [Array.from({ length: n }, () => 15000)],
          routes: [{ duration: 1200, distance: 15000 }],
        });
      },
    };
    const pool = hospitalCandidates((await loadHospitals())!, ERWIN);
    const near = { hospitals: [], grocers: [], trailheads: [], trailheadCount: 0 };
    const { drives } = await driveTimes(
      ERWIN,
      near,
      [],
      { http, endpoints: DEFAULT_ENDPOINTS },
      { hospitals: pool },
    );
    const h = drives.find((d) => d.label === NEAREST_HOSPITAL)!;
    expect(h.er).toBe("yes");
    expect(h.name).not.toMatch(/unicoi/i);
    // Every point OSRM was asked about, from each request's path ("lon,lat;lon,lat…").
    const points = asked.flatMap((u) =>
      [...new URL(u).pathname.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m): LatLon => [
        Number(m[2]),
        Number(m[1]),
      ]),
    );
    expect(points.length).toBeGreaterThan(1);
    expect(points.some((p) => km(p, UNICOI) <= 1)).toBe(false);
  });
});

describe("psychiatric and rehabilitation hospitals (owner, #82)", () => {
  it("Carilion Saint Albans (psychiatric, beside NRV Medical Center) is never a candidate from Ferney Creek", async () => {
    const ers = (await loadHospitals())!;
    expect(ers.some((h) => /saint albans/i.test(h.name))).toBe(false);
    const from = hospitalCandidates(ers, [36.8872, -80.4535]).map((c) => c.name);
    expect(from).toContain("Carilion New River Valley Medical Center");
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
  const run = async (pool: HospitalCandidate[], minutes: Record<string, number>) =>
    (
      await driveTimes(
        GRAYSON,
        near,
        [],
        { http: osrm(minutes), endpoints: DEFAULT_ENDPOINTS },
        { hospitals: pool },
      )
    ).drives;

  it("routes only the emergency hospitals when there are any, though a nearer one isn't", async () => {
    const d = await run([cand("Clinic", 1, false), cand("Ashe", 2, true), cand("Twin County", 3, true)], {
      "1": 15,
      "2": 30,
      "3": 40,
    });
    expect(d.map((x) => [x.label, x.name, x.min, x.er])).toEqual([[NEAREST_HOSPITAL, "Ashe", 30, "yes"]]);
  });

  it("none listed with an emergency department: the quickest of the nearest, with the note on the report", async () => {
    const d = await run([cand("Clinic", 1, false), cand("Annex", 2, false)], { "1": 15, "2": 12 });
    expect(ER_NOT_LISTED).toBe(" — emergency department not listed in OpenStreetMap");
    // v3 (B2a): the status is its own field; the report appends the note (driveName), as v2 stored it.
    expect(d.map((x) => [x.name, x.er])).toEqual([["Annex", "not-listed"]]);
    expect(d.map(driveName)).toEqual([`Annex${ER_NOT_LISTED}`]);
  });

  it("status unknown (no snapshot): by distance as before, nothing appended", async () => {
    const d = await run([cand("Clinic", 1, undefined), cand("Annex", 2, undefined)], { "1": 15, "2": 12 });
    expect(d.map((x) => [x.name, x.er])).toEqual([["Annex", "unknown"]]);
    expect(d.map(driveName)).toEqual(["Annex"]);
  });
});
