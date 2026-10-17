/**
 * WF6's parity (docs/plans/wf6-reroute.md §6): a reroute gives what a full run gives with the same lines and choice, on
 * all three fixtures, and composes with a moved house as the app does it. F(lines, choice) is a full run, R a reroute of
 * a finished run, H a moved house. The worker's own cases (a reroute after a moved house, two in quick succession) are
 * in worker-protocol.test.ts.
 */
import { centroid, destination, lineOffset, lineString } from "@turf/turf";
import { describe, expect, it } from "vitest";
import { ZACH } from "@/test/support/rubrics";
import { flagsOf } from "./flags";
import { expectedOf } from "@/test/support/expected";
import { loadFixture, type FixtureSlug } from "@/test/support/fixtures";
import { redGate, toTheBoundary } from "@/test/support/redGate";
import { depsFor, runFixture } from "@/test/support/scenarios";
import { reportCard, TIMED_TO_THE_TRAILHEAD } from "../report/card";
import { DEFAULT_ENDPOINTS } from "./config";
import { TRAILHEAD_PARKING } from "./driveList";
import { reroute, setHouse, type ScreenDeps, type ScreenOutput } from "./index";
import type { DrawnInput, ScreenResult } from "./types";
import type { LatLon } from "./util";

/** A result as JSON, its run time aside: what parity compares. */
const plain = (r: ScreenResult) => JSON.parse(JSON.stringify({ ...r, runAt: "" })) as unknown;
const F = async (slug: FixtureSlug, lines: DrawnInput[], drivewayLine: string | null = null) =>
  runFixture(slug, { lines, ...(drivewayLine ? { drivewayLine } : {}) });

/** The fixture's offline deps, with every request's host noted from `reset()` on (#140 review: what a reroute asks). */
function counted(slug: FixtureSlug, extra: Partial<ScreenDeps> = {}) {
  let hosts: string[] = [];
  const deps = {
    ...depsFor(
      slug,
      (f) =>
        ((input: string | URL | Request, init?: RequestInit) => {
          hosts.push(new URL(input instanceof Request ? input.url : String(input)).host);
          return f(input, init);
        }) as typeof fetch,
    ),
    ...extra,
  };
  return { deps, hosts: () => hosts, reset: () => void (hosts = []) };
}
const OSRM = new URL(DEFAULT_ENDPOINTS.osrm).host;
const OVERPASS = new Set(DEFAULT_ENDPOINTS.overpass.map((u) => new URL(u).host));
const failingParking = async (): Promise<never> => {
  throw new Error("Overpass didn't answer");
};

/** A 60 m track through the parcel's middle, off any road: a line the driveway may follow but can't start from. */
function middleTrack(slug: FixtureSlug, id = "mid"): DrawnInput {
  const c = centroid(loadFixture(slug).input.polygon).geometry.coordinates as [number, number];
  const a = destination(c, 30, -60, { units: "meters" }).geometry.coordinates;
  const b = destination(c, 30, 120, { units: "meters" }).geometry.coordinates;
  return { id, kind: "track", line: [a, b].map(([lon, lat]): LatLon => [lat!, lon!]), widthFt: null };
}
/** The same line, moved `m` metres sideways. */
const shifted = (l: DrawnInput, m: number): DrawnInput => ({
  ...l,
  line: (
    lineOffset(lineString(l.line.map(([lat, lon]) => [lon, lat])), m, { units: "meters" }).geometry
      .coordinates as [number, number][]
  ).map(([lon, lat]): LatLon => [lat, lon]),
});

const LINES: Record<FixtureSlug, DrawnInput> = {
  "ferney-creek-52-47A": middleTrack("ferney-creek-52-47A"),
  "macks-mountain-35-3": middleTrack("macks-mountain-35-3"),
  "grayson-mud-creek-6273": toTheBoundary(redGate),
};

describe("a reroute = a full run with the same lines (§6.1)", () => {
  for (const slug of Object.keys(LINES) as FixtureSlug[])
    it(slug, async () => {
      const before = await F(slug, []);
      const after = await reroute(before, [LINES[slug]], null);
      expect(plain(after.result)).toEqual(plain((await F(slug, [LINES[slug]])).result));
    });
});

describe("with a moved house (§6.2): reroute, then move the house", () => {
  it("ferney-creek-52-47A: H(h) after R(L1) after F([]) = H(h) after F(L1)", async () => {
    const h = loadFixture("ferney-creek-52-47A").input.house!.ll as LatLon;
    const L1 = [LINES["ferney-creek-52-47A"]];
    const viaReroute = await setHouse(await reroute(await F("ferney-creek-52-47A", []), L1, null), h);
    const direct = await setHouse(await F("ferney-creek-52-47A", L1), h);
    expect(plain(viaReroute.result)).toEqual(plain(direct.result));
  });
});

describe("the chosen line deleted (§6.4)", () => {
  it("R([], null) after F(L1, red gate) = F([]) = expected.json's run", async () => {
    const chosen = await F("grayson-mud-creek-6273", [LINES["grayson-mud-creek-6273"]], "red-gate");
    const after = await reroute(chosen, [], null);
    expect(plain(after.result)).toEqual(plain((await F("grayson-mud-creek-6273", [])).result));
    expect(plain(after.result)).toEqual(plain(expectedOf("grayson-mud-creek-6273", "run")));
  });
});

describe("a change that doesn't move the drive start (§6.5)", () => {
  it("ferney-creek-52-47A: the track moved 3 m; the drive step is skipped, and the result = F(L2)", async () => {
    const L0 = [LINES["ferney-creek-52-47A"]];
    const L2 = [shifted(L0[0]!, 3)];
    const c = counted("ferney-creek-52-47A");
    const before = await runFixture("ferney-creek-52-47A", { lines: L0 }, c.deps);
    c.reset();
    let parking = 0;
    const after = await reroute(before, L2, null, {
      parking: async () => {
        parking++;
        return [];
      },
    });
    // Carried over, not fetched again: the very same drives, and no request at all (#140 review).
    expect(after.result.drives).toBe(before.result.drives);
    expect(parking).toBe(0);
    expect(c.hosts()).toEqual([]);
    expect(plain(after.result)).toEqual(plain((await F("ferney-creek-52-47A", L2)).result));
  });
});

describe("with a choice (§6.7)", () => {
  it("R(L1, red gate) = F(L1, red gate); the drives from the red gate's road end; the engine's driveway the app's pick's", async () => {
    const L1 = [LINES["grayson-mud-creek-6273"]];
    const c = counted("grayson-mud-creek-6273");
    const none: ScreenOutput = await runFixture("grayson-mud-creek-6273", { lines: L1 }, c.deps);
    c.reset();
    const chosen = await reroute(none, L1, "red-gate");
    // The start moved: the drive step ran, on the recorded traffic for the red gate's start (pnpm record:port), and
    // asked only OSRM (the table, the route out) and Overpass (the parking).
    expect(c.hosts()).toContain(OSRM);
    expect(c.hosts().every((h) => h === OSRM || OVERPASS.has(h))).toBe(true);
    expect(chosen.result.failed).not.toContain("drive");
    expect(chosen.result.noResponse).not.toContain(TRAILHEAD_PARKING);
    expect(chosen.result.drives?.length ?? 0).toBeGreaterThan(0);
    expect(chosen.result.drives).not.toEqual(none.result.drives);
    const full = await F("grayson-mud-creek-6273", L1, "red-gate");
    expect(plain(chosen.result)).toEqual(plain(full.result));

    // Every drive from the red gate's road end, the gate (the line's first point; its entrance is the other end).
    const r = chosen.result;
    expect(r.driveFrom).toMatchObject({ kind: "drawn", line: "easement", ll: redGate.line[0] });
    expect(none.result.driveFrom!.kind).toBe("entrance"); // the app's pick's: Mud Creek Ln

    // The engine's driveway fields, flags and verdict: the app's pick's. Only the chosen route gains its track.
    const e = r.driveway!.entrances.findIndex((x) => x.source === "drawn" && x.line === 0);
    const mine = r.driveway!.routes.find((x) => x.entranceIndex === e)!;
    expect(mine.track).toBeDefined();
    const withoutTrack = {
      ...r.driveway!,
      routes: r.driveway!.routes.map((x) => {
        if (x !== mine) return x;
        const { track: _t, ...rest } = x;
        return rest;
      }),
    };
    expect(JSON.parse(JSON.stringify(withoutTrack))).toEqual(
      JSON.parse(JSON.stringify(none.result.driveway)),
    );
    expect(r.sites).toEqual(none.result.sites);
    expect(flagsOf(r).filter((f) => f.step !== "drive")).toEqual(
      flagsOf(none.result).filter((f) => f.step !== "drive"),
    );
    expect(r.driveway!.routes[0]).toEqual(none.result.driveway!.routes[0]);
  });
});

describe("the parking lookup failing (#140 review)", () => {
  it("is said the same way in a reroute and a full run: noResponse, and the Trails row's note", async () => {
    const L1 = [LINES["grayson-mud-creek-6273"]];
    const full = await runFixture(
      "grayson-mud-creek-6273",
      { lines: L1, drivewayLine: "red-gate" },
      { ...depsFor("grayson-mud-creek-6273"), parking: failingParking },
    );
    const rerouted = await reroute(await F("grayson-mud-creek-6273", L1), L1, "red-gate", {
      parking: failingParking,
    });
    expect(plain(rerouted.result)).toEqual(plain(full.result));
    expect(full.result.noResponse).toContain(TRAILHEAD_PARKING);
    // The drives still ran, to the trailhead points: the row says so, appended (rule 7), and isn't incomplete.
    const trails = reportCard(full.result, ZACH).rows.find((x) => x.key === "trails")!;
    expect(trails.detail.endsWith(`; ${TIMED_TO_THE_TRAILHEAD}`)).toBe(true);
    expect(trails.missing).toBeUndefined();
  });
});
