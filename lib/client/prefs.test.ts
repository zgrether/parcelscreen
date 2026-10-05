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
    expect(getPref("ps.dim", s)).toBe(true);
    expect(getPref("ps.base", s)).toBe("state");
    setPref("ps.dim", false, s);
    setPref("ps.view", { lat: 36.9, lon: -80.4, z: 15 }, s);
    expect(s.data.get("ps.dim")).toBe("0");
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
