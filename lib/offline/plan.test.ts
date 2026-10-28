import { describe, expect, it } from "vitest";
import { isKept, OFFLINE_LAYERS } from "@/components/Map/offlineLayers";
import { aboutMb, planSave, type SaveInput } from "./plan";

// A 100-ac parcel in Floyd County, VA: well inside Virginia, far from NC's and TN's aerials.
const PARCEL = { west: -80.33, south: 36.91, east: -80.32, north: 36.918 };
const SERVICES = [
  { url: "https://nc.example/FeatureServer/1", inState: false },
  { url: "https://va.example/FeatureServer/0", inState: true },
];

const input = (over: Partial<SaveInput> = {}): SaveInput => ({
  parcel: PARCEL,
  layers: OFFLINE_LAYERS.filter(isKept),
  parcelServices: SERVICES,
  places: { path: "/places/v1", cells: { osm: ["36_-81", "37_-81", "40_-75"], official: ["36_-81"] } },
  averages: {},
  ...over,
});

describe("what Save offline downloads", () => {
  it("takes each saved layer's tiles in the box, and only the parcel's state's aerial", () => {
    const plan = planSave(input());
    const layers = new Set(plan.items.map((i) => i.layer));
    expect([...layers].sort()).toEqual(
      [
        "light-pollution",
        "mvum-roads",
        "mvum-trails",
        "parcel-lines",
        "places",
        "public-land-coarse",
        "public-land-fine",
        "relief",
        "slope",
        "state-va",
        "terrarium",
        "usgs-imagery",
        "usgs-topo",
      ].sort(),
    );
    // Esri is never saved.
    expect(layers.has("esri")).toBe(false);
    const va = plan.items.filter((i) => i.layer === "state-va");
    // Zooms 12–18 over about 1.7 km: a few hundred tiles, not thousands.
    expect(va.length).toBeGreaterThan(50);
    expect(va.length).toBeLessThan(400);
    expect(plan.items.filter((i) => i.layer === "light-pollution")).toHaveLength(1);
  });

  it("takes public land's zoom-9 tile and zoom-11 tiles for the box (step 16, plan §5)", () => {
    const items = planSave(input()).items;
    const coarse = items.filter((i) => i.layer === "public-land-coarse");
    const fine = items.filter((i) => i.layer === "public-land-fine");
    expect(coarse).toHaveLength(1);
    expect(fine.length).toBeGreaterThanOrEqual(1);
    expect(fine.length).toBeLessThanOrEqual(4);
    expect(coarse[0]!.kind === "get" && new URL(coarse[0]!.url).searchParams.get("maxAllowableOffset")).toBe(
      "0.00275",
    );
  });

  it("asks every parcel-line service for the box's zoom-14 tiles at both details", () => {
    const parcel = planSave(input()).items.filter((i) => i.kind === "parcel");
    const tiles = new Set(parcel.map((i) => (i.kind === "parcel" ? `${i.tile.x}/${i.tile.y}` : "")));
    expect(parcel).toHaveLength(SERVICES.length * tiles.size * 2);
    // Out of the parcel's state, an empty answer.
    const nc = parcel.find((i) => i.kind === "parcel" && i.serviceUrl.startsWith("https://nc."))!;
    expect(nc.bytes).toBe(1024);
  });

  it("takes the places index and the cells within 0.6° that exist", () => {
    const urls = planSave(input())
      .items.filter((i) => i.layer === "places")
      .map((i) => (i.kind === "get" ? i.url : ""));
    expect(urls.sort()).toEqual(
      [
        "/places/v1/index.json",
        // 36.91° + 0.6° reaches the 37° row; 40_-75 is far off.
        "/places/v1/osm/36_-81.json",
        "/places/v1/osm/37_-81.json",
        "/places/v1/official/36_-81.json",
      ].sort(),
    );
  });

  it("counts the terrain tiles in the estimate (owner, #358): Terrarium at 12–15, Mapterhorn's relief at 13–16", () => {
    const plan = planSave(input());
    const terrain = plan.items.filter((i) => i.layer === "terrarium" || i.layer === "relief");
    expect(terrain.length).toBeGreaterThan(10);
    const terrainBytes = terrain.reduce((n, i) => n + i.bytes, 0);
    const without = planSave(input({ layers: OFFLINE_LAYERS.filter((l) => isKept(l) && !l.elevation) }));
    expect(plan.bytes - without.bytes).toBe(terrainBytes);
  });

  it("estimates from this device's averages where it has them", () => {
    const typical = planSave(input()).bytes;
    const big = planSave(input({ averages: { "state-va": 1_000_000 } })).bytes;
    expect(big).toBeGreaterThan(typical);
    expect(aboutMb(1)).toBe(5);
    expect(aboutMb(21 * 1024 * 1024)).toBe(25);
  });
});
