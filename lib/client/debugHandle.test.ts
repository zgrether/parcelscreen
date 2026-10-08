import { afterEach, describe, expect, it, vi } from "vitest";
import type { PartialScreenResult } from "@/lib/screen/types";
import { publishPosted, type DebugHandle } from "./debugHandle";

const handle = () => (globalThis as unknown as { window: { __psDebug?: DebugHandle } }).window.__psDebug;

function browserWith(debug: string | null) {
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", { getItem: (k: string) => (k === "ps.debug" ? debug : null) });
}

afterEach(() => vi.unstubAllGlobals());

describe("the debug handle (18a)", () => {
  const result = { verdict: "ok", sites: [{ rank: 1, ll: [36.9, -80.4] }] } as unknown as PartialScreenResult;

  it("publishes a frozen copy of the posted result, with ps.debug set", () => {
    browserWith("1");
    publishPosted(result);
    const h = handle()!;
    expect(h.posted).toEqual(result);
    expect(h.posted).not.toBe(result); // a copy: the app's own object stays mutable
    expect(Object.isFrozen(h)).toBe(true);
    expect(Object.isFrozen(h.posted)).toBe(true);
    expect(Object.isFrozen((h.posted as unknown as { sites: { ll: number[] }[] }).sites[0]!.ll)).toBe(true);
    expect(Object.isFrozen(result)).toBe(false);
  });

  it("does nothing without ps.debug", () => {
    browserWith(null);
    publishPosted(result);
    expect(handle()).toBeUndefined();
  });
});
