import { describe, expect, it } from "vitest";
import { getPref, setPref, type KeyValueStore } from "./prefs";
import { loadUserConfig, saveUserConfig } from "./userConfig";
import { DEFAULT_USER_CONFIG } from "@/lib/screen/config";

const memory = (): KeyValueStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};

describe("prefs", () => {
  it("falls back to the defaults, and reads back what was written in the prototype's formats", () => {
    const s = memory();
    expect(getPref("ps.dim", s)).toBe(false); // off by default since the 13e-5 review
    expect(getPref("ps.base", s)).toBe("state");
    setPref("ps.dim", true, s);
    setPref("ps.view", { lat: 36.9, lon: -80.4, z: 15 }, s);
    expect(s.data.get("ps.dim")).toBe("1");
    expect(getPref("ps.dim", s)).toBe(true);
    // A choice saved earlier stands.
    s.data.set("ps.dim", "0");
    expect(getPref("ps.dim", s)).toBe(false);
    expect(getPref("ps.view", s)).toEqual({ lat: 36.9, lon: -80.4, z: 15 });
  });

  it("never throws: unreadable values and failing storage fall back to defaults", () => {
    const s = memory();
    s.data.set("ps.view", "{not json");
    expect(getPref("ps.view", s)).toBeNull();
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceeded");
      },
    };
    expect(getPref("ps.lines", broken)).toBe(true);
    expect(() => setPref("ps.lines", false, broken)).not.toThrow();
    expect(getPref("ps.lines", null)).toBe(true);
  });
});

describe("user config", () => {
  it("merges stored settings over the defaults and round-trips", () => {
    const s = memory();
    expect(loadUserConfig(s)).toEqual(DEFAULT_USER_CONFIG);
    saveUserConfig({ ...DEFAULT_USER_CONFIG, houseMin: 55 }, s);
    expect(loadUserConfig(s).houseMin).toBe(55);
  });

  it("replaces old endpoints and falls back to defaults on anything invalid", () => {
    const s = memory();
    s.data.set("ps.cfg", JSON.stringify({ houseMin: 50, endpoints: { _v: 3 }, dw: { stonePerTon: 40 } }));
    const c = loadUserConfig(s);
    expect(c.houseMin).toBe(50);
    expect(c.endpoints).toEqual(DEFAULT_USER_CONFIG.endpoints);
    expect(c.dw).toEqual({ ...DEFAULT_USER_CONFIG.dw, stonePerTon: 40 });
    s.data.set("ps.cfg", JSON.stringify({ houseMin: "lots" }));
    expect(loadUserConfig(s)).toEqual(DEFAULT_USER_CONFIG);
  });
});

describe("the working parcel (ps.current, step 13d)", () => {
  const ring = [
    [-81.355, 36.628],
    [-81.353, 36.628],
    [-81.353, 36.63],
    [-81.355, 36.628],
  ];
  const parcel = {
    geo: {
      type: "Feature" as const,
      properties: {},
      geometry: { type: "Polygon" as const, coordinates: [ring] },
    },
    props: { PARCELID: "52-47A", OWNER: "Someone" },
    source: "https://vginmaps.vdem.virginia.gov/x",
    multiPart: false,
  };

  it("round-trips the parcel, a combination's members, and the house", () => {
    const s = memory();
    expect(getPref("ps.current", s)).toBeNull();
    const combined = {
      ...parcel,
      source: "combined",
      members: [parcel, { ...parcel, props: { PARCELID: "52-42" } }],
    };
    setPref("ps.current", { parcel: combined, house: [36.629, -81.354] }, s);
    expect(getPref("ps.current", s)).toEqual({ parcel: combined, house: [36.629, -81.354] });
    setPref("ps.current", null, s);
    expect(getPref("ps.current", s)).toBeNull();
  });

  it("drops anything stale or malformed instead of loading it", () => {
    const s = memory();
    for (const bad of [
      "{not json",
      JSON.stringify({ v: 2, parcel: null, house: null }),
      JSON.stringify({
        v: 1,
        parcel: { ...parcel, geo: { type: "Feature", geometry: { type: "Point" } } },
        house: null,
      }),
      JSON.stringify({ v: 1, parcel: null, house: [123, 456] }),
    ]) {
      s.data.set("ps.current", bad);
      expect(getPref("ps.current", s)).toBeNull();
    }
  });
});
